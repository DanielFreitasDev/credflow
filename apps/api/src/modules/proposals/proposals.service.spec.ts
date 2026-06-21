import { BadRequestException } from '@nestjs/common';
import { ProposalsService } from './proposals.service';

/**
 * Product-boundary guards on the stateless simulation (shared by create()).
 * `simulate()` only runs the pure `compute()` math, so the service can be
 * exercised with no Prisma/audit/encryption dependencies.
 */
describe('ProposalsService.simulate — product guards', () => {
  const service = new ProposalsService(null as never, null as never, null as never);
  const base = {
    requestedAmount: 10000,
    termMonths: 12,
    interestRate: 0.025,
    amortizationType: 'PRICE' as const,
    autoIof: false,
  };

  it('simulates a normal loan', () => {
    const r = service.simulate({ ...base } as never);
    expect(r.installmentAmount).toBeGreaterThan(0);
    expect(r.cetMonthly).toBeGreaterThan(0);
    expect(r.schedule).toHaveLength(12);
  });

  it('rejects fees (TAC + IOF) >= the requested amount', () => {
    expect(() =>
      service.simulate({ ...base, requestedAmount: 100, tacAmount: 100, iofAmount: 50 } as never),
    ).toThrow(BadRequestException);
  });

  it('rejects an absurd-cost SIMPLE loan via the total-interest ceiling', () => {
    // 200%/month simple interest over 35 years => ~840x principal in interest.
    expect(() =>
      service.simulate({
        requestedAmount: 10000,
        termMonths: 420,
        interestRate: 2,
        amortizationType: 'SIMPLE',
        autoIof: false,
      } as never),
    ).toThrow(BadRequestException);
  });

  it('rejects a non-amortizing balloon PRICE loan', () => {
    expect(() =>
      service.simulate({
        requestedAmount: 10000,
        termMonths: 420,
        interestRate: 2,
        amortizationType: 'PRICE',
        autoIof: false,
      } as never),
    ).toThrow(BadRequestException);
  });
});
