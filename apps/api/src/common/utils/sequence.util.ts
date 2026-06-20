/** Builds a human-friendly document number like PRO-2026-000042. */
export function buildSequentialNumber(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(6, '0')}`;
}

/** Retries an operation that may hit a unique-constraint race (Prisma P2002). */
export async function retryOnUniqueViolation<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
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
