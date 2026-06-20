import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ProposalsController } from '../src/modules/proposals/proposals.controller';
import { ProposalsService } from '../src/modules/proposals/proposals.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/common/audit/audit.service';

/**
 * Exercises the HTTP + validation + finance pipeline end-to-end for the
 * stateless simulation endpoint (no database required).
 */
describe('Proposals simulation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProposalsController],
      providers: [
        ProposalsService,
        { provide: PrismaService, useValue: {} },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /proposals/simulate returns a full schedule, totals and CET', async () => {
    const res = await request(app.getHttpServer())
      .post('/proposals/simulate')
      .send({ amortizationType: 'PRICE', requestedAmount: 10000, termMonths: 12, interestRate: 0.02 })
      .expect(200);

    expect(res.body.schedule).toHaveLength(12);
    expect(res.body.installmentAmount).toBeGreaterThan(0);
    expect(res.body.totalAmount).toBeGreaterThan(res.body.financedAmount);
    expect(res.body.cetAnnual).toBeGreaterThan(0);
  });

  it('rejects an invalid payload with 400', async () => {
    await request(app.getHttpServer())
      .post('/proposals/simulate')
      .send({ amortizationType: 'PRICE', requestedAmount: -5, termMonths: 0, interestRate: 0.02 })
      .expect(400);
  });
});
