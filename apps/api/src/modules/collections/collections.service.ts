import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CollectionStatus,
  ContractStatus,
  InstallmentStatus,
  InteractionChannel,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { buildPagination, paginatedResponse } from '../../common/utils/pagination.util';
import { acquireNumberLock, buildSequentialNumber, retryOnUniqueViolation } from '../../common/utils/sequence.util';
import { addMonths, daysBetween, startOfDay } from '../../common/utils/date.util';
import { clampCet, computeCet, computeOutstanding, simulate } from '../../domain/finance/finance';
import { centsToDecimal, centsToReais, reaisToCents } from '../../domain/finance/money';
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

// Dunning ladder (régua de cobrança): escalation stages keyed by days overdue.
// The case's `dunningStage` tracks the highest stage reached so each step's
// action is generated at most once.
interface DunningStage {
  stage: number;
  minDays: number;
  channel: InteractionChannel;
  action: string;
}

const DUNNING_LADDER: DunningStage[] = [
  { stage: 1, minDays: 1, channel: 'SYSTEM', action: 'Lembrete amigável de parcela vencida' },
  { stage: 2, minDays: 8, channel: 'EMAIL', action: 'Aviso de atraso por e-mail' },
  { stage: 3, minDays: 16, channel: 'PHONE', action: 'Contato telefônico de cobrança' },
  { stage: 4, minDays: 31, channel: 'LETTER', action: 'Notificação formal de débito' },
  { stage: 5, minDays: 61, channel: 'SYSTEM', action: 'Encaminhamento para cobrança jurídica' },
];

/** Highest dunning stage whose threshold the given days-overdue has reached. */
function dunningStageFor(daysOverdue: number): DunningStage | null {
  let match: DunningStage | null = null;
  for (const s of DUNNING_LADDER) if (daysOverdue >= s.minDays) match = s;
  return match;
}

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

  /**
   * Full daily collections cycle: flag arrears, advance the dunning ladder and
   * reconcile payment promises. Idempotent — safe to run on a schedule or on
   * demand (POST /collections/run). CollectionsScheduler's cron calls this.
   */
  async runDailyCollections() {
    const arrears = await this.refreshAll();
    const dunning = await this.applyDunningLadder();
    const promises = await this.reconcilePromises();
    return { ...arrears, ...dunning, ...promises };
  }

  /**
   * Dunning ladder: for each active case, escalate to the stage matching its
   * days-overdue bucket and record the action as a SYSTEM interaction. The
   * `dunningStage` field makes this idempotent — each stage fires at most once.
   */
  async applyDunningLadder() {
    const cases = await this.prisma.collectionCase.findMany({
      where: { status: { notIn: ['RESOLVED', 'WRITTEN_OFF'] }, daysOverdue: { gt: 0 } },
      select: { id: true, daysOverdue: true, dunningStage: true },
    });
    let escalations = 0;
    for (const cse of cases) {
      const target = dunningStageFor(cse.daysOverdue);
      if (!target || target.stage <= cse.dunningStage) continue;
      await this.prisma.$transaction(async (tx) => {
        await tx.collectionInteraction.create({
          data: {
            caseId: cse.id,
            channel: target.channel,
            // System-generated (no human actor): createdById left null.
            notes: `[Régua etapa ${target.stage}] ${target.action} — ${cse.daysOverdue} dia(s) em atraso.`,
          },
        });
        await tx.collectionCase.update({ where: { id: cse.id }, data: { dunningStage: target.stage } });
      });
      await this.audit.record({
        action: 'DUNNING_ESCALATION',
        entity: 'CollectionCase',
        entityId: cse.id,
        after: { stage: target.stage, channel: target.channel, daysOverdue: cse.daysOverdue },
      });
      escalations++;
    }
    return { escalations };
  }

  /**
   * Reconciles open payment promises: marks KEPT when the contract received at
   * least the promised amount since the promise was made (or the case resolved),
   * and BROKEN once the promised date passes unpaid (pulling the case back into
   * active follow-up).
   */
  async reconcilePromises() {
    const today = startOfDay(new Date());
    const pending = await this.prisma.paymentPromise.findMany({
      where: { status: 'PENDING' },
      include: { case: { select: { id: true, status: true, contractId: true } } },
    });
    let promisesKept = 0;
    let promisesBroken = 0;
    for (const p of pending) {
      const promisedCents = reaisToCents(p.amount);
      // Attribute only payments that could fulfil THIS promise: same contract,
      // made after the promise and on/before the promised day (end of day). This
      // stops an unrelated later payment from silently marking a promise KEPT.
      const cutoff = new Date(startOfDay(p.promisedDate).getTime() + 24 * 60 * 60 * 1000);
      const paidAgg = await this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { contractId: p.case.contractId, paidAt: { gte: p.createdAt, lt: cutoff } },
      });
      const paidWithinCents = reaisToCents(paidAgg._sum.amount ?? 0);
      if (p.case.status === 'RESOLVED' || paidWithinCents >= promisedCents) {
        await this.prisma.paymentPromise.update({ where: { id: p.id }, data: { status: 'KEPT' } });
        promisesKept++;
      } else if (startOfDay(p.promisedDate) < today) {
        // Past due and unmet -> broken; pull the case back into active follow-up.
        // Both writes commit together so case and promise can't disagree.
        await this.prisma.$transaction([
          this.prisma.paymentPromise.update({ where: { id: p.id }, data: { status: 'BROKEN' } }),
          this.prisma.collectionCase.updateMany({
            where: { id: p.case.id, status: 'PROMISE' },
            data: { status: 'IN_PROGRESS' },
          }),
        ]);
        promisesBroken++;
      }
    }
    return { promisesKept, promisesBroken };
  }

  async list(query: CollectionQueryDto, role?: string) {
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
    data.forEach((c) => this.encryption.presentDocumentField(c.contract?.customer, role));
    return paginatedResponse(data, total, page, pageSize);
  }

  async findOne(id: string, role?: string) {
    const cse = await this.prisma.collectionCase.findUnique({
      where: { id },
      include: {
        contract: { include: { customer: true } },
        interactions: { orderBy: { createdAt: 'desc' }, include: { createdBy: { select: { id: true, name: true } } } },
        promises: { orderBy: { createdAt: 'desc' }, include: { createdBy: { select: { id: true, name: true } } } },
      },
    });
    if (!cse) throw new NotFoundException('Collection case not found');
    this.encryption.presentDocumentField(cse.contract?.customer, role);
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
    // Only a still-PENDING promise can be resolved; KEPT/BROKEN/CANCELLED are terminal.
    if (promise.status !== 'PENDING') {
      throw new BadRequestException(`Promise is already ${promise.status.toLowerCase()}`);
    }
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
    const today = startOfDay(new Date());
    const year = new Date().getFullYear();

    // Locking, outstanding computation, new-contract creation and closing the old
    // one all commit in ONE transaction. The contract + installment row locks
    // serialise against a concurrent payment (which locks an installment FOR
    // UPDATE), so the consolidated balance can never be computed from stale data
    // and the renegotiation can't half-apply.
    const { created, capitalizedChargesCents } = await retryOnUniqueViolation(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Contract" WHERE id = ${contractId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Installment" WHERE "contractId" = ${contractId} FOR UPDATE`;

        const contract = await tx.contract.findUnique({
          where: { id: contractId },
          include: { installments: true },
        });
        if (!contract) throw new NotFoundException('Contract not found');
        if (!['ACTIVE', 'DEFAULTED'].includes(contract.status)) {
          throw new BadRequestException('Only ACTIVE or DEFAULTED contracts can be renegotiated');
        }

        let outstandingCents = 0;
        let capitalized = 0; // fine + mora rolled into the new principal (disclosure)
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
            capitalized += o.fineOutstandingCents + o.interestOutstandingCents;
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
        if (outstandingCents <= 0) {
          throw new BadRequestException('Contract has no outstanding balance to renegotiate');
        }

        const rate = dto.interestRate ?? Number(contract.interestRate);
        const amortization = dto.amortizationType ?? contract.amortizationType;
        const sim = simulate({ principalCents: outstandingCents, monthlyRate: rate, termMonths: dto.termMonths, amortization });
        const cet = computeCet(outstandingCents, sim.schedule.map((s) => s.amount));

        const startDate = new Date();
        const firstDueDate = dto.firstDueDate ? new Date(dto.firstDueDate) : addMonths(startDate, 1);
        const endDate = addMonths(firstDueDate, dto.termMonths - 1);

        await acquireNumberLock(tx, 'CTR', year);
        const count = await tx.contract.count({ where: { number: { startsWith: `CTR-${year}-` } } });
        const number = buildSequentialNumber('CTR', year, count + 1);
        const newContract = await tx.contract.create({
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

        return { created: newContract, capitalizedChargesCents: capitalized };
      }),
    );

    await this.audit.record({
      userId: actorId,
      action: 'RENEGOTIATION',
      entity: 'Contract',
      entityId: contractId,
      after: {
        newContract: created.number,
        principal: Number(created.principal),
        // Discloses how much penalty (multa + mora) was capitalized into the new
        // principal — this portion then accrues the contract interest rate again.
        capitalizedCharges: centsToReais(capitalizedChargesCents),
        reason: dto.reason,
      },
    });

    return created;
  }

  private async ensureCase(id: string) {
    const cse = await this.prisma.collectionCase.findUnique({ where: { id } });
    if (!cse) throw new NotFoundException('Collection case not found');
    return cse;
  }
}
