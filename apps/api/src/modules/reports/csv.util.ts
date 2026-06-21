export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/** UTF-8 BOM so spreadsheet apps (Excel) detect the encoding correctly. */
const BOM = '﻿';

/**
 * Minimal RFC-4180 CSV serializer. Quotes fields containing the delimiter,
 * quotes or line breaks, and prefixes a UTF-8 BOM.
 */
export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const escape = (v: string | number | null | undefined): string => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => escape(c.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => escape(c.value(row))).join(','));
  }
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
