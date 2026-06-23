import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InstallmentStatus, Payment, PaymentMethod, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { buildPagination, paginatedResponse } from '../../common/utils/pagination.util';
import { daysBetween, startOfDay } from '../../common/utils/date.util';
import { computeOutstanding } from '../../domain/finance/finance';
import { centsToDecimal, centsToReais, reaisToCents } from '../../domain/finance/money';
import { ContractsService } from '../contracts/contracts.service';
import { CollectionsService } from '../collections/collections.service';
import { CreatePaymentDto, PaymentQueryDto, SettleInstallmentDto } from './dto/payment.dto';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contracts: ContractsService,
    private readonly collections: CollectionsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Registers a payment against one installment.
   * Allocation order on overdue installments: arrears interest -> fine ->
   * installment interest -> principal. Supports partial and late payments.
   */
  async register(dto: CreatePaymentDto, actorId?: string) {
    const payCents = reaisToCents(dto.amount);
    if (payCents <= 0) throw new BadRequestException('O valor deve ser positivo');
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    // Reject payments dated on a future calendar day — they would inflate
    // days-late and overcharge mora. The date-only picker pins the time to
    // local noon, so compare by day (not instant) to allow same-day payments
    // registered in the morning.
    if (startOfDay(paidAt).getTime() > startOfDay(new Date()).getTime()) {
      throw new BadRequestException('A data de pagamento não pode ser futura');
    }

    // Idempotent replay: a retried submission with the same key returns the
    // original payment instead of charging twice.
    if (dto.idempotencyKey) {
      const prior = await this.prisma.payment.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (prior) return prior;
    }

    // Lock + allocate + write + settle + refresh-arrears all commit in ONE
    // transaction. The row lock serialises concurrent payments against the same
    // installment, eliminating the read-modify-write lost-update window.
    let result: {
      payment: Payment;
      newStatus: InstallmentStatus;
      allocation: {
        payMora: number;
        payFine: number;
        principalPortion: number;
        interestPortion: number;
        allocatedCents: number;
      };
    };
    try {
      result = await this.prisma.$transaction(async (tx) => {
      // Lock the CONTRACT row first so settlement + arrears recompute for one
      // contract is serialised even across payments on *different* installments
      // (each would otherwise take only its own installment lock and then race on
      // the shared contract status / collection case). Mirrors renegotiate().
      await tx.$queryRaw`SELECT c.id FROM "Contract" c JOIN "Installment" i ON i."contractId" = c.id WHERE i.id = ${dto.installmentId} FOR UPDATE OF c`;
      await tx.$queryRaw`SELECT id FROM "Installment" WHERE id = ${dto.installmentId} FOR UPDATE`;
      const installment = await tx.installment.findUnique({
        where: { id: dto.installmentId },
        include: { contract: true },
      });
      if (!installment) throw new NotFoundException('Parcela não encontrada');
      if (installment.status === 'PAID') throw new BadRequestException('A parcela já está paga');
      if (installment.status === 'CANCELLED' || installment.status === 'RENEGOTIATED') {
        throw new BadRequestException('A parcela não pode ser paga');
      }

      const amountDueCents = reaisToCents(installment.amountDue);
      const interestDueCents = reaisToCents(installment.interestDue);
      const amountPaidCents = reaisToCents(installment.amountPaid);

      const daysLate = Math.max(0, daysBetween(startOfDay(installment.dueDate), startOfDay(paidAt)));
      // Single source of truth — credits any fine/mora already paid so charges
      // are never recomputed from scratch and charged twice.
      const outstanding = computeOutstanding({
        amountDueCents,
        amountPaidCents,
        lateFeePaidCents: reaisToCents(installment.lateFee),
        lateInterestPaidCents: reaisToCents(installment.lateInterest),
        daysLate,
        fineRate: Number(installment.contract.lateFeeRate),
        monthlyInterestRate: Number(installment.contract.lateInterestRate),
      });

      const baseRemaining = outstanding.baseOutstandingCents;
      const totalOwedCents = outstanding.totalOutstandingCents;
      // Reject overpayment exactly — no silent slack that would be recorded on
      // the payment but allocated to nothing.
      if (payCents > totalOwedCents) {
        throw new BadRequestException(
          `Amount exceeds total due (R$ ${centsToReais(totalOwedCents).toFixed(2)})`,
        );
      }

      // Waterfall: arrears interest (mora) -> fine -> installment interest -> principal.
      const payMora = Math.min(payCents, outstanding.interestOutstandingCents);
      let rem = payCents - payMora;
      const payFine = Math.min(rem, outstanding.fineOutstandingCents);
      rem -= payFine;
      const payBase = Math.min(rem, baseRemaining);

      // Interest-first within the installment base (the documented order). Since
      // interest is always settled before principal, the interest already paid
      // is exactly min(amountPaid, interestDue) — so the per-payment split stays
      // correct across multiple partial payments without a separate column.
      const interestPaidBefore = Math.min(amountPaidCents, interestDueCents);
      const interestOwed = Math.max(0, interestDueCents - interestPaidBefore);
      const interestPortion = Math.min(payBase, interestOwed);
      const principalPortion = payBase - interestPortion;

      const allocatedCents = payMora + payFine + payBase;
      const newAmountPaidCents = amountPaidCents + payBase;
      const fullyPaid = newAmountPaidCents >= amountDueCents;
      const newStatus: InstallmentStatus = fullyPaid
        ? InstallmentStatus.PAID
        : InstallmentStatus.PARTIALLY_PAID;

      const payment = await tx.payment.create({
        data: {
          idempotencyKey: dto.idempotencyKey,
          contractId: installment.contractId,
          installmentId: installment.id,
          amount: centsToDecimal(allocatedCents),
          method: dto.method ?? PaymentMethod.PIX,
          paidAt,
          principalPortion: centsToDecimal(principalPortion),
          interestPortion: centsToDecimal(interestPortion),
          lateFeePortion: centsToDecimal(payFine),
          lateInterestPortion: centsToDecimal(payMora),
          notes: dto.notes,
          registeredById: actorId,
        },
      });
      await tx.installment.update({
        where: { id: installment.id },
        data: {
          amountPaid: centsToDecimal(newAmountPaidCents),
          lateFee: centsToDecimal(reaisToCents(installment.lateFee) + payFine),
          lateInterest: centsToDecimal(reaisToCents(installment.lateInterest) + payMora),
          status: newStatus,
          paidAt: fullyPaid ? paidAt : null,
        },
      });

      // Settlement recompute + arrears refresh join THIS transaction.
      await this.contracts.recomputeContractStatus(installment.contractId, tx);
      await this.collections.refreshContract(installment.contractId, tx);

      return {
        payment,
        newStatus,
        allocation: { payMora, payFine, principalPortion, interestPortion, allocatedCents },
      };
      });
    } catch (err) {
      // Concurrent same-key submissions: the unique index throws P2002 on the
      // loser — return the already-persisted payment instead of erroring.
      if (dto.idempotencyKey && (err as { code?: string }).code === 'P2002') {
        const prior = await this.prisma.payment.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (prior) return prior;
      }
      throw err;
    }
    const { payment, newStatus, allocation } = result;

    await this.audit.record({
      userId: actorId,
      action: 'PAYMENT',
      entity: 'Installment',
      entityId: dto.installmentId,
      after: {
        amount: centsToReais(allocation.allocatedCents),
        principal: centsToReais(allocation.principalPortion),
        interest: centsToReais(allocation.interestPortion),
        fine: centsToReais(allocation.payFine),
        arrearsInterest: centsToReais(allocation.payMora),
        status: newStatus,
      },
    });

    return payment;
  }

  /** Convenience: pays the full outstanding amount (base + charges) of an installment. */
  async settleInstallment(installmentId: string, dto: SettleInstallmentDto, actorId?: string) {
    const preview = await this.contracts.previewCharges(installmentId, dto.paidAt);
    return this.register(
      {
        installmentId,
        amount: preview.totalDue,
        method: dto.method,
        paidAt: dto.paidAt,
        idempotencyKey: dto.idempotencyKey,
      },
      actorId,
    );
  }

  async list(query: PaymentQueryDto) {
    const { skip, take, page, pageSize } = buildPagination(query);
    const where: Prisma.PaymentWhereInput = {
      ...(query.contractId ? { contractId: query.contractId } : {}),
      ...(query.search
        ? {
            OR: [
              { contract: { number: { contains: query.search, mode: 'insensitive' } } },
              { contract: { customer: { name: { contains: query.search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        skip,
        take,
        orderBy: { paidAt: query.sortOrder },
        include: {
          installment: { select: { number: true } },
          contract: { select: { number: true } },
          registeredBy: { select: { id: true, name: true } },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);
    return paginatedResponse(data, total, page, pageSize);
  }
}
