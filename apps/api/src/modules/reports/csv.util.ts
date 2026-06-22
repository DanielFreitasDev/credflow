export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/** UTF-8 BOM so spreadsheet apps (Excel) detect the encoding correctly. */
const BOM = '﻿';

/**
 * Neutralize CSV/Excel formula injection. A cell beginning with `= + - @` or a
 * tab/CR can be evaluated as a formula by Excel/LibreOffice/Sheets (e.g.
 * `=HYPERLINK(...)`, `=cmd|'/c calc'!A1`) — a real risk because user-controlled
 * fields (customer name/email/phone) flow into exports opened by privileged
 * analysts. Prefixing a single quote forces the value to be treated as text.
 * Applied to strings only; numeric columns we emit ourselves are never a vector.
 */
function neutralizeFormula(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/**
 * Minimal RFC-4180 CSV serializer. Neutralizes spreadsheet formula injection,
 * quotes fields containing the delimiter, quotes or line breaks, and prefixes a
 * UTF-8 BOM.
 */
export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const escape = (v: string | number | null | undefined): string => {
    if (v == null) return '';
    const s = typeof v === 'number' ? String(v) : neutralizeFormula(String(v));
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => escape(c.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => escape(c.value(row))).join(','));
  }
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
