import {
  computeCet,
  computeContractCosting,
  computeLateCharges,
  computeMonthlyIrr,
  computeOutstanding,
  pricePaymentCents,
  simulate,
} from './finance';
import { estimateIofCents } from './fees';
import { sum } from './money';
import { DEFAULT_POLICY, evaluateCredit } from './credit-policy';

describe('finance: pricePaymentCents', () => {
  it('computes the classic Price installment', () => {
    // R$ 10.000, 1%/month, 12 months -> ~R$ 888.49
    const pmt = pricePaymentCents(1_000_000, 0.01, 12);
    expect(pmt).toBe(88849);
  });

  it('falls back to straight division when rate is zero', () => {
    expect(pricePaymentCents(120_000, 0, 12)).toBe(10_000); // R$1200 / 12 = R$100,00
  });
});

describe('finance: PRICE schedule', () => {
  const result = simulate({
    principalCents: 1_000_000,
    monthlyRate: 0.02,
    termMonths: 12,
    amortization: 'PRICE',
  });

  it('amortizes the principal exactly to zero', () => {
    expect(result.schedule[result.schedule.length - 1].balance).toBe(0);
    expect(sum(result.schedule.map((s) => s.principal))).toBe(1_000_000);
  });

  it('keeps total = principal + interest', () => {
    expect(result.totalAmountCents).toBe(1_000_000 + result.totalInterestCents);
  });

  it('every installment = principal + interest', () => {
    for (const s of result.schedule) {
      expect(s.amount).toBe(s.principal + s.interest);
    }
  });
});

describe('finance: SAC schedule', () => {
  const result = simulate({
    principalCents: 1_200_000,
    monthlyRate: 0.015,
    termMonths: 24,
    amortization: 'SAC',
  });

  it('has constant principal amortization (except rounding on last)', () => {
    const base = result.schedule[0].principal;
    for (let i = 0; i < result.schedule.length - 1; i++) {
      expect(result.schedule[i].principal).toBe(base);
    }
    expect(sum(result.schedule.map((s) => s.principal))).toBe(1_200_000);
  });

  it('installments decrease over time (interest shrinks)', () => {
    expect(result.schedule[0].amount).toBeGreaterThan(
      result.schedule[result.schedule.length - 1].amount,
    );
  });

  it('zeroes the balance', () => {
    expect(result.schedule[result.schedule.length - 1].balance).toBe(0);
  });
});

describe('finance: SIMPLE interest schedule', () => {
  const P = 500_000;
  const result = simulate({
    principalCents: P,
    monthlyRate: 0.03,
    termMonths: 10,
    amortization: 'SIMPLE',
  });

  it('total interest equals P * i * n', () => {
    expect(result.totalInterestCents).toBe(Math.round(P * 0.03 * 10));
  });

  it('sums tie out exactly', () => {
    expect(sum(result.schedule.map((s) => s.amount))).toBe(result.totalAmountCents);
    expect(sum(result.schedule.map((s) => s.principal))).toBe(P);
  });
});

describe('finance: CET (IRR)', () => {
  it('equals the nominal rate when there are no fees', () => {
    const principal = 1_000_000;
    const rate = 0.02;
    const { schedule } = simulate({
      principalCents: principal,
      monthlyRate: rate,
      termMonths: 12,
      amortization: 'PRICE',
    });
    const irr = computeMonthlyIrr(
      principal, // released == financed (no fees)
      schedule.map((s) => s.amount),
    );
    expect(irr).toBeCloseTo(rate, 4);
  });

  it('CET is higher than the nominal rate when fees are financed', () => {
    const requested = 1_000_000; // cash the customer receives
    const financed = 1_050_000; // requested + IOF + TAC
    const rate = 0.02;
    const { schedule } = simulate({
      principalCents: financed,
      monthlyRate: rate,
      termMonths: 12,
      amortization: 'PRICE',
    });
    const { monthly, annual } = computeCet(
      requested,
      schedule.map((s) => s.amount),
    );
    expect(monthly).toBeGreaterThan(rate);
    expect(annual).toBeGreaterThan(Math.pow(1 + rate, 12) - 1);
  });
});

describe('finance: late charges', () => {
  it('returns no charges when not overdue', () => {
    expect(computeLateCharges(100000, 0, 0.02, 0.01)).toEqual({
      fineCents: 0,
      interestCents: 0,
      totalCents: 100000,
    });
  });

  it('applies a one-time fine plus pro-rata daily interest', () => {
    // R$1000 due, 15 days late, 2% fine, 1%/month mora
    const r = computeLateCharges(100000, 15, 0.02, 0.01);
    expect(r.fineCents).toBe(2000); // 2% of 100000
    expect(r.interestCents).toBe(Math.round(100000 * (0.01 / 30) * 15)); // 500
    expect(r.totalCents).toBe(100000 + r.fineCents + r.interestCents);
  });
});

describe('finance: outstanding balance (credits charges already paid)', () => {
  const base = {
    amountDueCents: 100000,
    amountPaidCents: 0,
    lateFeePaidCents: 0,
    lateInterestPaidCents: 0,
    daysLate: 15,
    fineRate: 0.02,
    monthlyInterestRate: 0.01,
  };

  it('returns base only when not overdue', () => {
    const o = computeOutstanding({ ...base, daysLate: 0 });
    expect(o.fineOutstandingCents).toBe(0);
    expect(o.interestOutstandingCents).toBe(0);
    expect(o.totalOutstandingCents).toBe(100000);
  });

  it('matches gross late charges when nothing was paid toward them', () => {
    const o = computeOutstanding(base);
    const gross = computeLateCharges(100000, 15, 0.02, 0.01);
    expect(o.fineOutstandingCents).toBe(gross.fineCents); // 2000
    expect(o.interestOutstandingCents).toBe(gross.interestCents); // 500
    expect(o.totalOutstandingCents).toBe(gross.totalCents); // 102500
  });

  it('credits arrears interest already paid (the reported bug)', () => {
    // R$10 already paid toward mora must reduce what is still due.
    const o = computeOutstanding({ ...base, lateInterestPaidCents: 1000 });
    expect(o.interestOutstandingCents).toBe(0); // 500 owed - 1000 paid, clamped
    expect(o.totalOutstandingCents).toBe(102000); // base 100000 + fine 2000 + mora 0
  });

  it('credits fine already paid', () => {
    const o = computeOutstanding({ ...base, lateFeePaidCents: 2000 });
    expect(o.fineOutstandingCents).toBe(0);
    expect(o.totalOutstandingCents).toBe(100500); // base + mora only
  });

  it('shrinks charges as the base is partially settled', () => {
    const o = computeOutstanding({ ...base, amountPaidCents: 40000 });
    expect(o.baseOutstandingCents).toBe(60000);
    expect(o.fineOutstandingCents).toBe(1200); // 2% of 60000
    expect(o.interestOutstandingCents).toBe(300); // 60000 * 0.01/30 * 15
    expect(o.totalOutstandingCents).toBe(61500);
  });

  it('is idempotent: paying the full total leaves nothing owed', () => {
    const before = computeOutstanding(base); // total 102500
    // Apply the waterfall: mora 500, fine 2000, base 100000.
    const after = computeOutstanding({
      ...base,
      amountPaidCents: 100000,
      lateFeePaidCents: before.fineOutstandingCents,
      lateInterestPaidCents: before.interestOutstandingCents,
    });
    expect(after.totalOutstandingCents).toBe(0);
  });
});

describe('finance: contract costing honours the approved amount', () => {
  // Reproduces the reported scenario: R$10.000 requested over 12 months.
  const requestedCents = 1_000_000;
  const proposalIofCents = estimateIofCents(requestedCents, 12); // 33_320
  const baseInput = {
    requestedCents,
    proposalIofCents,
    tacCents: 0,
    monthlyRate: 0.035,
    termMonths: 12,
    amortization: 'PRICE' as const,
  };

  it('reproduces the proposal when approved == requested', () => {
    const c = computeContractCosting({ ...baseInput, approvedCents: requestedCents });
    expect(c.iofCents).toBe(proposalIofCents);
    expect(c.financedCents).toBe(requestedCents + proposalIofCents); // 1_033_320 (R$10.333,20)
  });

  it('re-derives financed amount from a reduced approval (the bug)', () => {
    const c = computeContractCosting({ ...baseInput, approvedCents: 500_000 }); // approve R$5.000
    expect(c.iofCents).toBe(Math.round((proposalIofCents * 500_000) / 1_000_000)); // 16_660
    expect(c.financedCents).toBe(500_000 + 16_660); // 516_660 (R$5.166,60), NOT 1_033_320
    expect(c.financedCents).toBeLessThan(requestedCents);
    expect(c.cetAnnual).toBeGreaterThan(0);
  });

  it('scales TAC-free financing and keeps the schedule consistent', () => {
    const c = computeContractCosting({ ...baseInput, approvedCents: 500_000 });
    expect(c.schedule).toHaveLength(12);
    expect(sum(c.schedule.map((s) => s.amount))).toBe(c.totalAmountCents);
    expect(c.totalAmountCents).toBe(c.financedCents + c.totalInterestCents);
  });

  it('rejects a non-positive approved amount', () => {
    expect(() => computeContractCosting({ ...baseInput, approvedCents: 0 })).toThrow();
  });
});

describe('credit policy', () => {
  it('auto-approves a strong profile within limit', () => {
    const r = evaluateCredit(
      {
        internalScore: 820,
        monthlyIncome: 10000,
        requestedAmount: 20000,
        installmentAmount: 1800,
        termMonths: 12,
      },
      DEFAULT_POLICY,
    );
    expect(r.decision).toBe('APPROVED');
    expect(r.riskBand).toBe('A');
    expect(r.approvedAmount).toBeGreaterThan(0);
  });

  it('auto-rejects on active delinquency', () => {
    const r = evaluateCredit({
      internalScore: 800,
      monthlyIncome: 10000,
      requestedAmount: 5000,
      installmentAmount: 500,
      termMonths: 12,
      hasActiveDelinquency: true,
    });
    expect(r.decision).toBe('REJECTED');
  });

  it('sends high commitment but decent score to manual review', () => {
    const r = evaluateCredit({
      internalScore: 700,
      monthlyIncome: 3000,
      requestedAmount: 30000,
      installmentAmount: 1100, // ~37% commitment
      termMonths: 36,
    });
    expect(r.decision).toBe('MANUAL_REVIEW');
  });
});
