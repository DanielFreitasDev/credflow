/** Date helpers used by the loan schedule. All UTC-safe and DST-agnostic. */

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const targetMonth = d.getMonth() + months;
  const result = new Date(d.getFullYear(), targetMonth, d.getDate());
  // Handle month overflow (e.g. Jan 31 + 1 month -> Feb 28/29).
  if (result.getDate() < d.getDate()) {
    result.setDate(0);
  }
  result.setHours(12, 0, 0, 0); // noon avoids timezone date shifts
  return result;
}

export function daysBetween(from: Date, to: Date): number {
  const MS = 1000 * 60 * 60 * 24;
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.floor((b - a) / MS);
}

export function startOfDay(date: Date): Date {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function yearsBetween(from: Date, to: Date): number {
  let age = to.getFullYear() - from.getFullYear();
  const m = to.getMonth() - from.getMonth();
  if (m < 0 || (m === 0 && to.getDate() < from.getDate())) age--;
  return age;
}
