import { roundCents, sum } from './money';

export type AmortizationType = 'PRICE' | 'SAC' | 'SIMPLE';

export interface ScheduleEntry {
  number: number;
  principal: number; // cents amortized this period
  interest: number; // cents of interest this period
  amount: number; // cents paid this period (principal + interest)
  balance: number; // outstanding principal after the payment, cents
}

export interface SimulationInput {
  /** Financed amount in cents (principal the installments are computed on). */
  principalCents: number;
  /** Monthly interest rate as a fraction, e.g. 0.025 for 2.5%/month. */
  monthlyRate: number;
  termMonths: number;
  amortization: AmortizationType;
}

export interface SimulationResult {
  schedule: ScheduleEntry[];
  totalAmountCents: number;
  totalInterestCents: number;
  firstInstallmentCents: number;
}

/**
 * Fixed installment (Tabela Price / French amortization):
 *   PMT = P * i / (1 - (1+i)^-n)
 */
export function pricePaymentCents(principalCents: number, monthlyRate: number, n: number): number {
  if (n <= 0) throw new Error('termMonths must be > 0');
  if (monthlyRate === 0) return roundCents(principalCents / n);
  const factor = monthlyRate / (1 - Math.pow(1 + monthlyRate, -n));
  return roundCents(principalCents * factor);
}

function buildPriceSchedule(P: number, i: number, n: number): ScheduleEntry[] {
  const pmt = pricePaymentCents(P, i, n);
  const schedule: ScheduleEntry[] = [];
  let balance = P;
  for (let k = 1; k <= n; k++) {
    const interest = roundCents(balance * i);
    let principal: number;
    let amount: number;
    if (k < n) {
      principal = pmt - interest;
      amount = pmt;
    } else {
      // Final installment pays off the exact remaining balance.
      principal = balance;
      amount = principal + interest;
    }
    balance -= principal;
    schedule.push({ number: k, principal, interest, amount, balance: Math.max(balance, 0) });
  }
  return schedule;
}

function buildSacSchedule(P: number, i: number, n: number): ScheduleEntry[] {
  const basePrincipal = roundCents(P / n);
  const schedule: ScheduleEntry[] = [];
  let balance = P;
  for (let k = 1; k <= n; k++) {
    const interest = roundCents(balance * i);
    const principal = k < n ? basePrincipal : balance; // last absorbs rounding remainder
    const amount = principal + interest;
    balance -= principal;
    schedule.push({ number: k, principal, interest, amount, balance: Math.max(balance, 0) });
  }
  return schedule;
}

function buildSimpleSchedule(P: number, i: number, n: number): ScheduleEntry[] {
  const totalInterest = roundCents(P * i * n);
  const total = P + totalInterest;
  const installment = roundCents(total / n);
  const basePrincipal = roundCents(P / n);
  const schedule: ScheduleEntry[] = [];
  let balance = P;
  for (let k = 1; k <= n; k++) {
    let principal: number;
    let amount: number;
    if (k < n) {
      principal = basePrincipal;
      amount = installment;
    } else {
      principal = balance;
      amount = total - installment * (n - 1); // close exactly
    }
    const interest = amount - principal;
    balance -= principal;
    schedule.push({ number: k, principal, interest, amount, balance: Math.max(balance, 0) });
  }
  return schedule;
}

export function simulate(input: SimulationInput): SimulationResult {
  const { principalCents, monthlyRate, termMonths, amortization } = input;
  if (principalCents <= 0) throw new Error('principalCents must be > 0');

  let schedule: ScheduleEntry[];
  switch (amortization) {
    case 'PRICE':
      schedule = buildPriceSchedule(principalCents, monthlyRate, termMonths);
      break;
    case 'SAC':
      schedule = buildSacSchedule(principalCents, monthlyRate, termMonths);
      break;
    case 'SIMPLE':
      schedule = buildSimpleSchedule(principalCents, monthlyRate, termMonths);
      break;
    default:
      throw new Error(`Unknown amortization: ${amortization}`);
  }

  const totalAmountCents = sum(schedule.map((s) => s.amount));
  const totalInterestCents = sum(schedule.map((s) => s.interest));
  return {
    schedule,
    totalAmountCents,
    totalInterestCents,
    firstInstallmentCents: schedule[0]?.amount ?? 0,
  };
}

/**
 * Effective monthly rate (IRR) that equates the cash actually released to the
 * customer with the present value of the installment stream. Solved by
 * bisection (NPV is monotonically decreasing in i, so it always converges).
 */
export function computeMonthlyIrr(releasedCents: number, payments: number[]): number {
  if (releasedCents <= 0 || payments.length === 0) return 0;

  const npv = (rate: number): number =>
    payments.reduce((acc, pmt, idx) => acc + pmt / Math.pow(1 + rate, idx + 1), 0) - releasedCents;

  let low = 0;
  let high = 5; // 500%/month upper bound — far beyond any realistic CET
  if (npv(low) <= 0) return 0; // no positive cost (released >= sum of payments)

  for (let iter = 0; iter < 200; iter++) {
    const mid = (low + high) / 2;
    const value = npv(mid);
    if (Math.abs(value) < 1e-6) return mid;
    if (value > 0) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** Total Effective Cost (CET) given the net amount released and the payment stream. */
export function computeCet(
  releasedCents: number,
  payments: number[],
): { monthly: number; annual: number } {
  const monthly = computeMonthlyIrr(releasedCents, payments);
  const annual = Math.pow(1 + monthly, 12) - 1;
  return { monthly, annual };
}

export interface LateCharges {
  fineCents: number; // multa (one-time)
  interestCents: number; // juros de mora (pro-rata daily)
  totalCents: number; // amount due + fine + interest
}

/**
 * Late charges on an overdue installment:
 *  - fine: one-time percentage over the outstanding amount (multa)
 *  - mora: monthly rate applied pro-rata per day in arrears
 */
export function computeLateCharges(
  outstandingCents: number,
  daysLate: number,
  fineRate: number,
  monthlyInterestRate: number,
): LateCharges {
  if (daysLate <= 0 || outstandingCents <= 0) {
    return { fineCents: 0, interestCents: 0, totalCents: outstandingCents };
  }
  const fineCents = roundCents(outstandingCents * fineRate);
  const dailyRate = monthlyInterestRate / 30;
  const interestCents = roundCents(outstandingCents * dailyRate * daysLate);
  return {
    fineCents,
    interestCents,
    totalCents: outstandingCents + fineCents + interestCents,
  };
}
