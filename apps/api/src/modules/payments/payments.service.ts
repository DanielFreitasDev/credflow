import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InstallmentStatus, PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { buildPagination, paginatedResponse } from '../../common/utils/pagination.util';
import { daysBetween, startOfDay } from '../../common/utils/date.util';
import { computeOutstanding } from '../../domain/finance/finance';
import { centsToDecimal, centsToReais, reaisToCents, roundCents } from '../../domain/finance/money';
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
    const installment = await this.prisma.installment.findUnique({
      where: { id: dto.installmentId },
      include: { contract: true },
    });
    if (!installment) throw new NotFoundException('Installment not found');
    if (installment.status === 'PAID') throw new BadRequestException('Installment is already paid');
    if (installment.status === 'CANCELLED' || installment.status === 'RENEGOTIATED') {
      throw new BadRequestException('Installment is not payable');
    }

    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    const amountDueCents = reaisToCents(installment.amountDue);
    const interestDueCents = reaisToCents(installment.interestDue);
    const amountPaidCents = reaisToCents(installment.amountPaid);

    const daysLate = Math.max(0, daysBetween(startOfDay(installment.dueDate), startOfDay(paidAt)));
    // Single source of truth — credits any fine/mora already paid so charges are
    // never recomputed from scratch and charged twice.
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
    const payCents = reaisToCents(dto.amount);
    if (payCents <= 0) throw new BadRequestException('Amount must be positive');
    if (payCents > totalOwedCents + 1) {
      throw new BadRequestException(
        `Amount exceeds total due (R$ ${centsToReais(totalOwedCents).toFixed(2)})`,
      );
    }

    // Waterfall allocation: arrears interest -> fine -> installment base.
    const payMora = Math.min(payCents, outstanding.interestOutstandingCents);
    let rem = payCents - payMora;
    const payFine = Math.min(rem, outstanding.fineOutstandingCents);
    rem -= payFine;
    const payBase = Math.min(rem, baseRemaining);

    const interestPortion =
      amountDueCents > 0 ? roundCents((payBase * interestDueCents) / amountDueCents) : 0;
    const principalPortion = payBase - interestPortion;

    const newAmountPaidCents = amountPaidCents + payBase;
    const fullyPaid = newAmountPaidCents >= amountDueCents;
    const newStatus: InstallmentStatus = fullyPaid
      ? InstallmentStatus.PAID
      : InstallmentStatus.PARTIALLY_PAID;

    const [payment] = await this.prisma.$transaction([
      this.prisma.payment.create({
        data: {
          contractId: installment.contractId,
          installmentId: installment.id,
          amount: centsToDecimal(payCents),
          method: dto.method ?? PaymentMethod.PIX,
          paidAt,
          principalPortion: centsToDecimal(principalPortion),
          interestPortion: centsToDecimal(interestPortion),
          lateFeePortion: centsToDecimal(payFine),
          lateInterestPortion: centsToDecimal(payMora),
          notes: dto.notes,
          registeredById: actorId,
        },
      }),
      this.prisma.installment.update({
        where: { id: installment.id },
        data: {
          amountPaid: centsToDecimal(newAmountPaidCents),
          lateFee: centsToDecimal(reaisToCents(installment.lateFee) + payFine),
          lateInterest: centsToDecimal(reaisToCents(installment.lateInterest) + payMora),
          status: newStatus,
          paidAt: fullyPaid ? paidAt : null,
        },
      }),
    ]);

    // Recompute contract settlement, then refresh arrears state.
    await this.contracts.recomputeContractStatus(installment.contractId);
    await this.collections.refreshContract(installment.contractId);

    await this.audit.record({
      userId: actorId,
      action: 'PAYMENT',
      entity: 'Installment',
      entityId: installment.id,
      after: {
        amount: centsToReais(payCents),
        principal: centsToReais(principalPortion),
        interest: centsToReais(interestPortion),
        fine: centsToReais(payFine),
        arrearsInterest: centsToReais(payMora),
        status: newStatus,
      },
    });

    return payment;
  }

  /** Convenience: pays the full outstanding amount (base + charges) of an installment. */
  async settleInstallment(installmentId: string, dto: SettleInstallmentDto, actorId?: string) {
    const preview = await this.contracts.previewCharges(installmentId, dto.paidAt);
    return this.register(
      { installmentId, amount: preview.totalDue, method: dto.method, paidAt: dto.paidAt },
      actorId,
    );
  }

  async list(query: PaymentQueryDto) {
    const { skip, take, page, pageSize } = buildPagination(query);
    const where: Prisma.PaymentWhereInput = query.contractId ? { contractId: query.contractId } : {};
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
