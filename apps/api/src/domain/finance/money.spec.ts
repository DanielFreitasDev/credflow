import { centsToDecimal, centsToReais, reaisToCents, roundCents, sum } from './money';

describe('money: reaisToCents', () => {
  it('converts the 2-decimal values the DTOs accept exactly', () => {
    expect(reaisToCents(0)).toBe(0);
    expect(reaisToCents(1)).toBe(100);
    expect(reaisToCents(1.5)).toBe(150);
    expect(reaisToCents(1.55)).toBe(155);
    expect(reaisToCents(0.1)).toBe(10);
    expect(reaisToCents(0.07)).toBe(7);
    expect(reaisToCents(100000.99)).toBe(10000099);
    expect(reaisToCents(1033.32)).toBe(103332);
  });

  it('accepts string and Decimal-like (.toString) inputs', () => {
    expect(reaisToCents('250.00')).toBe(25000);
    expect(reaisToCents({ toString: () => '516.66' } as never)).toBe(51666);
  });

  it('rounds sub-cent inputs half-up without float drift (the latent bug)', () => {
    // Math.round(1.005 * 100) === 100 because 1.005 is 1.00499.. in float.
    expect(reaisToCents(1.005)).toBe(101);
    expect(reaisToCents(8.165)).toBe(817);
    expect(reaisToCents(0.575)).toBe(58);
    expect(reaisToCents(2.005)).toBe(201);
  });

  it('is robust to junk / non-finite input', () => {
    expect(reaisToCents(Number.NaN)).toBe(0);
    expect(reaisToCents(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('matches the legacy Math.round(n*100) for every 2-decimal value in a wide range', () => {
    for (let cents = 0; cents <= 200000; cents += 1) {
      const reais = cents / 100;
      expect(reaisToCents(reais)).toBe(cents);
    }
  });
});

describe('money: helpers', () => {
  it('centsToReais and centsToDecimal round-trip', () => {
    expect(centsToReais(103332)).toBe(1033.32);
    expect(centsToDecimal(103332)).toBe('1033.32');
    expect(centsToDecimal(7)).toBe('0.07');
  });

  it('roundCents and sum', () => {
    expect(roundCents(10.4)).toBe(10);
    expect(roundCents(10.5)).toBe(11);
    expect(sum([1, 2, 3, 4])).toBe(10);
  });
});
