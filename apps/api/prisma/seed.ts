/* eslint-disable no-console */
import {
  AmortizationType,
  ContractStatus,
  CustomerType,
  InstallmentStatus,
  PaymentMethod,
  PrismaClient,
  ProposalStatus,
  Role,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { computeCet, computeLateCharges, simulate } from '../src/domain/finance/finance';
import { estimateIofCents } from '../src/domain/finance/fees';
import { DEFAULT_POLICY, evaluateCredit } from '../src/domain/finance/credit-policy';
import { centsToDecimal, reaisToCents } from '../src/domain/finance/money';
import { addMonths, daysBetween, startOfDay } from '../src/common/utils/date.util';
import { buildSequentialNumber } from '../src/common/utils/sequence.util';

const prisma = new PrismaClient();

const hash = (p: string) => argon2.hash(p, { type: argon2.argon2id });
const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

async function seedUsers() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@credflow.dev';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123456';

  const users: { name: string; email: string; role: Role; password: string }[] = [
    { name: 'Administrador', email: adminEmail, role: Role.ADMIN, password: adminPassword },
    { name: 'Gerente Geral', email: 'gerente@credflow.dev', role: Role.MANAGER, password: 'Gerente@123' },
    { name: 'Ana Analista', email: 'analista@credflow.dev', role: Role.ANALYST, password: 'Analista@123' },
    { name: 'Otto Operador', email: 'operador@credflow.dev', role: Role.OPERATOR, password: 'Operador@123' },
    { name: 'Auro Auditor', email: 'auditor@credflow.dev', role: Role.AUDITOR, password: 'Auditor@123' },
  ];

  const created: Record<string, { id: string }> = {};
  for (const u of users) {
    const passwordHash = await hash(u.password);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: { name: u.name, email: u.email, role: u.role, passwordHash },
      update: { name: u.name, role: u.role },
    });
    created[u.role] = user;
  }
  console.log(`✓ ${users.length} users ready`);
  return created;
}

interface CustomerSeed {
  type: CustomerType;
  name: string;
  tradeName?: string;
  document: string;
  email: string;
  phone: string;
  birthDate?: string;
  foundationDate?: string;
  occupation: string;
  monthlyIncome: number;
  internalScore: number;
  city: string;
  state: string;
}

const CUSTOMERS: CustomerSeed[] = [
  { type: 'INDIVIDUAL', name: 'João Pereira da Silva', document: '39053344705', email: 'joao.silva@email.com', phone: '11999990001', birthDate: '1988-04-12', occupation: 'Engenheiro', monthlyIncome: 12000, internalScore: 840, city: 'São Paulo', state: 'SP' },
  { type: 'INDIVIDUAL', name: 'Maria Aparecida Souza', document: '11144477735', email: 'maria.souza@email.com', phone: '11999990002', birthDate: '1992-09-03', occupation: 'Médica', monthlyIncome: 18000, internalScore: 780, city: 'Campinas', state: 'SP' },
  { type: 'INDIVIDUAL', name: 'Carlos Eduardo Lima', document: '12345678909', email: 'carlos.lima@email.com', phone: '21999990003', birthDate: '1979-12-20', occupation: 'Comerciante', monthlyIncome: 6500, internalScore: 610, city: 'Rio de Janeiro', state: 'RJ' },
  { type: 'INDIVIDUAL', name: 'Fernanda Oliveira Costa', document: '93541134780', email: 'fernanda.costa@email.com', phone: '31999990004', birthDate: '1995-06-15', occupation: 'Designer', monthlyIncome: 4200, internalScore: 540, city: 'Belo Horizonte', state: 'MG' },
  { type: 'INDIVIDUAL', name: 'Roberto Almeida Santos', document: '04619173816', email: 'roberto.santos@email.com', phone: '41999990005', birthDate: '1985-02-28', occupation: 'Motorista', monthlyIncome: 3200, internalScore: 390, city: 'Curitiba', state: 'PR' },
  { type: 'COMPANY', name: 'Tech Solutions Ltda', tradeName: 'TechSol', document: '11222333000181', email: 'contato@techsol.com.br', phone: '1133330001', foundationDate: '2015-03-10', occupation: 'Tecnologia', monthlyIncome: 85000, internalScore: 820, city: 'São Paulo', state: 'SP' },
  { type: 'COMPANY', name: 'Padaria Pão Quente ME', tradeName: 'Pão Quente', document: '40688202000142', email: 'financeiro@paoquente.com.br', phone: '1133330002', foundationDate: '2018-08-22', occupation: 'Alimentício', monthlyIncome: 22000, internalScore: 660, city: 'Santo André', state: 'SP' },
  { type: 'COMPANY', name: 'Construtora Horizonte S.A.', tradeName: 'Horizonte', document: '45283163000167', email: 'credito@horizonte.com.br', phone: '1133330003', foundationDate: '2010-01-15', occupation: 'Construção Civil', monthlyIncome: 320000, internalScore: 720, city: 'Guarulhos', state: 'SP' },
  { type: 'INDIVIDUAL', name: 'Patrícia Gomes Ferreira', document: '88277073868', email: 'patricia.gomes@email.com', phone: '51999990008', birthDate: '1990-11-08', occupation: 'Advogada', monthlyIncome: 9500, internalScore: 705, city: 'Porto Alegre', state: 'RS' },
  { type: 'INDIVIDUAL', name: 'Lucas Martins Rocha', document: '70423448009', email: 'lucas.rocha@email.com', phone: '71999990009', birthDate: '1998-07-19', occupation: 'Autônomo', monthlyIncome: 2800, internalScore: 480, city: 'Salvador', state: 'BA' },
];

async function seedCustomers(creatorId: string) {
  const created: { id: string; type: CustomerType; income: number; score: number; name: string }[] = [];
  for (const c of CUSTOMERS) {
    const customer = await prisma.customer.upsert({
      where: { document: c.document },
      update: { internalScore: c.internalScore, monthlyIncome: c.monthlyIncome },
      create: {
        type: c.type,
        status: 'ACTIVE',
        name: c.name,
        tradeName: c.tradeName,
        document: c.document,
        email: c.email,
        phone: c.phone,
        birthDate: c.birthDate ? new Date(c.birthDate) : null,
        foundationDate: c.foundationDate ? new Date(c.foundationDate) : null,
        occupation: c.occupation,
        monthlyIncome: c.monthlyIncome,
        internalScore: c.internalScore,
        createdById: creatorId,
        address: {
          create: { street: 'Av. Brasil', number: '1000', district: 'Centro', city: c.city, state: c.state, zipCode: '01000-000' },
        },
        contacts: { create: [{ type: 'EMAIL', value: c.email, isPrimary: true }, { type: 'MOBILE', value: c.phone }] },
      },
    });
    created.push({ id: customer.id, type: c.type, income: c.monthlyIncome, score: c.internalScore, name: c.name });
  }
  console.log(`✓ ${CUSTOMERS.length} customers ready`);
  return created;
}

let proSeq = 0;
let ctrSeq = 0;

interface LoanOpts {
  customerId: string;
  income: number;
  score: number;
  requested: number;
  term: number;
  rate: number;
  amortization: AmortizationType;
  purpose: string;
  startMonthsAgo: number; // how far in the past the contract started
  paymentsMade: number; // number of installments fully paid
  analystId: string;
  managerId: string;
}

async function createContractedLoan(o: LoanOpts) {
  const requestedCents = reaisToCents(o.requested);
  const iofCents = estimateIofCents(requestedCents, o.term);
  const tacCents = reaisToCents(150);
  const financedCents = requestedCents + iofCents + tacCents;
  const sim = simulate({ principalCents: financedCents, monthlyRate: o.rate, termMonths: o.term, amortization: o.amortization });
  const cet = computeCet(requestedCents, sim.schedule.map((s) => s.amount));

  const year = new Date().getFullYear();
  const proposalNumber = buildSequentialNumber('PRO', year, ++proSeq);

  const proposal = await prisma.creditProposal.create({
    data: {
      number: proposalNumber,
      customerId: o.customerId,
      status: ProposalStatus.CONTRACTED,
      amortizationType: o.amortization,
      requestedAmount: centsToDecimal(requestedCents),
      termMonths: o.term,
      interestRate: o.rate,
      purpose: o.purpose,
      iofAmount: centsToDecimal(iofCents),
      tacAmount: centsToDecimal(tacCents),
      financedAmount: centsToDecimal(financedCents),
      installmentAmount: centsToDecimal(sim.firstInstallmentCents),
      totalAmount: centsToDecimal(sim.totalAmountCents),
      totalInterest: centsToDecimal(sim.totalInterestCents),
      cetMonthly: round6(cet.monthly),
      cetAnnual: round6(cet.annual),
      createdById: o.analystId,
      decidedAt: new Date(),
      events: { create: [{ toStatus: 'DRAFT', changedById: o.analystId }, { fromStatus: 'UNDER_REVIEW', toStatus: 'APPROVED', changedById: o.analystId }, { fromStatus: 'APPROVED', toStatus: 'CONTRACTED', changedById: o.managerId }] },
    },
  });

  const evalResult = evaluateCredit(
    {
      internalScore: o.score,
      monthlyIncome: o.income,
      requestedAmount: o.requested,
      installmentAmount: sim.firstInstallmentCents / 100,
      termMonths: o.term,
    },
    DEFAULT_POLICY,
  );
  await prisma.creditAnalysis.create({
    data: {
      proposalId: proposal.id,
      decision: 'APPROVED',
      score: evalResult.score,
      riskBand: evalResult.riskBand,
      suggestedLimit: evalResult.suggestedLimit,
      approvedAmount: o.requested,
      reasons: evalResult.reasons,
      policyVersion: evalResult.policyVersion,
      automatic: true,
      analystId: o.analystId,
    },
  });

  const startDate = addMonths(startOfDay(new Date()), -o.startMonthsAgo);
  const firstDueDate = addMonths(startDate, 1);
  const endDate = addMonths(firstDueDate, o.term - 1);
  const contractNumber = buildSequentialNumber('CTR', year, ++ctrSeq);

  const contract = await prisma.contract.create({
    data: {
      number: contractNumber,
      proposalId: proposal.id,
      customerId: o.customerId,
      status: ContractStatus.ACTIVE,
      amortizationType: o.amortization,
      principal: centsToDecimal(financedCents),
      interestRate: o.rate,
      termMonths: o.term,
      totalAmount: centsToDecimal(sim.totalAmountCents),
      totalInterest: centsToDecimal(sim.totalInterestCents),
      iofAmount: centsToDecimal(iofCents),
      tacAmount: centsToDecimal(tacCents),
      cetAnnual: round6(cet.annual),
      lateFeeRate: 0.02,
      lateInterestRate: 0.01,
      startDate,
      firstDueDate,
      endDate,
      signedById: o.managerId,
      installments: {
        create: sim.schedule.map((s) => ({
          number: s.number,
          dueDate: addMonths(firstDueDate, s.number - 1),
          principalDue: centsToDecimal(s.principal),
          interestDue: centsToDecimal(s.interest),
          amountDue: centsToDecimal(s.amount),
        })),
      },
    },
    include: { installments: { orderBy: { number: 'asc' } } },
  });

  // Register the paid installments.
  for (let i = 0; i < o.paymentsMade && i < contract.installments.length; i++) {
    const inst = contract.installments[i];
    const s = sim.schedule[i];
    await prisma.payment.create({
      data: {
        contractId: contract.id,
        installmentId: inst.id,
        amount: centsToDecimal(s.amount),
        method: PaymentMethod.PIX,
        paidAt: addMonths(firstDueDate, i),
        principalPortion: centsToDecimal(s.principal),
        interestPortion: centsToDecimal(s.interest),
        registeredById: o.managerId,
      },
    });
    await prisma.installment.update({
      where: { id: inst.id },
      data: { amountPaid: centsToDecimal(s.amount), status: InstallmentStatus.PAID, paidAt: addMonths(firstDueDate, i) },
    });
  }

  // Flag overdue installments (due date in the past, not paid) and open a case.
  const today = startOfDay(new Date());
  let maxDays = 0;
  let totalOverdueCents = 0;
  const overdueIds: string[] = [];
  for (let i = o.paymentsMade; i < contract.installments.length; i++) {
    const inst = contract.installments[i];
    const daysLate = daysBetween(startOfDay(inst.dueDate), today);
    if (daysLate > 0) {
      overdueIds.push(inst.id);
      maxDays = Math.max(maxDays, daysLate);
      const base = reaisToCents(inst.amountDue);
      const ch = computeLateCharges(base, daysLate, 0.02, 0.01);
      totalOverdueCents += ch.totalCents;
    }
  }
  if (overdueIds.length) {
    await prisma.installment.updateMany({ where: { id: { in: overdueIds } }, data: { status: InstallmentStatus.OVERDUE } });
    await prisma.contract.update({ where: { id: contract.id }, data: { status: ContractStatus.DEFAULTED } });
    const cse = await prisma.collectionCase.create({
      data: { contractId: contract.id, status: 'IN_PROGRESS', daysOverdue: maxDays, totalOverdue: centsToDecimal(totalOverdueCents) },
    });
    await prisma.collectionInteraction.create({
      data: { caseId: cse.id, channel: 'PHONE', notes: 'Cliente contatado por telefone, alegou dificuldade momentânea.', createdById: o.managerId },
    });
    await prisma.paymentPromise.create({
      data: { caseId: cse.id, amount: Math.round(totalOverdueCents / 100), promisedDate: addMonths(today, 0), createdById: o.managerId },
    });
  } else if (o.paymentsMade >= contract.installments.length) {
    await prisma.contract.update({ where: { id: contract.id }, data: { status: ContractStatus.SETTLED, settledAt: new Date() } });
  }

  return contract;
}

async function seedStandaloneProposals(customers: { id: string }[], analystId: string) {
  const year = new Date().getFullYear();
  // A DRAFT, an UNDER_REVIEW and a REJECTED proposal for demo variety.
  const specs: { status: ProposalStatus; customerIdx: number; requested: number; term: number; rate: number }[] = [
    { status: 'DRAFT', customerIdx: 1, requested: 8000, term: 18, rate: 0.029 },
    { status: 'UNDER_REVIEW', customerIdx: 2, requested: 15000, term: 24, rate: 0.025 },
    { status: 'REJECTED', customerIdx: 4, requested: 40000, term: 36, rate: 0.039 },
  ];
  for (const sp of specs) {
    const requestedCents = reaisToCents(sp.requested);
    const iofCents = estimateIofCents(requestedCents, sp.term);
    const financedCents = requestedCents + iofCents;
    const sim = simulate({ principalCents: financedCents, monthlyRate: sp.rate, termMonths: sp.term, amortization: 'PRICE' });
    const cet = computeCet(requestedCents, sim.schedule.map((s) => s.amount));
    await prisma.creditProposal.create({
      data: {
        number: buildSequentialNumber('PRO', year, ++proSeq),
        customerId: customers[sp.customerIdx].id,
        status: sp.status,
        amortizationType: 'PRICE',
        requestedAmount: centsToDecimal(requestedCents),
        termMonths: sp.term,
        interestRate: sp.rate,
        iofAmount: centsToDecimal(iofCents),
        financedAmount: centsToDecimal(financedCents),
        installmentAmount: centsToDecimal(sim.firstInstallmentCents),
        totalAmount: centsToDecimal(sim.totalAmountCents),
        totalInterest: centsToDecimal(sim.totalInterestCents),
        cetMonthly: round6(cet.monthly),
        cetAnnual: round6(cet.annual),
        createdById: analystId,
        decidedAt: sp.status === 'REJECTED' ? new Date() : null,
        events: { create: { toStatus: sp.status, changedById: analystId } },
      },
    });
  }
  console.log('✓ standalone proposals (DRAFT / UNDER_REVIEW / REJECTED) ready');
}

async function main() {
  console.log('🌱 Seeding CredFlow...');
  const users = await seedUsers();
  const customers = await seedCustomers(users[Role.ADMIN].id);

  const existingProposals = await prisma.creditProposal.count();
  if (existingProposals > 0) {
    console.log('• Demo loans already present — skipping lifecycle seeding (idempotent).');
    await prisma.$disconnect();
    return;
  }

  const analystId = users[Role.ANALYST].id;
  const managerId = users[Role.MANAGER].id;

  // Healthy loan with a few payments made.
  await createContractedLoan({ customerId: customers[0].id, income: customers[0].income, score: customers[0].score, requested: 20000, term: 24, rate: 0.022, amortization: 'PRICE', purpose: 'Capital de giro', startMonthsAgo: 4, paymentsMade: 4, analystId, managerId });
  // SAC loan, partially paid.
  await createContractedLoan({ customerId: customers[5].id, income: customers[5].income, score: customers[5].score, requested: 120000, term: 36, rate: 0.018, amortization: 'SAC', purpose: 'Expansão', startMonthsAgo: 6, paymentsMade: 6, analystId, managerId });
  // Fully settled loan.
  await createContractedLoan({ customerId: customers[1].id, income: customers[1].income, score: customers[1].score, requested: 6000, term: 6, rate: 0.02, amortization: 'PRICE', purpose: 'Reforma', startMonthsAgo: 8, paymentsMade: 6, analystId, managerId });
  // Overdue loan -> opens a collection case.
  await createContractedLoan({ customerId: customers[2].id, income: customers[2].income, score: customers[2].score, requested: 10000, term: 12, rate: 0.035, amortization: 'PRICE', purpose: 'Compra de equipamento', startMonthsAgo: 5, paymentsMade: 1, analystId, managerId });
  // Another healthy PJ loan.
  await createContractedLoan({ customerId: customers[7].id, income: customers[7].income, score: customers[7].score, requested: 250000, term: 48, rate: 0.016, amortization: 'PRICE', purpose: 'Obra', startMonthsAgo: 2, paymentsMade: 2, analystId, managerId });

  await seedStandaloneProposals(customers, analystId);

  console.log('✓ contracts, installments, payments and a collection case created');
  console.log('\n🔑 Login: admin@credflow.dev / Admin@123456 (and gerente/analista/operador/auditor @credflow.dev)');
  console.log('✅ Seed complete.');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
