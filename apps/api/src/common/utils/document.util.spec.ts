import { isValidCnpj, isValidCpf, formatDocument, onlyDigits } from './document.util';

describe('document validation', () => {
  it('validates correct CPFs', () => {
    expect(isValidCpf('390.533.447-05')).toBe(true);
    expect(isValidCpf('11144477735')).toBe(true);
  });

  it('rejects invalid CPFs', () => {
    expect(isValidCpf('123.456.789-00')).toBe(false);
    expect(isValidCpf('00000000000')).toBe(false);
    expect(isValidCpf('123')).toBe(false);
  });

  it('validates correct CNPJs', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
  });

  it('rejects invalid CNPJs', () => {
    expect(isValidCnpj('11.222.333/0001-00')).toBe(false);
    expect(isValidCnpj('11111111111111')).toBe(false);
  });

  it('normalizes and formats documents', () => {
    expect(onlyDigits('390.533.447-05')).toBe('39053344705');
    expect(formatDocument('39053344705')).toBe('390.533.447-05');
    expect(formatDocument('11222333000181')).toBe('11.222.333/0001-81');
  });
});
