import { Prisma } from '../../generated/prisma/client';

/**
 * Money is handled internally as integer **cents** to avoid binary
 * floating-point drift. Conversions happen only at the boundaries
 * (DB Decimal <-> cents <-> API reais).
 */

export function reaisToCents(value: number | string | Prisma.Decimal): number {
  const n = typeof value === 'object' ? Number(value.toString()) : Number(value);
  return Math.round(n * 100);
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
