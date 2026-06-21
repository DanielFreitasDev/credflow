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
  const schedule: ScheduleEntry[] = [];
  let balance = P;
  let cumPrincipal = 0;
  let cumInterest = 0;
  for (let k = 1; k <= n; k++) {
    // Cumulative ("largest remainder") rounding: each period's value is the
    // difference of rounded running totals. This guarantees every row's
    // principal/interest is **non-negative**, the per-period amounts stay
    // within a cent of each other, and the sums tie out exactly to P and
    // totalInterest — the last installment still absorbs the residue, but no
    // row can ever go negative (the previous `total - installment*(n-1)` form
    // produced a negative last installment for sub-cent installment sizes).
    const nextCumPrincipal = roundCents((P * k) / n);
    const nextCumInterest = roundCents((totalInterest * k) / n);
    const principal = nextCumPrincipal - cumPrincipal;
    const interest = nextCumInterest - cumInterest;
    cumPrincipal = nextCumPrincipal;
    cumInterest = nextCumInterest;
    const amount = principal + interest;
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

  if (npv(0) <= 0) return 0; // no positive cost (released >= sum of payments)

  // Expand the upper bound until it actually brackets the root. The old fixed
  // `high = 5` silently returned ~5 (and a garbage CET) whenever the true IRR
  // exceeded 500%/month; adaptive expansion keeps the result correct for any
  // effective rate the inputs imply.
  let low = 0;
  let high = 1; // 100%/month starting bound
  const HIGH_CAP = 1e6;
  while (npv(high) > 0 && high < HIGH_CAP) high *= 2;

  // Relative tolerance: NPV scales with `releasedCents`, so an absolute
  // 1e-6-cent threshold never converges for very large principals (it would fall
  // through to the midpoint). Scaling the tolerance to the released amount makes
  // the solver converge cleanly at every scale.
  const tolerance = Math.max(1e-6, releasedCents * 1e-9);
  for (let iter = 0; iter < 300; iter++) {
    const mid = (low + high) / 2;
    const value = npv(mid);
    if (Math.abs(value) < tolerance) return mid;
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

/**
 * Largest magnitude representable by the CET columns (`Decimal(12,6)` — six
 * integer digits, six fractional). A 200%/month loan annualises to ~4095, well
 * inside this; the clamp only ever fires on absurd, non-amortizing inputs and
 * exists purely so a persist can never throw a numeric-overflow (Postgres
 * 22003) on a regulated disclosure field.
 */
export const CET_MAX = 999999.999999;

/** Clamp a CET fraction to the persisted `Decimal(12,6)` domain (defensive). */
export function clampCet(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(value, CET_MAX);
}

/**
 * True when a PRICE schedule never amortizes — i.e. a non-final installment
 * pays zero (or negative) principal because the fixed payment does not even
 * cover the period's interest. Such a "loan" is really a balloon and should be
 * rejected at the product boundary rather than silently generated.
 */
/**
 * Minimum share of the first installment that must go to principal for a PRICE
 * schedule to count as genuinely amortizing. The unrounded first-principal
 * fraction equals (1+i)^-n, so this threshold is scale-independent — it depends
 * only on the rate and term, not the principal size. At 0.001 it flags grossly
 * back-loaded high-rate loans (e.g. ≥200%/month) while leaving normal SAC/SIMPLE
 * schedules within the DTO's rate/term limits untouched.
 */
export const MIN_FIRST_PRINCIPAL_FRACTION = 0.001;

export function isNonAmortizing(schedule: ScheduleEntry[]): boolean {
  if (schedule.length <= 1) return false;
  // Any non-final installment that pays no principal is a balloon.
  if (schedule.slice(0, -1).some((e) => e.principal <= 0)) return true;
  // Scale-independent guard: if the first installment amortizes a negligible
  // fraction of the payment (the payment barely exceeds the period interest),
  // the schedule is balloon-like regardless of principal size — closing the gap
  // where the same product was accepted for a large principal but rejected for a
  // small one purely due to rounding.
  const first = schedule[0];
  return first.amount > 0 && first.principal / first.amount < MIN_FIRST_PRINCIPAL_FRACTION;
}

export interface ContractCostingInput {
  /** Cash released to the customer (option A: the approved amount), cents. */
  approvedCents: number;
  /** Originally requested amount, used to scale IOF proportionally, cents. */
  requestedCents: number;
  /** IOF the proposal computed (on the requested amount), cents. */
  proposalIofCents: number;
  /** Opening fee (TAC) agreed on the proposal — kept as an absolute value, cents. */
  tacCents: number;
  monthlyRate: number;
  termMonths: number;
  amortization: AmortizationType;
}

export interface ContractCosting {
  approvedCents: number;
  iofCents: number;
  tacCents: number;
  financedCents: number;
  schedule: ScheduleEntry[];
  totalAmountCents: number;
  totalInterestCents: number;
  cetMonthly: number;
  cetAnnual: number;
}

/**
 * Re-derives a contract's financial terms from the **approved** amount so the
 * contract honours the credit decision instead of the originally requested
 * value. IOF scales proportionally to the approved/requested ratio (it is a
 * principal- and term-based tax); TAC is preserved as agreed. When the approved
 * amount equals the requested one the result is identical to the proposal, so
 * the normal flow is unchanged.
 */
export function computeContractCosting(input: ContractCostingInput): ContractCosting {
  if (input.approvedCents <= 0) throw new Error('approvedCents must be > 0');
  const iofCents =
    input.approvedCents === input.requestedCents || input.requestedCents <= 0
      ? input.proposalIofCents
      : roundCents((input.proposalIofCents * input.approvedCents) / input.requestedCents);
  const financedCents = input.approvedCents + iofCents + input.tacCents;
  const sim = simulate({
    principalCents: financedCents,
    monthlyRate: input.monthlyRate,
    termMonths: input.termMonths,
    amortization: input.amortization,
  });
  // CET equates the cash released (approved) to the installment stream.
  const cet = computeCet(input.approvedCents, sim.schedule.map((s) => s.amount));
  return {
    approvedCents: input.approvedCents,
    iofCents,
    tacCents: input.tacCents,
    financedCents,
    schedule: sim.schedule,
    totalAmountCents: sim.totalAmountCents,
    totalInterestCents: sim.totalInterestCents,
    cetMonthly: cet.monthly,
    cetAnnual: cet.annual,
  };
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
  options?: { maxInterestCents?: number },
): LateCharges {
  // Defensive clamps: negative rates/days/amounts must never produce negative
  // charges (the rates come from mutable Contract columns).
  const safeOutstanding = Math.max(0, outstandingCents);
  const safeDays = Math.max(0, daysLate);
  const safeFineRate = Math.max(0, fineRate);
  const safeMonthlyRate = Math.max(0, monthlyInterestRate);
  if (safeDays <= 0 || safeOutstanding <= 0) {
    return { fineCents: 0, interestCents: 0, totalCents: safeOutstanding };
  }
  const fineCents = roundCents(safeOutstanding * safeFineRate);
  const dailyRate = safeMonthlyRate / 30;
  let interestCents = roundCents(safeOutstanding * dailyRate * safeDays);
  // Optional ceiling so arrears interest can't grow without bound over years.
  if (options?.maxInterestCents != null) {
    interestCents = Math.min(interestCents, Math.max(0, options.maxInterestCents));
  }
  return {
    fineCents,
    interestCents,
    totalCents: safeOutstanding + fineCents + interestCents,
  };
}

export interface OutstandingInput {
  /** Original installment value (principal + interest), cents. */
  amountDueCents: number;
  /** Base amount already settled toward the installment value, cents. */
  amountPaidCents: number;
  /** Fine (multa) already paid on this installment, cents. */
  lateFeePaidCents: number;
  /** Arrears interest (mora) already paid on this installment, cents. */
  lateInterestPaidCents: number;
  daysLate: number;
  fineRate: number;
  monthlyInterestRate: number;
}

export interface OutstandingState {
  /** Base still owed (installment value minus base already paid), cents. */
  baseOutstandingCents: number;
  /** Fine still owed after crediting fine already paid, cents. */
  fineOutstandingCents: number;
  /** Arrears interest still owed after crediting mora already paid, cents. */
  interestOutstandingCents: number;
  /** base + fine + arrears interest still owed, cents. */
  totalOutstandingCents: number;
  daysLate: number;
}

/**
 * Remaining balance of an overdue installment, **crediting charges already paid**.
 *
 * Late charges accrue on the base still outstanding (`computeLateCharges`), and
 * any fine/mora the customer has already settled (`lateFeePaidCents` /
 * `lateInterestPaidCents`) is subtracted from what is still owed. This is the
 * single source of truth shared by the payment waterfall, the charge preview,
 * the collections case total and the dashboard — so a partial payment toward
 * mora/fine is never charged twice.
 */
export function computeOutstanding(input: OutstandingInput): OutstandingState {
  const baseOutstandingCents = Math.max(0, input.amountDueCents - input.amountPaidCents);
  if (baseOutstandingCents <= 0 || input.daysLate <= 0) {
    return {
      baseOutstandingCents,
      fineOutstandingCents: 0,
      interestOutstandingCents: 0,
      totalOutstandingCents: baseOutstandingCents,
      daysLate: Math.max(0, input.daysLate),
    };
  }
  const gross = computeLateCharges(
    baseOutstandingCents,
    input.daysLate,
    input.fineRate,
    input.monthlyInterestRate,
    // Cap arrears interest (mora) at 100% of the overdue base, so total
    // exposure on an installment can never exceed roughly double the base —
    // a sane contractual ceiling instead of unbounded multi-year accrual.
    { maxInterestCents: baseOutstandingCents },
  );
  const fineOutstandingCents = Math.max(0, gross.fineCents - input.lateFeePaidCents);
  const interestOutstandingCents = Math.max(0, gross.interestCents - input.lateInterestPaidCents);
  return {
    baseOutstandingCents,
    fineOutstandingCents,
    interestOutstandingCents,
    totalOutstandingCents:
      baseOutstandingCents + fineOutstandingCents + interestOutstandingCents,
    daysLate: input.daysLate,
  };
}
