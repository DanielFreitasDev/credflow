import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { CsvColumn, toCsv } from './csv.util';

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const iso = (d: Date | null | undefined): string => (d ? new Date(d).toISOString() : '');
const AUDIT_EXPORT_CAP = 10000;

/**
 * CSV exports for the main domains. Documents are exported masked (last 4) and
 * every export is recorded in the audit trail (actor + row count).
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async audited<T>(
    name: string,
    actorId: string | undefined,
    rows: T[],
    columns: CsvColumn<T>[],
    extra?: Record<string, unknown>,
  ): Promise<string> {
    await this.audit.record({
      userId: actorId,
      action: 'EXPORT',
      entity: 'Report',
      entityId: name,
      after: { rows: rows.length, format: 'csv', ...extra },
    });
    return toCsv(columns, rows);
  }

  async customers(actorId?: string): Promise<string> {
    const rows = await this.prisma.customer.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        name: true,
        type: true,
        status: true,
        documentLast4: true,
        email: true,
        phone: true,
        monthlyIncome: true,
        internalScore: true,
        createdAt: true,
      },
    });
    return this.audited('customers', actorId, rows, [
      { header: 'Nome', value: (r) => r.name },
      { header: 'Tipo', value: (r) => r.type },
      { header: 'Status', value: (r) => r.status },
      { header: 'Documento', value: (r) => (r.documentLast4 ? `***${r.documentLast4}` : '') },
      { header: 'Email', value: (r) => r.email },
      { header: 'Telefone', value: (r) => r.phone },
      { header: 'Renda/Faturamento', value: (r) => num(r.monthlyIncome) },
      { header: 'Score', value: (r) => r.internalScore },
      { header: 'Criado em', value: (r) => iso(r.createdAt) },
    ]);
  }

  async proposals(actorId?: string): Promise<string> {
    const rows = await this.prisma.creditProposal.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        number: true,
        status: true,
        requestedAmount: true,
        financedAmount: true,
        termMonths: true,
        interestRate: true,
        installmentAmount: true,
        cetAnnual: true,
        createdAt: true,
        customer: { select: { name: true } },
      },
    });
    return this.audited('proposals', actorId, rows, [
      { header: 'Número', value: (r) => r.number },
      { header: 'Cliente', value: (r) => r.customer?.name },
      { header: 'Status', value: (r) => r.status },
      { header: 'Solicitado', value: (r) => num(r.requestedAmount) },
      { header: 'Financiado', value: (r) => num(r.financedAmount) },
      { header: 'Prazo (meses)', value: (r) => r.termMonths },
      { header: 'Taxa mensal', value: (r) => num(r.interestRate) },
      { header: 'Parcela', value: (r) => num(r.installmentAmount) },
      { header: 'CET anual', value: (r) => num(r.cetAnnual) },
      { header: 'Criada em', value: (r) => iso(r.createdAt) },
    ]);
  }

  async contracts(actorId?: string): Promise<string> {
    const rows = await this.prisma.contract.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        number: true,
        status: true,
        principal: true,
        totalAmount: true,
        termMonths: true,
        interestRate: true,
        cetAnnual: true,
        startDate: true,
        endDate: true,
        customer: { select: { name: true } },
      },
    });
    return this.audited('contracts', actorId, rows, [
      { header: 'Número', value: (r) => r.number },
      { header: 'Cliente', value: (r) => r.customer?.name },
      { header: 'Status', value: (r) => r.status },
      { header: 'Principal', value: (r) => num(r.principal) },
      { header: 'Total', value: (r) => num(r.totalAmount) },
      { header: 'Prazo (meses)', value: (r) => r.termMonths },
      { header: 'Taxa mensal', value: (r) => num(r.interestRate) },
      { header: 'CET anual', value: (r) => num(r.cetAnnual) },
      { header: 'Início', value: (r) => iso(r.startDate) },
      { header: 'Fim', value: (r) => iso(r.endDate) },
    ]);
  }

  async payments(actorId?: string): Promise<string> {
    const rows = await this.prisma.payment.findMany({
      orderBy: { paidAt: 'desc' },
      select: {
        amount: true,
        method: true,
        paidAt: true,
        principalPortion: true,
        interestPortion: true,
        lateFeePortion: true,
        lateInterestPortion: true,
        contract: { select: { number: true } },
        installment: { select: { number: true } },
      },
    });
    return this.audited('payments', actorId, rows, [
      { header: 'Contrato', value: (r) => r.contract?.number },
      { header: 'Parcela', value: (r) => r.installment?.number },
      { header: 'Valor', value: (r) => num(r.amount) },
      { header: 'Método', value: (r) => r.method },
      { header: 'Pago em', value: (r) => iso(r.paidAt) },
      { header: 'Principal', value: (r) => num(r.principalPortion) },
      { header: 'Juros', value: (r) => num(r.interestPortion) },
      { header: 'Multa', value: (r) => num(r.lateFeePortion) },
      { header: 'Mora', value: (r) => num(r.lateInterestPortion) },
    ]);
  }

  async collections(actorId?: string): Promise<string> {
    const rows = await this.prisma.collectionCase.findMany({
      orderBy: { daysOverdue: 'desc' },
      select: {
        status: true,
        daysOverdue: true,
        totalOverdue: true,
        openedAt: true,
        resolvedAt: true,
        contract: { select: { number: true, customer: { select: { name: true } } } },
      },
    });
    return this.audited('collections', actorId, rows, [
      { header: 'Contrato', value: (r) => r.contract?.number },
      { header: 'Cliente', value: (r) => r.contract?.customer?.name },
      { header: 'Status', value: (r) => r.status },
      { header: 'Dias em atraso', value: (r) => r.daysOverdue },
      { header: 'Em atraso (com encargos)', value: (r) => num(r.totalOverdue) },
      { header: 'Aberto em', value: (r) => iso(r.openedAt) },
      { header: 'Resolvido em', value: (r) => iso(r.resolvedAt) },
    ]);
  }

  async auditLogs(actorId?: string): Promise<string> {
    // Cap the export and record whether it was truncated (no silent caps).
    const total = await this.prisma.auditLog.count();
    const rows = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: AUDIT_EXPORT_CAP,
      select: { createdAt: true, userId: true, action: true, entity: true, entityId: true },
    });
    return this.audited(
      'audit',
      actorId,
      rows,
      [
        { header: 'Data', value: (r) => iso(r.createdAt) },
        { header: 'Usuário', value: (r) => r.userId },
        { header: 'Ação', value: (r) => r.action },
        { header: 'Entidade', value: (r) => r.entity },
        { header: 'ID da entidade', value: (r) => r.entityId },
      ],
      { total, capped: total > rows.length },
    );
  }
}
