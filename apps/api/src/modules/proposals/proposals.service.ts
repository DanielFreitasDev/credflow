import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AmortizationType, Prisma, ProposalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { buildPagination, paginatedResponse, resolveOrderBy } from '../../common/utils/pagination.util';
import { buildSequentialNumber, retryOnUniqueViolation } from '../../common/utils/sequence.util';
import { clampCet, computeCet, isNonAmortizing, simulate } from '../../domain/finance/finance';
import { estimateIofCents } from '../../domain/finance/fees';
import { centsToDecimal, centsToReais, reaisToCents } from '../../domain/finance/money';
import { EncryptionService } from '../../common/crypto/encryption.service';
import {
  CreateProposalDto,
  ProposalQueryDto,
  SimulateProposalDto,
} from './dto/proposal.dto';

const TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  DRAFT: ['UNDER_REVIEW', 'CANCELLED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['CONTRACTED', 'CANCELLED'],
  REJECTED: [],
  CANCELLED: [],
  CONTRACTED: [],
};

@Injectable()
export class ProposalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly encryption: EncryptionService,
  ) {}

  /** Core math shared by simulate() and create(). Works in integer cents. */
  private compute(dto: SimulateProposalDto) {
    const requestedCents = reaisToCents(dto.requestedAmount);
    const iofCents =
      dto.iofAmount != null
        ? reaisToCents(dto.iofAmount)
        : dto.autoIof === false
          ? 0
          : estimateIofCents(requestedCents, dto.termMonths);
    const tacCents = dto.tacAmount != null ? reaisToCents(dto.tacAmount) : 0;
    const financedCents = requestedCents + iofCents + tacCents;

    const sim = simulate({
      principalCents: financedCents,
      monthlyRate: Number(dto.interestRate),
      termMonths: dto.termMonths,
      amortization: dto.amortizationType as AmortizationType,
    });

    if (dto.amortizationType === 'PRICE' && isNonAmortizing(sim.schedule)) {
      throw new BadRequestException(
        'A taxa é alta demais para o prazo: as parcelas não amortizam o principal. Reduza a taxa ou aumente o prazo.',
      );
    }

    const cet = computeCet(requestedCents, sim.schedule.map((s) => s.amount));

    return {
      requestedCents,
      iofCents,
      tacCents,
      financedCents,
      installmentCents: sim.firstInstallmentCents,
      totalAmountCents: sim.totalAmountCents,
      totalInterestCents: sim.totalInterestCents,
      // Clamp to the persisted Decimal(12,6) CET domain so a high-rate product
      // can never overflow the column (Postgres 22003) on create.
      cetMonthly: clampCet(cet.monthly),
      cetAnnual: clampCet(cet.annual),
      schedule: sim.schedule,
    };
  }

  /** Stateless simulation for the UI (no persistence). */
  simulate(dto: SimulateProposalDto) {
    const c = this.compute(dto);
    return {
      amortizationType: dto.amortizationType,
      interestRate: Number(dto.interestRate),
      termMonths: dto.termMonths,
      requestedAmount: centsToReais(c.requestedCents),
      iofAmount: centsToReais(c.iofCents),
      tacAmount: centsToReais(c.tacCents),
      financedAmount: centsToReais(c.financedCents),
      installmentAmount: centsToReais(c.installmentCents),
      totalAmount: centsToReais(c.totalAmountCents),
      totalInterest: centsToReais(c.totalInterestCents),
      cetMonthly: round6(c.cetMonthly),
      cetAnnual: round6(c.cetAnnual),
      schedule: c.schedule.map((s) => ({
        number: s.number,
        dueOffsetMonths: s.number,
        principal: centsToReais(s.principal),
        interest: centsToReais(s.interest),
        amount: centsToReais(s.amount),
        balance: centsToReais(s.balance),
      })),
    };
  }

  async create(dto: CreateProposalDto, actorId?: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (customer.status === 'BLOCKED') {
      throw new BadRequestException('Customer is blocked and cannot receive new proposals');
    }

    const c = this.compute(dto);
    const year = new Date().getFullYear();

    const proposal = await retryOnUniqueViolation(async () => {
      const count = await this.prisma.creditProposal.count({
        where: { number: { startsWith: `PRO-${year}-` } },
      });
      const number = buildSequentialNumber('PRO', year, count + 1);

      return this.prisma.creditProposal.create({
        data: {
          number,
          customerId: dto.customerId,
          status: ProposalStatus.DRAFT,
          amortizationType: dto.amortizationType,
          requestedAmount: centsToDecimal(c.requestedCents),
          termMonths: dto.termMonths,
          interestRate: Number(dto.interestRate),
          purpose: dto.purpose,
          iofAmount: centsToDecimal(c.iofCents),
          tacAmount: centsToDecimal(c.tacCents),
          financedAmount: centsToDecimal(c.financedCents),
          installmentAmount: centsToDecimal(c.installmentCents),
          totalAmount: centsToDecimal(c.totalAmountCents),
          totalInterest: centsToDecimal(c.totalInterestCents),
          cetMonthly: round6(c.cetMonthly),
          cetAnnual: round6(c.cetAnnual),
          createdById: actorId,
          events: {
            create: { toStatus: ProposalStatus.DRAFT, changedById: actorId },
          },
        },
      });
    });

    await this.audit.record({
      userId: actorId,
      action: 'CREATE',
      entity: 'CreditProposal',
      entityId: proposal.id,
      after: { number: proposal.number, requestedAmount: Number(proposal.requestedAmount) },
    });
    return proposal;
  }

  async findAll(query: ProposalQueryDto) {
    const { skip, take, page, pageSize } = buildPagination(query);
    const where: Prisma.CreditProposalWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.search
        ? {
            OR: [
              { number: { contains: query.search, mode: 'insensitive' } },
              { customer: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.creditProposal.findMany({
        where,
        skip,
        take,
        orderBy: resolveOrderBy(query.sortBy, ['createdAt', 'number', 'requestedAmount', 'status'], query.sortOrder),
        include: {
          customer: { select: { id: true, name: true, document: true, type: true } },
          analysis: { select: { decision: true, riskBand: true, score: true } },
        },
      }),
      this.prisma.creditProposal.count({ where }),
    ]);
    data.forEach((p) => this.encryption.decryptDocumentField(p.customer));
    return paginatedResponse(data, total, page, pageSize);
  }

  async findOne(id: string) {
    const proposal = await this.prisma.creditProposal.findUnique({
      where: { id },
      include: {
        customer: true,
        analysis: { include: { analyst: { select: { id: true, name: true } } } },
        contract: { select: { id: true, number: true, status: true } },
        events: {
          orderBy: { createdAt: 'asc' },
          include: { changedBy: { select: { id: true, name: true } } },
        },
      },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    this.encryption.decryptDocumentField(proposal.customer);

    // Recompute the amortization schedule for display from stored terms.
    const sim = simulate({
      principalCents: reaisToCents(proposal.financedAmount),
      monthlyRate: Number(proposal.interestRate),
      termMonths: proposal.termMonths,
      amortization: proposal.amortizationType,
    });

    return {
      ...proposal,
      schedule: sim.schedule.map((s) => ({
        number: s.number,
        principal: centsToReais(s.principal),
        interest: centsToReais(s.interest),
        amount: centsToReais(s.amount),
        balance: centsToReais(s.balance),
      })),
    };
  }

  /** Raw record for use by other modules (analysis, contracts). */
  async findRaw(id: string) {
    const proposal = await this.prisma.creditProposal.findUnique({
      where: { id },
      include: { customer: true, analysis: true },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    return proposal;
  }

  submit(id: string, actorId?: string) {
    return this.changeStatus(id, ProposalStatus.UNDER_REVIEW, actorId, 'Submitted for analysis');
  }

  cancel(id: string, reason?: string, actorId?: string) {
    return this.changeStatus(id, ProposalStatus.CANCELLED, actorId, reason ?? 'Cancelled');
  }

  /**
   * Validated state-machine transition with event + audit. Accepts a Prisma
   * transaction client so callers (e.g. contract creation) can make the status
   * change atomic with their own writes.
   */
  async changeStatus(
    id: string,
    toStatus: ProposalStatus,
    actorId?: string,
    reason?: string,
    client: Prisma.TransactionClient = this.prisma,
  ) {
    const proposal = await client.creditProposal.findUnique({ where: { id } });
    if (!proposal) throw new NotFoundException('Proposal not found');

    if (proposal.status === toStatus) return proposal;
    if (!TRANSITIONS[proposal.status].includes(toStatus)) {
      throw new BadRequestException(
        `Invalid transition: ${proposal.status} -> ${toStatus}`,
      );
    }

    const isDecision = (['APPROVED', 'REJECTED', 'CONTRACTED', 'CANCELLED'] as ProposalStatus[]).includes(
      toStatus,
    );
    const updated = await client.creditProposal.update({
      where: { id },
      data: {
        status: toStatus,
        decidedAt: isDecision ? new Date() : proposal.decidedAt,
        events: { create: { fromStatus: proposal.status, toStatus, reason, changedById: actorId } },
      },
    });

    await this.audit.record({
      userId: actorId,
      action: 'STATUS_CHANGE',
      entity: 'CreditProposal',
      entityId: id,
      before: { status: proposal.status },
      after: { status: toStatus, reason },
    });
    return updated;
  }
}

function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}
