import { roundCents } from './money';

/**
 * Simplified IOF estimate for credit operations (Brazil):
 *   IOF = principal * (0.38% fixed + 0.0082%/day, capped at 365 days)
 * Real-world IOF has per-person caps; this is a close, configurable approximation.
 */
export function estimateIofCents(principalCents: number, termMonths: number): number {
  const days = Math.min(termMonths * 30, 365);
  const rate = 0.0038 + 0.000082 * days;
  return roundCents(principalCents * rate);
}
