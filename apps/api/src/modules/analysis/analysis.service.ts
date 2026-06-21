import { BadRequestException, Injectable } from '@nestjs/common';
import { AnalysisDecision, ProposalStatus, RiskBand } from '@prisma/client';
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

  private async hasActiveDelinquency(customerId: string): Promise<boolean> {
    const count = await this.prisma.contract.count({
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

    const customer = proposal.customer;
    const delinquency = await this.hasActiveDelinquency(customer.id);
    const ageYears = customer.birthDate ? yearsBetween(customer.birthDate, new Date()) : undefined;

    const result = evaluateCredit(
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

    const analysis = await this.prisma.creditAnalysis.upsert({
      where: { proposalId },
      create: {
        proposalId,
        decision: result.decision as AnalysisDecision,
        score: result.score,
        riskBand: result.riskBand as RiskBand,
        suggestedLimit: result.suggestedLimit,
        approvedAmount: result.approvedAmount,
        reasons: result.reasons,
        policyVersion: result.policyVersion,
        automatic: true,
        analystId: actorId,
      },
      update: {
        decision: result.decision as AnalysisDecision,
        score: result.score,
        riskBand: result.riskBand as RiskBand,
        suggestedLimit: result.suggestedLimit,
        approvedAmount: result.approvedAmount,
        reasons: result.reasons,
        policyVersion: result.policyVersion,
        automatic: true,
        analystId: actorId,
      },
    });

    // Propagate the engine decision to the proposal lifecycle.
    if (result.decision === 'APPROVED') {
      await this.proposals.changeStatus(proposalId, ProposalStatus.APPROVED, actorId, 'Auto-approved by policy');
    } else if (result.decision === 'REJECTED') {
      await this.proposals.changeStatus(proposalId, ProposalStatus.REJECTED, actorId, result.reasons.join('; '));
    }
    // MANUAL_REVIEW keeps the proposal UNDER_REVIEW for a human decision.

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

    const analysis = await this.prisma.creditAnalysis.upsert({
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
    );

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
