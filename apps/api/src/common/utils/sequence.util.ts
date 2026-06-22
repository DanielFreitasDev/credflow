import { Prisma } from '../../generated/prisma/client';

/** Builds a human-friendly document number like PRO-2026-000042. */
export function buildSequentialNumber(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(6, '0')}`;
}

/**
 * Serialises sequential-number allocation for a (prefix, year) with a Postgres
 * transaction-level advisory lock, so two concurrent creators can't read the
 * same COUNT(*) and generate a colliding number. The lock auto-releases at
 * transaction end; the unique index + retryOnUniqueViolation stay as the final
 * backstop. Must be called inside a `$transaction`.
 */
export async function acquireNumberLock(
  tx: Prisma.TransactionClient,
  prefix: string,
  year: number,
): Promise<void> {
  const key = `${prefix}-${year}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

/** Retries an operation that may hit a unique-constraint race (Prisma P2002). */
export async function retryOnUniqueViolation<T>(fn: () => Promise<T>, attempts = 8): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== 'P2002') throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}
