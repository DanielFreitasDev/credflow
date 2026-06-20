import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContractStatus, Prisma, ProposalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { buildPagination, paginatedResponse } from '../../common/utils/pagination.util';
import { buildSequentialNumber, retryOnUniqueViolation } from '../../common/utils/sequence.util';
import { addMonths, daysBetween, startOfDay } from '../../common/utils/date.util';
import { simulate, computeLateCharges } from '../../domain/finance/finance';
import { centsToDecimal, centsToReais, reaisToCents } from '../../domain/finance/money';
import { ProposalsService } from '../proposals/proposals.service';
import { ContractQueryDto, CreateContractDto } from './dto/contract.dto';

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly proposals: ProposalsService,
    private readonly audit: AuditService,
  ) {}

  async createFromProposal(proposalId: string, dto: CreateContractDto, actorId?: string) {
    const proposal = await this.proposals.findRaw(proposalId);

    if (proposal.status !== ProposalStatus.APPROVED) {
      throw new BadRequestException('Only APPROVED proposals can be contracted');
    }
    if (!proposal.analysis || proposal.analysis.decision !== 'APPROVED') {
      throw new BadRequestException('Proposal has no approved credit analysis');
    }
    const existing = await this.prisma.contract.findUnique({ where: { proposalId } });
    if (existing) throw new ConflictException('Proposal already has a contract');

    const principalCents = reaisToCents(proposal.financedAmount);
    const sim = simulate({
      principalCents,
      monthlyRate: Number(proposal.interestRate),
      termMonths: proposal.termMonths,
      amortization: proposal.amortizationType,
    });

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const firstDueDate = dto.firstDueDate ? new Date(dto.firstDueDate) : addMonths(startDate, 1);
    const endDate = addMonths(firstDueDate, proposal.termMonths - 1);

    const year = new Date().getFullYear();
    const contract = await retryOnUniqueViolation(async () => {
      const count = await this.prisma.contract.count({
        where: { number: { startsWith: `CTR-${year}-` } },
      });
      const number = buildSequentialNumber('CTR', year, count + 1);

      return this.prisma.contract.create({
        data: {
          number,
          proposalId,
          customerId: proposal.customerId,
          status: ContractStatus.ACTIVE,
          amortizationType: proposal.amortizationType,
          principal: centsToDecimal(principalCents),
          interestRate: Number(proposal.interestRate),
          termMonths: proposal.termMonths,
          totalAmount: centsToDecimal(sim.totalAmountCents),
          totalInterest: centsToDecimal(sim.totalInterestCents),
          iofAmount: proposal.iofAmount,
          tacAmount: proposal.tacAmount,
          cetAnnual: Number(proposal.cetAnnual),
          lateFeeRate: dto.lateFeeRate ?? 0.02,
          lateInterestRate: dto.lateInterestRate ?? 0.01,
          startDate,
          firstDueDate,
          endDate,
          signedById: actorId,
          installments: {
            create: sim.schedule.map((s) => ({
              number: s.number,
              dueDate: addMonths(firstDueDate, s.number - 1),
              principalDue: centsToDecimal(s.principal),
              interestDue: centsToDecimal(s.interest),
              amountDue: centsToDecimal(s.amount),
            })),
          },
        },
        include: { installments: { orderBy: { number: 'asc' } } },
      });
    });

    // Move the proposal to CONTRACTED and activate the customer.
    await this.proposals.changeStatus(proposalId, ProposalStatus.CONTRACTED, actorId, `Contract ${contract.number} created`);
    await this.prisma.customer.updateMany({
      where: { id: proposal.customerId, status: 'PROSPECT' },
      data: { status: 'ACTIVE' },
    });

    await this.audit.record({
      userId: actorId,
      action: 'CREATE',
      entity: 'Contract',
      entityId: contract.id,
      after: { number: contract.number, principal: Number(contract.principal) },
    });

    return contract;
  }

  async findAll(query: ContractQueryDto) {
    const { skip, take, page, pageSize } = buildPagination(query);
    const where: Prisma.ContractWhereInput = {
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

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.contract.findMany({
        where,
        skip,
        take,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder },
        include: {
          customer: { select: { id: true, name: true, document: true, type: true } },
          installments: { select: { amountDue: true, amountPaid: true, status: true } },
        },
      }),
      this.prisma.contract.count({ where }),
    ]);

    const data = rows.map(({ installments, ...c }) => ({ ...c, ...summarize(installments) }));
    return paginatedResponse(data, total, page, pageSize);
  }

  async findOne(id: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        customer: true,
        proposal: { select: { id: true, number: true } },
        installments: { orderBy: { number: 'asc' } },
        payments: { orderBy: { paidAt: 'desc' }, include: { registeredBy: { select: { id: true, name: true } } } },
        collectionCase: true,
      },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    return { ...contract, summary: summarize(contract.installments) };
  }

  async getInstallments(id: string) {
    await this.ensureExists(id);
    return this.prisma.installment.findMany({ where: { contractId: id }, orderBy: { number: 'asc' } });
  }

  /** Live late-charge breakdown for one installment (used before registering a payment). */
  async previewCharges(installmentId: string, atDate?: string) {
    const installment = await this.prisma.installment.findUnique({
      where: { id: installmentId },
      include: { contract: true },
    });
    if (!installment) throw new NotFoundException('Installment not found');

    const reference = atDate ? new Date(atDate) : new Date();
    const outstandingCents = reaisToCents(installment.amountDue) - reaisToCents(installment.amountPaid);
    const daysLate =
      installment.status === 'PAID' ? 0 : Math.max(0, daysBetween(installment.dueDate, startOfDay(reference)));

    const charges = computeLateCharges(
      outstandingCents,
      daysLate,
      Number(installment.contract.lateFeeRate),
      Number(installment.contract.lateInterestRate),
    );

    return {
      installmentId,
      number: installment.number,
      dueDate: installment.dueDate,
      daysLate,
      outstanding: centsToReais(outstandingCents),
      fine: centsToReais(charges.fineCents),
      interest: centsToReais(charges.interestCents),
      totalDue: centsToReais(charges.totalCents),
    };
  }

  async cancel(id: string, actorId?: string) {
    const contract = await this.ensureExists(id);
    const paymentsCount = await this.prisma.payment.count({ where: { contractId: id } });
    if (paymentsCount > 0) {
      throw new BadRequestException('Cannot cancel a contract that already has payments; use renegotiation');
    }
    const updated = await this.prisma.contract.update({
      where: { id },
      data: {
        status: ContractStatus.CANCELLED,
        installments: { updateMany: { where: { contractId: id }, data: { status: 'CANCELLED' } } },
      },
    });
    await this.audit.record({
      userId: actorId,
      action: 'CANCEL',
      entity: 'Contract',
      entityId: id,
      before: { status: contract.status },
      after: { status: 'CANCELLED' },
    });
    return updated;
  }

  /** Marks a contract SETTLED once every installment is paid/cancelled. */
  async recomputeContractStatus(contractId: string): Promise<void> {
    const installments = await this.prisma.installment.findMany({
      where: { contractId },
      select: { status: true },
    });
    const allDone = installments.every((i) => i.status === 'PAID' || i.status === 'CANCELLED');
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) return;

    if (allDone && contract.status !== 'SETTLED' && contract.status !== 'CANCELLED') {
      await this.prisma.contract.update({
        where: { id: contractId },
        data: { status: 'SETTLED', settledAt: new Date() },
      });
    } else if (!allDone && contract.status === 'SETTLED') {
      await this.prisma.contract.update({ where: { id: contractId }, data: { status: 'ACTIVE', settledAt: null } });
    }
  }

  private async ensureExists(id: string) {
    const contract = await this.prisma.contract.findUnique({ where: { id } });
    if (!contract) throw new NotFoundException('Contract not found');
    return contract;
  }
}

function summarize(installments: { amountDue: Prisma.Decimal; amountPaid: Prisma.Decimal; status: string }[]) {
  let totalDue = 0;
  let totalPaid = 0;
  let outstanding = 0;
  let overdue = 0;
  let paidCount = 0;
  for (const i of installments) {
    const due = Number(i.amountDue);
    const paid = Number(i.amountPaid);
    totalDue += due;
    totalPaid += paid;
    if (i.status === 'PAID') paidCount++;
    if (i.status !== 'PAID' && i.status !== 'CANCELLED') outstanding += due - paid;
    if (i.status === 'OVERDUE') overdue += due - paid;
  }
  return {
    installmentsCount: installments.length,
    paidCount,
    totalDue: round2(totalDue),
    totalPaid: round2(totalPaid),
    outstanding: round2(outstanding),
    overdue: round2(overdue),
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
