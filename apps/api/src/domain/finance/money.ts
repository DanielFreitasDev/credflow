import { Prisma } from '../../generated/prisma/client';

/**
 * Money is handled internally as integer **cents** to avoid binary
 * floating-point drift. Conversions happen only at the boundaries
 * (DB Decimal <-> cents <-> API reais).
 */

export function reaisToCents(value: number | string | Prisma.Decimal): number {
  const raw = (typeof value === 'object' ? value.toString() : String(value)).trim();
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  // Decimal-safe conversion: assemble cents from the digits instead of computing
  // `Math.round(n * 100)`, whose binary float multiply mis-rounds sub-cent
  // boundaries (e.g. 1.005 -> 100 instead of 101). For the 2-decimal values the
  // DTOs accept the result is byte-identical to the old path (no float involved
  // at all); this only hardens the boundary against any future >2dp / computed
  // input, honouring the "money is integer cents" invariant at the edge.
  if (/[eE]/.test(raw)) return Math.round(n * 100); // scientific notation: fall back
  const negative = raw.startsWith('-');
  const [intPart = '0', fracPart = ''] = raw.replace(/^[+-]/, '').split('.');
  const whole = Number(intPart || '0');
  const frac2 = Number((fracPart + '00').slice(0, 2));
  const roundUp = fracPart.length > 2 && Number(fracPart[2]) >= 5 ? 1 : 0;
  const cents = whole * 100 + frac2 + roundUp;
  return negative ? -cents : cents;
}

export function centsToReais(cents: number): number {
  return Math.round(cents) / 100;
}

/** Returns a value safe to persist into a Prisma Decimal(14,2) column. */
export function centsToDecimal(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2);
}

export function roundCents(value: number): number {
  return Math.round(value);
}

export function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}
