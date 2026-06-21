import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContractStatus, Prisma, ProposalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { buildPagination, paginatedResponse, resolveOrderBy } from '../../common/utils/pagination.util';
import { buildSequentialNumber, retryOnUniqueViolation } from '../../common/utils/sequence.util';
import { addMonths, daysBetween, startOfDay } from '../../common/utils/date.util';
import {
  clampCet,
  computeContractCosting,
  computeOutstanding,
  isNonAmortizing,
} from '../../domain/finance/finance';
import { centsToDecimal, centsToReais, reaisToCents } from '../../domain/finance/money';
import { ProposalsService } from '../proposals/proposals.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { ContractQueryDto, CreateContractDto } from './dto/contract.dto';

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly proposals: ProposalsService,
    private readonly audit: AuditService,
    private readonly encryption: EncryptionService,
  ) {}

  async createFromProposal(proposalId: string, dto: CreateContractDto, actorId?: string) {
    const proposal = await this.proposals.findRaw(proposalId);

    if (proposal.status !== ProposalStatus.APPROVED) {
      throw new BadRequestException('Only APPROVED proposals can be contracted');
    }
    if (!proposal.analysis || proposal.analysis.decision !== 'APPROVED') {
      throw new BadRequestException('Proposal has no approved credit analysis');
    }
    // Re-check the customer status at contracting time — it may have been
    // blocked after the proposal was created/approved.
    if (proposal.customer.status === 'BLOCKED') {
      throw new BadRequestException('Customer is blocked and cannot be contracted');
    }
    const existing = await this.prisma.contract.findUnique({ where: { proposalId } });
    if (existing) throw new ConflictException('Proposal already has a contract');

    // Honour the approved amount (option A: cash released to the customer). When
    // the analysis approved a value different from the requested one, IOF /
    // financed amount / schedule / CET are re-derived from it instead of copying
    // the proposal's requested figures. Equal amounts reproduce the proposal.
    const requestedCents = reaisToCents(proposal.requestedAmount);
    const approvedCents =
      proposal.analysis?.approvedAmount != null
        ? reaisToCents(proposal.analysis.approvedAmount)
        : requestedCents;
    if (approvedCents <= 0) {
      throw new BadRequestException('Approved amount must be greater than zero to contract');
    }
    const costing = computeContractCosting({
      approvedCents,
      requestedCents,
      proposalIofCents: reaisToCents(proposal.iofAmount),
      tacCents: reaisToCents(proposal.tacAmount),
      monthlyRate: Number(proposal.interestRate),
      termMonths: proposal.termMonths,
      amortization: proposal.amortizationType,
    });
    if (proposal.amortizationType === 'PRICE' && isNonAmortizing(costing.schedule)) {
      throw new BadRequestException(
        'A taxa é alta demais para o prazo: as parcelas não amortizam o principal.',
      );
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const firstDueDate = dto.firstDueDate ? new Date(dto.firstDueDate) : addMonths(startDate, 1);
    const endDate = addMonths(firstDueDate, proposal.termMonths - 1);

    const year = new Date().getFullYear();
    // Contract + installments + proposal status + customer activation must all
    // commit together, so a mid-flow failure can't leave a contract attached to
    // a still-APPROVED proposal.
    const contract = await retryOnUniqueViolation(() =>
      this.prisma.$transaction(async (tx) => {
        const count = await tx.contract.count({
          where: { number: { startsWith: `CTR-${year}-` } },
        });
        const number = buildSequentialNumber('CTR', year, count + 1);

        const created = await tx.contract.create({
          data: {
            number,
            proposalId,
            customerId: proposal.customerId,
            status: ContractStatus.ACTIVE,
            amortizationType: proposal.amortizationType,
            principal: centsToDecimal(costing.financedCents),
            interestRate: Number(proposal.interestRate),
            termMonths: proposal.termMonths,
            totalAmount: centsToDecimal(costing.totalAmountCents),
            totalInterest: centsToDecimal(costing.totalInterestCents),
            iofAmount: centsToDecimal(costing.iofCents),
            tacAmount: centsToDecimal(costing.tacCents),
            cetAnnual: Math.round(clampCet(costing.cetAnnual) * 1e6) / 1e6,
            lateFeeRate: dto.lateFeeRate ?? 0.02,
            lateInterestRate: dto.lateInterestRate ?? 0.01,
            startDate,
            firstDueDate,
            endDate,
            signedById: actorId,
            installments: {
              create: costing.schedule.map((s) => ({
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

        // Move the proposal to CONTRACTED and activate the customer — same tx.
        await this.proposals.changeStatus(
          proposalId,
          ProposalStatus.CONTRACTED,
          actorId,
          `Contract ${number} created`,
          tx,
        );
        await tx.customer.updateMany({
          where: { id: proposal.customerId, status: 'PROSPECT' },
          data: { status: 'ACTIVE' },
        });

        return created;
      }),
    );

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
        orderBy: resolveOrderBy(query.sortBy, ['createdAt', 'number', 'principal', 'status'], query.sortOrder),
        include: {
          customer: { select: { id: true, name: true, document: true, type: true } },
          installments: { select: { amountDue: true, amountPaid: true, status: true } },
        },
      }),
      this.prisma.contract.count({ where }),
    ]);

    const data = rows.map(({ installments, ...c }) => {
      this.encryption.decryptDocumentField(c.customer);
      return { ...c, ...summarize(installments) };
    });
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
    this.encryption.decryptDocumentField(contract.customer);
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
    const daysLate =
      installment.status === 'PAID'
        ? 0
        : Math.max(0, daysBetween(startOfDay(installment.dueDate), startOfDay(reference)));

    const outstanding = computeOutstanding({
      amountDueCents: reaisToCents(installment.amountDue),
      amountPaidCents: reaisToCents(installment.amountPaid),
      lateFeePaidCents: reaisToCents(installment.lateFee),
      lateInterestPaidCents: reaisToCents(installment.lateInterest),
      daysLate,
      fineRate: Number(installment.contract.lateFeeRate),
      monthlyInterestRate: Number(installment.contract.lateInterestRate),
    });

    return {
      installmentId,
      number: installment.number,
      dueDate: installment.dueDate,
      daysLate,
      outstanding: centsToReais(outstanding.baseOutstandingCents),
      fine: centsToReais(outstanding.fineOutstandingCents),
      interest: centsToReais(outstanding.interestOutstandingCents),
      totalDue: centsToReais(outstanding.totalOutstandingCents),
    };
  }

  async cancel(id: string, actorId?: string) {
    // Lock + count + update in one transaction so a payment can't slip in
    // between the guard and the cancel (TOCTOU).
    const { before } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Contract" WHERE id = ${id} FOR UPDATE`;
      const contract = await tx.contract.findUnique({ where: { id } });
      if (!contract) throw new NotFoundException('Contract not found');
      const paymentsCount = await tx.payment.count({ where: { contractId: id } });
      if (paymentsCount > 0) {
        throw new BadRequestException('Cannot cancel a contract that already has payments; use renegotiation');
      }
      await tx.contract.update({
        where: { id },
        data: {
          status: ContractStatus.CANCELLED,
          installments: { updateMany: { where: { contractId: id }, data: { status: 'CANCELLED' } } },
        },
      });
      return { before: contract.status };
    });
    await this.audit.record({
      userId: actorId,
      action: 'CANCEL',
      entity: 'Contract',
      entityId: id,
      before: { status: before },
      after: { status: 'CANCELLED' },
    });
    return this.findOne(id);
  }

  /**
   * Marks a contract SETTLED once every installment is paid/cancelled (or back
   * to ACTIVE if a settlement is reversed). Accepts a transaction client so it
   * can run atomically inside the payment flow.
   */
  async recomputeContractStatus(
    contractId: string,
    txClient?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = txClient ?? this.prisma;
    const installments = await db.installment.findMany({
      where: { contractId },
      select: { status: true },
    });
    const allDone =
      installments.length > 0 &&
      installments.every((i) => i.status === 'PAID' || i.status === 'CANCELLED');
    const contract = await db.contract.findUnique({ where: { id: contractId } });
    if (!contract) return;

    if (allDone && contract.status !== 'SETTLED' && contract.status !== 'CANCELLED') {
      await db.contract.update({
        where: { id: contractId },
        data: { status: 'SETTLED', settledAt: new Date() },
      });
      await this.audit.record({
        action: 'CONTRACT_SETTLED',
        entity: 'Contract',
        entityId: contractId,
        before: { status: contract.status },
        after: { status: 'SETTLED' },
      });
    } else if (!allDone && contract.status === 'SETTLED') {
      await db.contract.update({
        where: { id: contractId },
        data: { status: 'ACTIVE', settledAt: null },
      });
      await this.audit.record({
        action: 'CONTRACT_REACTIVATED',
        entity: 'Contract',
        entityId: contractId,
        before: { status: 'SETTLED' },
        after: { status: 'ACTIVE' },
      });
    }
  }

  private async ensureExists(id: string) {
    const contract = await this.prisma.contract.findUnique({ where: { id } });
    if (!contract) throw new NotFoundException('Contract not found');
    return contract;
  }
}

function summarize(installments: { amountDue: Prisma.Decimal; amountPaid: Prisma.Decimal; status: string }[]) {
  // Aggregate in integer cents (the central invariant) then convert once.
  let totalDueCents = 0;
  let totalPaidCents = 0;
  let outstandingCents = 0;
  let overdueCents = 0;
  let paidCount = 0;
  for (const i of installments) {
    const due = reaisToCents(i.amountDue);
    const paid = reaisToCents(i.amountPaid);
    totalDueCents += due;
    totalPaidCents += paid;
    if (i.status === 'PAID') paidCount++;
    if (i.status !== 'PAID' && i.status !== 'CANCELLED') outstandingCents += due - paid;
    if (i.status === 'OVERDUE') overdueCents += due - paid;
  }
  return {
    installmentsCount: installments.length,
    paidCount,
    totalDue: centsToReais(totalDueCents),
    totalPaid: centsToReais(totalPaidCents),
    outstanding: centsToReais(outstandingCents),
    overdue: centsToReais(overdueCents),
  };
}
