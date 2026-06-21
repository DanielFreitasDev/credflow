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
});
