import {
  CET_MAX,
  clampCet,
  computeCet,
  computeContractCosting,
  computeLateCharges,
  computeMonthlyIrr,
  computeOutstanding,
  isNonAmortizing,
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

describe('finance: SIMPLE schedule never goes negative (regression)', () => {
  it('keeps principal/interest/amount >= 0 even for tiny or rounding-unlucky loans', () => {
    for (const P of [1, 2, 3, 5, 7, 53, 99, 100, 4399, 500_000]) {
      for (const n of [2, 3, 4, 5, 12, 24]) {
        for (const i of [0, 0.01, 0.02, 0.035]) {
          const sc = simulate({ principalCents: P, monthlyRate: i, termMonths: n, amortization: 'SIMPLE' }).schedule;
          for (const e of sc) {
            expect(e.principal).toBeGreaterThanOrEqual(0);
            expect(e.interest).toBeGreaterThanOrEqual(0);
            expect(e.amount).toBeGreaterThanOrEqual(0);
          }
          expect(sum(sc.map((s) => s.principal))).toBe(P);
          expect(sc[sc.length - 1].balance).toBe(0);
        }
      }
    }
  });
});

describe('finance: IRR/CET robustness (regression)', () => {
  it('returns a real high effective rate instead of silently clamping at the old bound', () => {
    // 100%/month loan: monthly IRR ~1.0, annual ~4095 — a real number, not ~5.
    const { schedule } = simulate({ principalCents: 100000, monthlyRate: 1.0, termMonths: 12, amortization: 'PRICE' });
    const { monthly, annual } = computeCet(100000, schedule.map((s) => s.amount));
    expect(monthly).toBeCloseTo(1.0, 2);
    expect(annual).toBeGreaterThan(4000);
  });

  it('clampCet keeps CET inside the persisted Decimal(12,6) domain and rejects junk', () => {
    expect(clampCet(4095)).toBe(4095); // realistic high CET fits, not clamped
    expect(clampCet(10 ** 9)).toBe(CET_MAX);
    expect(clampCet(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampCet(NaN)).toBe(0);
    expect(clampCet(-1)).toBe(0);
  });

  it('still converges to the nominal rate for a no-fee loan', () => {
    const { schedule } = simulate({ principalCents: 1_000_000, monthlyRate: 0.03, termMonths: 24, amortization: 'PRICE' });
    expect(computeMonthlyIrr(1_000_000, schedule.map((s) => s.amount))).toBeCloseTo(0.03, 4);
  });
});

describe('finance: late-charge guards (regression)', () => {
  it('caps arrears interest at 100% of the overdue base over long arrears', () => {
    const r = computeLateCharges(100000, 100000 /* days */, 0.02, 0.01, { maxInterestCents: 100000 });
    expect(r.interestCents).toBe(100000); // capped, not thousands of percent of the base
  });

  it('never produces negative charges for negative rates/inputs', () => {
    const r = computeLateCharges(100000, 30, -0.5, -1);
    expect(r.fineCents).toBe(0);
    expect(r.interestCents).toBe(0);
    expect(r.totalCents).toBe(100000);
  });

  it('computeOutstanding caps mora at the overdue base by default', () => {
    const o = computeOutstanding({
      amountDueCents: 100000,
      amountPaidCents: 0,
      lateFeePaidCents: 0,
      lateInterestPaidCents: 0,
      daysLate: 100000,
      fineRate: 0.02,
      monthlyInterestRate: 0.01,
    });
    expect(o.interestOutstandingCents).toBeLessThanOrEqual(100000);
  });
});

describe('finance: non-amortizing (balloon) detection', () => {
  it('flags a PRICE schedule whose payment never amortizes principal', () => {
    const { schedule } = simulate({ principalCents: 100000, monthlyRate: 2.0, termMonths: 12, amortization: 'PRICE' });
    expect(isNonAmortizing(schedule)).toBe(true);
  });

  it('does not flag a normal amortizing schedule', () => {
    const { schedule } = simulate({ principalCents: 1_000_000, monthlyRate: 0.02, termMonths: 12, amortization: 'PRICE' });
    expect(isNonAmortizing(schedule)).toBe(false);
  });

  // Regression: the old rounding-based guard accepted a grossly back-loaded loan
  // for large principals while rejecting it for small ones. The scale-independent
  // fraction guard must flag a 200%/month PRICE loan at every principal size.
  it('flags a 200%/month PRICE loan regardless of principal size', () => {
    for (const principalCents of [100_000, 1_000_000, 5_000_000, 50_000_000]) {
      const { schedule } = simulate({ principalCents, monthlyRate: 2.0, termMonths: 12, amortization: 'PRICE' });
      expect(isNonAmortizing(schedule)).toBe(true);
    }
  });

  it('does not flag a high-but-real 10%/month loan', () => {
    const { schedule } = simulate({ principalCents: 5_000_000, monthlyRate: 0.1, termMonths: 12, amortization: 'PRICE' });
    expect(isNonAmortizing(schedule)).toBe(false);
  });
});

describe('finance: IRR convergence at large scale (relative tolerance)', () => {
  it('converges to the nominal rate for a fee-free R$1B loan', () => {
    // The old absolute 1e-6-cent tolerance never triggered at this magnitude and
    // fell through to the bisection midpoint. A relative tolerance converges.
    const principalCents = 100_000_000_000; // R$ 1,000,000,000
    const { schedule } = simulate({ principalCents, monthlyRate: 0.02, termMonths: 12, amortization: 'PRICE' });
    const irr = computeMonthlyIrr(principalCents, schedule.map((s) => s.amount));
    expect(irr).toBeGreaterThan(0.0199);
    expect(irr).toBeLessThan(0.0201);
  });
});

describe('finance: PRICE/SAC schedules never go negative (regression for C1)', () => {
  // Before the fix, a rounded-up Price PMT / SAC base over-amortized the first
  // n-1 periods so the LAST installment went negative (e.g. R$1,00 / 0% / 18m ->
  // {principal:-2}). The DB CHECK then rejected the contract as an un-recoverable
  // 500. Every reachable (DTO-valid) input must now stay non-negative.
  for (const type of ['PRICE', 'SAC'] as const) {
    it(`keeps principal/interest/amount >= 0 and sums to P for ${type}`, () => {
      for (const P of [100, 101, 137, 199, 200, 300, 555, 4399, 99999, 1_000_000]) {
        for (const n of [2, 3, 5, 12, 18, 24, 40, 60, 120, 420]) {
          for (const i of [0, 0.005, 0.01, 0.02, 0.035, 0.05]) {
            const sc = simulate({
              principalCents: P,
              monthlyRate: i,
              termMonths: n,
              amortization: type,
            }).schedule;
            for (const e of sc) {
              expect(e.principal).toBeGreaterThanOrEqual(0);
              expect(e.interest).toBeGreaterThanOrEqual(0);
              expect(e.amount).toBeGreaterThanOrEqual(0);
            }
            expect(sum(sc.map((s) => s.principal))).toBe(P);
            expect(sc[sc.length - 1].balance).toBe(0);
          }
        }
      }
    });
  }

  it('the original repro (R$1,00 / 0% / 18m PRICE) no longer yields a negative installment', () => {
    const sc = simulate({ principalCents: 100, monthlyRate: 0, termMonths: 18, amortization: 'PRICE' }).schedule;
    expect(sc.every((e) => e.amount >= 0 && e.principal >= 0)).toBe(true);
    expect(sum(sc.map((s) => s.principal))).toBe(100);
  });

  it('isNonAmortizing rejects a degenerate sub-cent schedule (clean 400, not a DB 500)', () => {
    // R$1,00 over 420 months cannot amortize >= 1 cent/installment -> degenerate.
    const sc = simulate({ principalCents: 100, monthlyRate: 0, termMonths: 420, amortization: 'PRICE' }).schedule;
    expect(isNonAmortizing(sc)).toBe(true);
  });
});
