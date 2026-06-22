import { describe, it, expect } from 'vitest';
import {
  currency,
  number,
  percent,
  percentFromFraction,
  formatDocument,
  monthLabel,
  date,
  customerTypeLabel,
  roleLabel,
} from './format';

describe('formatDocument', () => {
  it('masks an 11-digit CPF', () => {
    expect(formatDocument('12345678901')).toBe('123.456.789-01');
  });
  it('masks a 14-digit CNPJ', () => {
    expect(formatDocument('12345678000199')).toBe('12.345.678/0001-99');
  });
  it('strips non-digits before masking', () => {
    expect(formatDocument('529.982.247-25')).toBe('529.982.247-25');
  });
  it('returns a dash for empty input', () => {
    expect(formatDocument(undefined)).toBe('—');
  });
  it('returns the original string when the length is unexpected', () => {
    expect(formatDocument('123')).toBe('123');
  });
});

describe('numbers & percents (pt-BR)', () => {
  it('formats integers with a thousands separator', () => {
    expect(number(1234567)).toBe('1.234.567');
  });
  it('formats with fixed decimals', () => {
    expect(number(1234.5, 2)).toBe('1.234,50');
  });
  it('renders a fraction (0.025) as a percentage', () => {
    expect(percentFromFraction(0.025)).toBe('2,50%');
  });
  it('renders a percentage value', () => {
    expect(percent(2.5)).toBe('2,50%');
  });
  it('treats nullish input as zero', () => {
    expect(percentFromFraction(null)).toBe('0,00%');
    expect(number(null)).toBe('0');
  });
});

describe('currency', () => {
  it('formats BRL with symbol and comma decimals', () => {
    // ICU inserts a non-breaking space after the symbol, so assert the parts
    // instead of an exact string (avoids a brittle U+00A0 comparison).
    const out = currency(1234.5);
    expect(out).toContain('R$');
    expect(out).toContain('1.234,50');
  });
  it('defaults nullish to zero', () => {
    expect(currency(null)).toContain('0,00');
  });
});

describe('monthLabel', () => {
  it('maps YYYY-MM to a pt-BR short label', () => {
    expect(monthLabel('2026-06')).toBe('jun/26');
    expect(monthLabel('2026-01')).toBe('jan/26');
  });
});

describe('date', () => {
  it('returns a dash for nullish input', () => {
    expect(date(null)).toBe('—');
  });
  it('formats an ISO date as dd/mm/yyyy', () => {
    expect(date('2026-06-21T12:00:00.000Z')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});

describe('enum labels', () => {
  it('exposes pt-BR labels', () => {
    expect(customerTypeLabel.INDIVIDUAL).toBe('Pessoa Física');
    expect(roleLabel.ADMIN).toBe('Administrador');
  });
});
