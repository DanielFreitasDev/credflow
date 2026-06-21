import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CollectionStatus,
  ContractStatus,
  InstallmentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { buildPagination, paginatedResponse } from '../../common/utils/pagination.util';
import { buildSequentialNumber, retryOnUniqueViolation } from '../../common/utils/sequence.util';
import { addMonths, daysBetween, startOfDay } from '../../common/utils/date.util';
import { clampCet, computeCet, computeOutstanding, simulate } from '../../domain/finance/finance';
import { centsToDecimal, reaisToCents } from '../../domain/finance/money';
import { EncryptionService } from '../../common/crypto/encryption.service';
import {
  CollectionQueryDto,
  CreateInteractionDto,
  CreatePromiseDto,
  RenegotiateDto,
} from './dto/collection.dto';

const ACTIVE_CASE_STATUSES: CollectionStatus[] = ['IN_PROGRESS', 'PROMISE', 'NEGOTIATING'];

// Allowed manual case-status transitions. WRITTEN_OFF is terminal; RESOLVED may
// only be reopened to IN_PROGRESS. Prevents nonsensical jumps (e.g. un-writing-off).
const CASE_TRANSITIONS: Record<CollectionStatus, CollectionStatus[]> = {
  OPEN: ['IN_PROGRESS', 'NEGOTIATING', 'PROMISE', 'RESOLVED', 'WRITTEN_OFF'],
  IN_PROGRESS: ['NEGOTIATING', 'PROMISE', 'RESOLVED', 'WRITTEN_OFF'],
  NEGOTIATING: ['IN_PROGRESS', 'PROMISE', 'RESOLVED', 'WRITTEN_OFF'],
  PROMISE: ['IN_PROGRESS', 'NEGOTIATING', 'RESOLVED', 'WRITTEN_OFF'],
  RESOLVED: ['IN_PROGRESS'],
  WRITTEN_OFF: [],
};

@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly encryption: EncryptionService,
  ) {}

  /**
   * Re-evaluates a single contract's arrears: flags overdue installments,
   * opens/updates/closes the collection case and toggles DEFAULTED/ACTIVE.
   */
  async refreshContract(contractId: string, txClient?: Prisma.TransactionClient) {
    // Always runs atomically: either inside a caller's transaction (e.g. the
    // payment flow) or in its own. The flag-overdue / open-case / toggle-status
    // writes used to run as separate statements and could half-apply on a crash.
    if (txClient) return this.refreshContractTx(contractId, txClient);
    return this.prisma.$transaction((tx) => this.refreshContractTx(contractId, tx));
  }

  private async refreshContractTx(contractId: string, tx: Prisma.TransactionClient) {
    const contract = await tx.contract.findUnique({
      where: { id: contractId },
      include: { installments: true },
    });
    if (!contract) return null;
    if (['CANCELLED', 'SETTLED', 'RENEGOTIATED'].includes(contract.status)) return null;

    const today = startOfDay(new Date());
    let maxDays = 0;
    let totalOverdueCents = 0;
    const overdueIds: string[] = [];

    for (const inst of contract.installments) {
      if (['PAID', 'CANCELLED', 'RENEGOTIATED'].includes(inst.status)) continue;
      const daysLate = daysBetween(startOfDay(inst.dueDate), today);
      if (daysLate > 0) {
        overdueIds.push(inst.id);
        maxDays = Math.max(maxDays, daysLate);
        const o = computeOutstanding({
          amountDueCents: reaisToCents(inst.amountDue),
          amountPaidCents: reaisToCents(inst.amountPaid),
          lateFeePaidCents: reaisToCents(inst.lateFee),
          lateInterestPaidCents: reaisToCents(inst.lateInterest),
          daysLate,
          fineRate: Number(contract.lateFeeRate),
          monthlyInterestRate: Number(contract.lateInterestRate),
        });
        totalOverdueCents += o.totalOutstandingCents;
      }
    }

    if (overdueIds.length) {
      await tx.installment.updateMany({
        where: { id: { in: overdueIds }, status: { notIn: ['PAID', 'CANCELLED', 'RENEGOTIATED'] } },
        data: { status: InstallmentStatus.OVERDUE },
      });
    }

    if (maxDays > 0) {
      const existing = await tx.collectionCase.findUnique({ where: { contractId } });
      const nextStatus: CollectionStatus =
        existing && ACTIVE_CASE_STATUSES.includes(existing.status) ? existing.status : 'OPEN';

      const cse = await tx.collectionCase.upsert({
        where: { contractId },
        create: {
          contractId,
          status: 'OPEN',
          daysOverdue: maxDays,
          totalOverdue: centsToDecimal(totalOverdueCents),
        },
        update: {
          status: nextStatus,
          daysOverdue: maxDays,
          totalOverdue: centsToDecimal(totalOverdueCents),
          resolvedAt: null,
        },
      });

      if (contract.status !== ContractStatus.DEFAULTED) {
        await tx.contract.update({ where: { id: contractId }, data: { status: 'DEFAULTED' } });
        await this.audit.record({
          action: 'CONTRACT_DEFAULTED',
          entity: 'Contract',
          entityId: contractId,
          before: { status: contract.status },
          after: { status: 'DEFAULTED', daysOverdue: maxDays },
        });
      }
      if (!existing) {
        await this.audit.record({
          action: 'COLLECTION_OPENED',
          entity: 'CollectionCase',
          entityId: cse.id,
          after: { contractId, daysOverdue: maxDays },
        });
      }
      return cse;
    }

    // No arrears: resolve any open case and reactivate the contract.
    const existing = await tx.collectionCase.findUnique({ where: { contractId } });
    if (existing && existing.status !== 'RESOLVED' && existing.status !== 'WRITTEN_OFF') {
      await tx.collectionCase.update({
        where: { contractId },
        data: { status: 'RESOLVED', resolvedAt: new Date(), daysOverdue: 0, totalOverdue: 0 },
      });
      await this.audit.record({
        action: 'COLLECTION_RESOLVED',
        entity: 'CollectionCase',
        entityId: existing.id,
        before: { status: existing.status },
        after: { status: 'RESOLVED' },
      });
    }
    if (contract.status === ContractStatus.DEFAULTED) {
      await tx.contract.update({ where: { id: contractId }, data: { status: 'ACTIVE' } });
      await this.audit.record({
        action: 'CONTRACT_REACTIVATED',
        entity: 'Contract',
        entityId: contractId,
        before: { status: 'DEFAULTED' },
        after: { status: 'ACTIVE' },
      });
    }
    return null;
  }

  /** Batch arrears job — safe to run on a schedule (cron) or on demand. */
  async refreshAll() {
    const contracts = await this.prisma.contract.findMany({
      where: { status: { in: ['ACTIVE', 'DEFAULTED'] } },
      select: { id: true },
    });
    let openCases = 0;
    for (const c of contracts) {
      const r = await this.refreshContract(c.id);
      if (r) openCases++;
    }
    return { scanned: contracts.length, openCases };
  }

  async list(query: CollectionQueryDto) {
    const { skip, take, page, pageSize } = buildPagination(query);
    const where: Prisma.CollectionCaseWhereInput = query.status ? { status: query.status } : {};
    const [data, total] = await this.prisma.$transaction([
      this.prisma.collectionCase.findMany({
        where,
        skip,
        take,
        orderBy: { daysOverdue: 'desc' },
        include: {
          contract: {
            select: {
              id: true,
              number: true,
              status: true,
              customer: { select: { id: true, name: true, document: true } },
            },
          },
        },
      }),
      this.prisma.collectionCase.count({ where }),
    ]);
    data.forEach((c) => this.encryption.decryptDocumentField(c.contract?.customer));
    return paginatedResponse(data, total, page, pageSize);
  }

  async findOne(id: string) {
    const cse = await this.prisma.collectionCase.findUnique({
      where: { id },
      include: {
        contract: { include: { customer: true } },
        interactions: { orderBy: { createdAt: 'desc' }, include: { createdBy: { select: { id: true, name: true } } } },
        promises: { orderBy: { createdAt: 'desc' }, include: { createdBy: { select: { id: true, name: true } } } },
      },
    });
    if (!cse) throw new NotFoundException('Collection case not found');
    this.encryption.decryptDocumentField(cse.contract?.customer);
    return cse;
  }

  async addInteraction(caseId: string, dto: CreateInteractionDto, actorId?: string) {
    await this.ensureCase(caseId);
    const interaction = await this.prisma.$transaction(async (tx) => {
      const created = await tx.collectionInteraction.create({
        data: { caseId, channel: dto.channel, notes: dto.notes, createdById: actorId },
      });
      await tx.collectionCase.updateMany({
        where: { id: caseId, status: 'OPEN' },
        data: { status: 'IN_PROGRESS' },
      });
      return created;
    });
    await this.audit.record({ userId: actorId, action: 'COLLECTION_INTERACTION', entity: 'CollectionCase', entityId: caseId, after: { channel: dto.channel } });
    return interaction;
  }

  async addPromise(caseId: string, dto: CreatePromiseDto, actorId?: string) {
    await this.ensureCase(caseId);
    const promise = await this.prisma.$transaction(async (tx) => {
      const created = await tx.paymentPromise.create({
        data: {
          caseId,
          amount: dto.amount,
          promisedDate: new Date(dto.promisedDate),
          notes: dto.notes,
          createdById: actorId,
        },
      });
      await tx.collectionCase.update({ where: { id: caseId }, data: { status: 'PROMISE' } });
      return created;
    });
    await this.audit.record({ userId: actorId, action: 'PAYMENT_PROMISE', entity: 'CollectionCase', entityId: caseId, after: { amount: dto.amount, promisedDate: dto.promisedDate } });
    return promise;
  }

  async updatePromise(promiseId: string, status: 'KEPT' | 'BROKEN' | 'CANCELLED', actorId?: string) {
    const promise = await this.prisma.paymentPromise.findUnique({ where: { id: promiseId } });
    if (!promise) throw new NotFoundException('Promise not found');
    const updated = await this.prisma.paymentPromise.update({ where: { id: promiseId }, data: { status } });
    await this.audit.record({ userId: actorId, action: 'PROMISE_UPDATE', entity: 'PaymentPromise', entityId: promiseId, after: { status } });
    return updated;
  }

  async updateCaseStatus(caseId: string, status: CollectionStatus, actorId?: string) {
    const cse = await this.ensureCase(caseId);
    if (cse.status !== status && !CASE_TRANSITIONS[cse.status].includes(status)) {
      throw new BadRequestException(`Invalid case transition: ${cse.status} -> ${status}`);
    }
    const updated = await this.prisma.collectionCase.update({
      where: { id: caseId },
      data: { status, resolvedAt: status === 'RESOLVED' || status === 'WRITTEN_OFF' ? new Date() : null },
    });
    await this.audit.record({ userId: actorId, action: 'COLLECTION_STATUS', entity: 'CollectionCase', entityId: caseId, before: { status: cse.status }, after: { status } });
    return updated;
  }

  /**
   * Debt renegotiation: consolidates the outstanding balance (+ accrued charges)
   * of an existing contract into a brand-new contract and closes the old one.
   */
  async renegotiate(contractId: string, dto: RenegotiateDto, actorId?: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { installments: true },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    if (!['ACTIVE', 'DEFAULTED'].includes(contract.status)) {
      throw new BadRequestException('Only ACTIVE or DEFAULTED contracts can be renegotiated');
    }

    const today = startOfDay(new Date());
    let outstandingCents = 0;
    const unpaidIds: string[] = [];
    for (const inst of contract.installments) {
      if (['PAID', 'CANCELLED', 'RENEGOTIATED'].includes(inst.status)) continue;
      unpaidIds.push(inst.id);
      const daysLate = daysBetween(startOfDay(inst.dueDate), today);
      if (daysLate > 0) {
        // Overdue: consolidate the full outstanding base + accrued fine/mora.
        const o = computeOutstanding({
          amountDueCents: reaisToCents(inst.amountDue),
          amountPaidCents: reaisToCents(inst.amountPaid),
          lateFeePaidCents: reaisToCents(inst.lateFee),
          lateInterestPaidCents: reaisToCents(inst.lateInterest),
          daysLate,
          fineRate: Number(contract.lateFeeRate),
          monthlyInterestRate: Number(contract.lateInterestRate),
        });
        outstandingCents += o.totalOutstandingCents;
      } else {
        // Not yet due: consolidate only the remaining PRINCIPAL. Capitalizing the
        // unaccrued future interest (amountDue) would charge interest-on-interest
        // — renegotiating a not-yet-incurred period behaves like an early payoff.
        const amountPaidCents = reaisToCents(inst.amountPaid);
        const interestDueCents = reaisToCents(inst.interestDue);
        const principalDueCents = reaisToCents(inst.principalDue);
        const principalPaid = Math.max(0, amountPaidCents - interestDueCents); // interest-first
        outstandingCents += Math.max(0, principalDueCents - principalPaid);
      }
    }
    if (outstandingCents <= 0) throw new BadRequestException('Contract has no outstanding balance to renegotiate');

    const rate = dto.interestRate ?? Number(contract.interestRate);
    const amortization = dto.amortizationType ?? contract.amortizationType;
    const sim = simulate({ principalCents: outstandingCents, monthlyRate: rate, termMonths: dto.termMonths, amortization });
    const cet = computeCet(outstandingCents, sim.schedule.map((s) => s.amount));

    const startDate = new Date();
    const firstDueDate = dto.firstDueDate ? new Date(dto.firstDueDate) : addMonths(startDate, 1);
    const endDate = addMonths(firstDueDate, dto.termMonths - 1);
    const year = new Date().getFullYear();

    // New contract + closing the old one (installments, contract status and the
    // collection case) commit atomically so a renegotiation can't half-apply.
    const newContract = await retryOnUniqueViolation(() =>
      this.prisma.$transaction(async (tx) => {
        const count = await tx.contract.count({ where: { number: { startsWith: `CTR-${year}-` } } });
        const number = buildSequentialNumber('CTR', year, count + 1);
        const created = await tx.contract.create({
          data: {
            number,
            customerId: contract.customerId,
            status: 'ACTIVE',
            amortizationType: amortization,
            principal: centsToDecimal(outstandingCents),
            interestRate: rate,
            termMonths: dto.termMonths,
            totalAmount: centsToDecimal(sim.totalAmountCents),
            totalInterest: centsToDecimal(sim.totalInterestCents),
            cetAnnual: Math.round(clampCet(cet.annual) * 1e6) / 1e6,
            lateFeeRate: Number(contract.lateFeeRate),
            lateInterestRate: Number(contract.lateInterestRate),
            startDate,
            firstDueDate,
            endDate,
            signedById: actorId,
            renegotiatedFromId: contract.id,
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

        await tx.installment.updateMany({ where: { id: { in: unpaidIds } }, data: { status: 'RENEGOTIATED' } });
        await tx.contract.update({ where: { id: contractId }, data: { status: 'RENEGOTIATED' } });
        await tx.collectionCase.updateMany({
          where: { contractId, status: { notIn: ['RESOLVED', 'WRITTEN_OFF'] } },
          data: { status: 'RESOLVED', resolvedAt: new Date() },
        });

        return created;
      }),
    );

    await this.audit.record({
      userId: actorId,
      action: 'RENEGOTIATION',
      entity: 'Contract',
      entityId: contractId,
      after: { newContract: newContract.number, principal: Number(newContract.principal), reason: dto.reason },
    });

    return newContract;
  }

  private async ensureCase(id: string) {
    const cse = await this.prisma.collectionCase.findUnique({ where: { id } });
    if (!cse) throw new NotFoundException('Collection case not found');
    return cse;
  }
}
