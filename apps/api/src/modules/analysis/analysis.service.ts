import { BadRequestException, Injectable } from '@nestjs/common';
import { AnalysisDecision, Prisma, ProposalStatus, RiskBand } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { ProposalsService } from '../proposals/proposals.service';
import { DEFAULT_POLICY, evaluateCredit } from '../../domain/finance/credit-policy';
import { yearsBetween } from '../../common/utils/date.util';
import { DecideDto } from './dto/analysis.dto';

@Injectable()
export class AnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly proposals: ProposalsService,
    private readonly audit: AuditService,
  ) {}

  private async hasActiveDelinquency(
    customerId: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<boolean> {
    const count = await client.contract.count({
      where: {
        customerId,
        OR: [{ status: 'DEFAULTED' }, { installments: { some: { status: 'OVERDUE' } } }],
      },
    });
    return count > 0;
  }

  /** Runs the configurable rule engine and records an auditable decision. */
  async analyze(proposalId: string, actorId?: string) {
    const proposal = await this.proposals.findRaw(proposalId);
    if (proposal.status !== ProposalStatus.UNDER_REVIEW) {
      throw new BadRequestException(
        `Proposal must be UNDER_REVIEW to be analyzed (current: ${proposal.status})`,
      );
    }
    if (proposal.customer.status === 'BLOCKED') {
      throw new BadRequestException('Customer is blocked and cannot be analyzed');
    }

    const customer = proposal.customer;
    const ageYears = customer.birthDate ? yearsBetween(customer.birthDate, new Date()) : undefined;

    // Lock the proposal and re-validate status + delinquency INSIDE the tx so the
    // decision reflects committed state at decision time (TOCTOU-safe): a customer
    // who becomes delinquent — or a proposal already decided by a concurrent call —
    // mid-analysis can no longer be auto-approved. The analysis record and the
    // proposal status change also commit together.
    const { analysis, result } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CreditProposal" WHERE id = ${proposalId} FOR UPDATE`;
      const fresh = await tx.creditProposal.findUnique({ where: { id: proposalId }, select: { status: true } });
      if (!fresh || fresh.status !== ProposalStatus.UNDER_REVIEW) {
        throw new BadRequestException(
          `Proposal must be UNDER_REVIEW to be analyzed (current: ${fresh?.status ?? 'missing'})`,
        );
      }
      const delinquency = await this.hasActiveDelinquency(customer.id, tx);
      const r = evaluateCredit(
        {
          internalScore: customer.internalScore,
          monthlyIncome: Number(customer.monthlyIncome),
          requestedAmount: Number(proposal.requestedAmount),
          installmentAmount: Number(proposal.installmentAmount),
          termMonths: proposal.termMonths,
          ageYears,
          hasActiveDelinquency: delinquency,
        },
        DEFAULT_POLICY,
      );
      const data = {
        decision: r.decision as AnalysisDecision,
        score: r.score,
        riskBand: r.riskBand as RiskBand,
        suggestedLimit: r.suggestedLimit,
        approvedAmount: r.approvedAmount,
        reasons: r.reasons,
        policyVersion: r.policyVersion,
        automatic: true,
        analystId: actorId,
      };
      const a = await tx.creditAnalysis.upsert({
        where: { proposalId },
        create: { proposalId, ...data },
        update: data,
      });
      // Propagate the engine decision to the proposal lifecycle (same tx).
      if (r.decision === 'APPROVED') {
        await this.proposals.changeStatus(proposalId, ProposalStatus.APPROVED, actorId, 'Auto-approved by policy', tx);
      } else if (r.decision === 'REJECTED') {
        await this.proposals.changeStatus(proposalId, ProposalStatus.REJECTED, actorId, r.reasons.join('; '), tx);
      }
      // MANUAL_REVIEW keeps the proposal UNDER_REVIEW for a human decision.
      return { analysis: a, result: r };
    });

    await this.audit.record({
      userId: actorId,
      action: 'CREDIT_ANALYSIS',
      entity: 'CreditProposal',
      entityId: proposalId,
      after: { decision: result.decision, score: result.score, riskBand: result.riskBand },
    });

    return { ...analysis, suggestedLimit: Number(analysis.suggestedLimit) };
  }

  /** Manual override by an analyst/manager. */
  async decide(proposalId: string, dto: DecideDto, actorId?: string) {
    const proposal = await this.proposals.findRaw(proposalId);
    if (proposal.status !== ProposalStatus.UNDER_REVIEW) {
      throw new BadRequestException(
        `Proposal must be UNDER_REVIEW to receive a manual decision (current: ${proposal.status})`,
      );
    }
    if (proposal.customer.status === 'BLOCKED') {
      throw new BadRequestException('Customer is blocked; cannot record a decision');
    }

    // The approved amount is later disbursed/contracted, so it cannot exceed the
    // requested amount or be non-positive when approving.
    if (dto.decision === 'APPROVED' && dto.approvedAmount != null) {
      const requested = Number(proposal.requestedAmount);
      if (dto.approvedAmount <= 0) {
        throw new BadRequestException('approvedAmount must be greater than zero');
      }
      if (dto.approvedAmount > requested) {
        throw new BadRequestException(
          `approvedAmount (R$ ${dto.approvedAmount.toFixed(2)}) cannot exceed the requested amount (R$ ${requested.toFixed(2)})`,
        );
      }
    }

    const customer = proposal.customer;
    const ageYears = customer.birthDate ? yearsBetween(customer.birthDate, new Date()) : undefined;
    // Compute score/band for the record even on a manual decision.
    const evaluated = evaluateCredit({
      internalScore: customer.internalScore,
      monthlyIncome: Number(customer.monthlyIncome),
      requestedAmount: Number(proposal.requestedAmount),
      installmentAmount: Number(proposal.installmentAmount),
      termMonths: proposal.termMonths,
      ageYears,
    });

    const approvedAmount =
      dto.decision === 'APPROVED'
        ? (dto.approvedAmount ?? Number(proposal.requestedAmount))
        : null;

    const analysis = await this.prisma.$transaction(async (tx) => {
      // Lock + re-validate inside the tx (TOCTOU-safe): re-check status and, for an
      // approval, re-check delinquency so a manual approval can't race a
      // newly-defaulted/overdue contract that appeared after the initial read.
      await tx.$queryRaw`SELECT id FROM "CreditProposal" WHERE id = ${proposalId} FOR UPDATE`;
      const fresh = await tx.creditProposal.findUnique({ where: { id: proposalId }, select: { status: true } });
      if (!fresh || fresh.status !== ProposalStatus.UNDER_REVIEW) {
        throw new BadRequestException(
          `Proposal must be UNDER_REVIEW to receive a manual decision (current: ${fresh?.status ?? 'missing'})`,
        );
      }
      if (dto.decision === 'APPROVED' && (await this.hasActiveDelinquency(proposal.customer.id, tx))) {
        throw new BadRequestException(
          'Cannot manually approve: customer has an active delinquency (defaulted or overdue contract).',
        );
      }
      const a = await tx.creditAnalysis.upsert({
        where: { proposalId },
        create: {
          proposalId,
          decision: dto.decision,
          score: evaluated.score,
          riskBand: evaluated.riskBand as RiskBand,
          suggestedLimit: evaluated.suggestedLimit,
          approvedAmount,
          reasons: [`Decisão manual: ${dto.reason}`],
          policyVersion: evaluated.policyVersion,
          automatic: false,
          analystId: actorId,
        },
        update: {
          decision: dto.decision,
          approvedAmount,
          reasons: [`Decisão manual: ${dto.reason}`],
          automatic: false,
          analystId: actorId,
        },
      });
      await this.proposals.changeStatus(
        proposalId,
        dto.decision === 'APPROVED' ? ProposalStatus.APPROVED : ProposalStatus.REJECTED,
        actorId,
        `Manual: ${dto.reason}`,
        tx,
      );
      return a;
    });

    await this.audit.record({
      userId: actorId,
      action: 'CREDIT_DECISION_MANUAL',
      entity: 'CreditProposal',
      entityId: proposalId,
      after: { decision: dto.decision, approvedAmount, reason: dto.reason },
    });

    return { ...analysis, suggestedLimit: Number(analysis.suggestedLimit) };
  }

  async getByProposal(proposalId: string) {
    const analysis = await this.prisma.creditAnalysis.findUnique({
      where: { proposalId },
      include: { analyst: { select: { id: true, name: true } } },
    });
    return analysis;
  }
}
