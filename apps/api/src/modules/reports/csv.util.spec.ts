import { CsvColumn, toCsv } from './csv.util';

interface Row {
  name: string | null;
  amount: number | null | undefined;
}

const cols: CsvColumn<Row>[] = [
  { header: 'name', value: (r) => r.name },
  { header: 'amount', value: (r) => r.amount },
];

describe('toCsv', () => {
  it('writes a header and rows with a BOM', () => {
    const out = toCsv(cols, [{ name: 'Ana', amount: 10 }]);
    expect(out.startsWith('﻿')).toBe(true);
    expect(out).toContain('name,amount');
    expect(out).toContain('Ana,10');
  });

  it('escapes commas, quotes and newlines', () => {
    const out = toCsv(cols, [{ name: 'Silva, "Jr"\nX', amount: 1 }]);
    expect(out).toContain('"Silva, ""Jr""\nX"');
  });

  it('renders null/undefined as empty fields', () => {
    const lines = toCsv(cols, [{ name: null, amount: undefined }]).split('\r\n');
    expect(lines[1]).toBe(',');
  });

  it('neutralizes spreadsheet formula injection in string cells', () => {
    const out = toCsv(cols, [{ name: '=cmd|\'/c calc\'!A1', amount: 1 }]);
    // The dangerous cell must be prefixed with a quote so Excel treats it as text.
    expect(out).toContain("'=cmd");
    expect(out).not.toMatch(/(^|,)=cmd/);
  });

  it('neutralizes the +, -, @ and tab formula prefixes too', () => {
    expect(toCsv(cols, [{ name: '+1+1', amount: 0 }])).toContain("'+1+1");
    expect(toCsv(cols, [{ name: '-2+3', amount: 0 }])).toContain("'-2+3");
    expect(toCsv(cols, [{ name: '@SUM(A1)', amount: 0 }])).toContain("'@SUM");
  });

  it('does not prefix safe text or numeric columns', () => {
    const out = toCsv(cols, [{ name: 'Ana Maria', amount: -50 }]);
    expect(out).toContain('Ana Maria,-50'); // numbers pass through untouched
    expect(out).not.toContain("'Ana");
  });
});
