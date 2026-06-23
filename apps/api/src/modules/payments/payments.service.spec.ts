import { BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

/**
 * Unit tests for the payment allocation money-path. Prisma is mocked: the
 * interactive `$transaction` invokes its callback with a `tx` stub, so we can
 * assert the exact waterfall split written to `payment.create` without a DB.
 */
describe('PaymentsService.register — allocation', () => {
  function setup(installment: Record<string, unknown>, prior?: unknown) {
    const created: Record<string, unknown>[] = [];
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      installment: {
        findUnique: jest.fn().mockResolvedValue(installment),
        update: jest.fn().mockResolvedValue({}),
      },
      payment: {
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return Promise.resolve({ id: 'pay_1', ...data });
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx)),
      payment: { findUnique: jest.fn().mockResolvedValue(prior ?? null) },
    };
    const contracts = { recomputeContractStatus: jest.fn().mockResolvedValue(undefined) };
    const collections = { refreshContract: jest.fn().mockResolvedValue(undefined) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new PaymentsService(
      prisma as never,
      contracts as never,
      collections as never,
      audit as never,
    );
    return { service, tx, created };
  }

  const futureInstallment = {
    id: 'inst_1',
    status: 'PENDING',
    dueDate: new Date('2099-01-01'),
    amountDue: 1007.35,
    interestDue: 258.33,
    principalDue: 749.02,
    amountPaid: 0,
    lateFee: 0,
    lateInterest: 0,
    contractId: 'ctr_1',
    contract: { lateFeeRate: 0.02, lateInterestRate: 0.01 },
  };

  it('allocates a partial payment INTEREST-FIRST (not pro-rata)', async () => {
    const { service, created } = setup({ ...futureInstallment });
    await service.register({ installmentId: 'inst_1', amount: 100 } as never, 'user_1');
    // R$100 against a non-overdue installment with R$258.33 interest still owed:
    // interest-first books the whole R$100 to interest, R$0 to principal.
    expect(created[0].interestPortion).toBe('100.00');
    expect(created[0].principalPortion).toBe('0.00');
    expect(created[0].lateFeePortion).toBe('0.00');
    expect(created[0].lateInterestPortion).toBe('0.00');
  });

  it('books principal only AFTER the installment interest is fully covered', async () => {
    const { service, created } = setup({ ...futureInstallment });
    // Pay R$300: R$258.33 to interest, remainder R$41.67 to principal.
    await service.register({ installmentId: 'inst_1', amount: 300 } as never, 'user_1');
    expect(created[0].interestPortion).toBe('258.33');
    expect(created[0].principalPortion).toBe('41.67');
  });

  it('rejects overpayment exactly (no silent slack)', async () => {
    const { service } = setup({ ...futureInstallment });
    await expect(
      service.register({ installmentId: 'inst_1', amount: 1007.36 } as never, 'user_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allocates an overdue payment to arrears interest (mora) before fine/base', async () => {
    const overdue = {
      ...futureInstallment,
      status: 'OVERDUE',
      dueDate: new Date('2026-05-22'),
      amountDue: 1000,
      interestDue: 0,
      principalDue: 1000,
    };
    const { service, created } = setup(overdue);
    // ~30 days late @ 1%/mo mora on R$1000 -> mora is ~R$10. Paying R$5 (safely
    // below the mora) must land entirely on mora, nothing on fine/base — proving
    // the mora-first waterfall regardless of the exact day count.
    await service.register(
      { installmentId: 'inst_1', amount: 5, paidAt: '2026-06-21T12:00:00.000Z' } as never,
      'user_1',
    );
    expect(created[0].lateInterestPortion).toBe('5.00');
    expect(created[0].lateFeePortion).toBe('0.00');
    expect(created[0].principalPortion).toBe('0.00');
    expect(created[0].interestPortion).toBe('0.00');
  });

  it('replays idempotently: a duplicate key returns the prior payment, no re-charge', async () => {
    const prior = { id: 'pay_prior' };
    const { service, tx } = setup({ ...futureInstallment }, prior);
    const out = await service.register(
      { installmentId: 'inst_1', amount: 100, idempotencyKey: 'k1' } as never,
      'user_1',
    );
    expect(out).toBe(prior);
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('rejects a future-dated payment (would overcharge mora)', async () => {
    const { service } = setup({ ...futureInstallment });
    const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    await expect(
      service.register({ installmentId: 'inst_1', amount: 100, paidAt: future } as never, 'user_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a same-day payment whose timestamp is ahead of now', async () => {
    // Regression: the web date-only picker pins today to local noon, so a
    // payment registered in the morning arrives with a timestamp ahead of the
    // current instant but on the same calendar day. The future check compares
    // by day, so this must be accepted — not rejected as "future-dated".
    const { service, created } = setup({ ...futureInstallment });
    const now = new Date();
    const laterToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
    );
    await service.register(
      { installmentId: 'inst_1', amount: 100, paidAt: laterToday.toISOString() } as never,
      'user_1',
    );
    expect(created[0].interestPortion).toBe('100.00');
  });
});
