import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { addMonths, daysBetween, monthKey, startOfDay } from '../../common/utils/date.util';
import { computeOutstanding } from '../../domain/finance/finance';
import { centsToReais, reaisToCents } from '../../domain/finance/money';

function n(v: unknown): number {
  return v == null ? 0 : Number(v);
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const today = startOfDay(new Date());
    const horizon = addMonths(today, 6);

    const [
      customersCount,
      activeContracts,
      proposalsPending,
      lentAgg,
      receivedAgg,
      outstandingAgg,
      overdueInstallments,
      proposalsByStatusRaw,
      contractsByStatusRaw,
      bandA,
      bandB,
      bandC,
      bandD,
      bandE,
      futureInstallments,
    ] = await this.prisma.$transaction([
      this.prisma.customer.count(),
      this.prisma.contract.count({ where: { status: 'ACTIVE' } }),
      this.prisma.creditProposal.count({ where: { status: { in: ['DRAFT', 'UNDER_REVIEW'] } } }),
      this.prisma.contract.aggregate({ _sum: { principal: true }, where: { status: { not: 'CANCELLED' } } }),
      this.prisma.payment.aggregate({ _sum: { amount: true } }),
      this.prisma.installment.aggregate({
        _sum: { amountDue: true, amountPaid: true },
        where: {
          status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
          contract: { status: { in: ['ACTIVE', 'DEFAULTED'] } },
        },
      }),
      this.prisma.installment.findMany({
        where: { status: 'OVERDUE' },
        select: {
          amountDue: true,
          amountPaid: true,
          lateFee: true,
          lateInterest: true,
          dueDate: true,
          contract: { select: { lateFeeRate: true, lateInterestRate: true } },
        },
      }),
      this.prisma.creditProposal.groupBy({ by: ['status'], _count: true, orderBy: { status: 'asc' } }),
      this.prisma.contract.groupBy({ by: ['status'], _count: true, orderBy: { status: 'asc' } }),
      this.prisma.customer.count({ where: { internalScore: { gte: 800 } } }),
      this.prisma.customer.count({ where: { internalScore: { gte: 680, lt: 800 } } }),
      this.prisma.customer.count({ where: { internalScore: { gte: 560, lt: 680 } } }),
      this.prisma.customer.count({ where: { internalScore: { gte: 420, lt: 560 } } }),
      this.prisma.customer.count({ where: { internalScore: { lt: 420 } } }),
      this.prisma.installment.findMany({
        where: {
          status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
          dueDate: { gte: today, lte: horizon },
          contract: { status: { in: ['ACTIVE', 'DEFAULTED'] } },
        },
        select: { dueDate: true, amountDue: true, amountPaid: true },
      }),
    ]);

    const portfolioOutstanding = round2(n(outstandingAgg._sum.amountDue) - n(outstandingAgg._sum.amountPaid));

    // Overdue is measured with the SAME domain helper as collections, so the
    // dashboard and the collection cases can no longer disagree. We expose the
    // base (principal + interest) and the late charges as named metrics instead
    // of a single ambiguous "total overdue".
    let overdueBaseCents = 0;
    let lateChargesCents = 0;
    for (const inst of overdueInstallments) {
      const o = computeOutstanding({
        amountDueCents: reaisToCents(inst.amountDue),
        amountPaidCents: reaisToCents(inst.amountPaid),
        lateFeePaidCents: reaisToCents(inst.lateFee),
        lateInterestPaidCents: reaisToCents(inst.lateInterest),
        daysLate: Math.max(0, daysBetween(startOfDay(inst.dueDate), today)),
        fineRate: Number(inst.contract.lateFeeRate),
        monthlyInterestRate: Number(inst.contract.lateInterestRate),
      });
      overdueBaseCents += o.baseOutstandingCents;
      lateChargesCents += o.fineOutstandingCents + o.interestOutstandingCents;
    }
    const overduePrincipalInterest = centsToReais(overdueBaseCents);
    const lateCharges = centsToReais(lateChargesCents);
    const totalOverdueWithCharges = centsToReais(overdueBaseCents + lateChargesCents);
    const delinquencyRate =
      portfolioOutstanding > 0 ? round2((overduePrincipalInterest / portfolioOutstanding) * 100) : 0;

    // Build the 6-month receivables flow.
    const buckets = new Map<string, number>();
    for (let i = 0; i < 6; i++) buckets.set(monthKey(addMonths(today, i)), 0);
    for (const inst of futureInstallments) {
      const key = monthKey(inst.dueDate);
      if (buckets.has(key)) {
        buckets.set(key, (buckets.get(key) ?? 0) + (n(inst.amountDue) - n(inst.amountPaid)));
      }
    }
    const upcomingReceivables = [...buckets.entries()].map(([month, amount]) => ({
      month,
      amount: round2(amount),
    }));

    return {
      kpis: {
        customers: customersCount,
        activeContracts,
        proposalsPending,
        totalLent: round2(n(lentAgg._sum.principal)),
        totalReceived: round2(n(receivedAgg._sum.amount)),
        portfolioOutstanding,
        // `totalOverdue` keeps its historical meaning: overdue principal + interest
        // (the base). Late charges are surfaced separately to remove the previous
        // dashboard-vs-collections ambiguity.
        totalOverdue: overduePrincipalInterest,
        lateCharges,
        totalOverdueWithCharges,
        delinquencyRate, // percent (over the overdue base)
      },
      proposalsByStatus: proposalsByStatusRaw.map((p) => ({ status: p.status, count: p._count })),
      contractsByStatus: contractsByStatusRaw.map((c) => ({ status: c.status, count: c._count })),
      customersByRisk: [
        { band: 'A', count: bandA },
        { band: 'B', count: bandB },
        { band: 'C', count: bandC },
        { band: 'D', count: bandD },
        { band: 'E', count: bandE },
      ],
      upcomingReceivables,
    };
  }
}
