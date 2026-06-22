import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { CsvColumn, toCsv } from './csv.util';
import { ReportQueryDto } from './dto/report-query.dto';

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const iso = (d: Date | null | undefined): string => (d ? new Date(d).toISOString() : '');

// Hard ceiling on rows materialized per export. Keeps a single request from
// loading an entire table into memory; truncation is flagged in the audit log
// (no silent caps) so a clipped export is always visible.
const EXPORT_ROW_CAP = 50000;
// Fetch one row past the cap so a full result set can be told apart from a
// truncated one: `capped` is only true when that extra overflow row comes back.
const EXPORT_FETCH_LIMIT = EXPORT_ROW_CAP + 1;

/**
 * CSV exports for the main domains. Documents are exported masked (last 4),
 * every export is capped and recorded in the audit trail (actor, row count,
 * whether it was truncated, and the date filter used).
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Build an inclusive `gte`/`lte` filter from the query, or undefined if unset. */
  private range(q?: ReportQueryDto): Prisma.DateTimeFilter | undefined {
    if (!q?.from && !q?.to) return undefined;
    return {
      ...(q.from ? { gte: new Date(q.from) } : {}),
      ...(q.to ? { lte: new Date(q.to) } : {}),
    };
  }

  private async audited<T>(
    name: string,
    actorId: string | undefined,
    rows: T[],
    columns: CsvColumn<T>[],
    filter?: ReportQueryDto,
  ): Promise<string> {
    // Rows were fetched up to EXPORT_FETCH_LIMIT (cap + 1); a row beyond the cap
    // means the export was actually truncated. Drop the sentinel before emitting.
    const capped = rows.length > EXPORT_ROW_CAP;
    const exported = capped ? rows.slice(0, EXPORT_ROW_CAP) : rows;
    await this.audit.record({
      userId: actorId,
      action: 'EXPORT',
      entity: 'Report',
      entityId: name,
      after: {
        rows: exported.length,
        format: 'csv',
        capped,
        ...(filter?.from ? { from: filter.from } : {}),
        ...(filter?.to ? { to: filter.to } : {}),
      },
    });
    return toCsv(columns, exported);
  }

  async customers(actorId?: string, query?: ReportQueryDto): Promise<string> {
    const createdAt = this.range(query);
    const rows = await this.prisma.customer.findMany({
      where: createdAt ? { createdAt } : undefined,
      orderBy: { createdAt: 'desc' },
      take: EXPORT_FETCH_LIMIT,
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
    ], query);
  }

  async proposals(actorId?: string, query?: ReportQueryDto): Promise<string> {
    const createdAt = this.range(query);
    const rows = await this.prisma.creditProposal.findMany({
      where: createdAt ? { createdAt } : undefined,
      orderBy: { createdAt: 'desc' },
      take: EXPORT_FETCH_LIMIT,
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
    ], query);
  }

  async contracts(actorId?: string, query?: ReportQueryDto): Promise<string> {
    const createdAt = this.range(query);
    const rows = await this.prisma.contract.findMany({
      where: createdAt ? { createdAt } : undefined,
      orderBy: { createdAt: 'desc' },
      take: EXPORT_FETCH_LIMIT,
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
    ], query);
  }

  async payments(actorId?: string, query?: ReportQueryDto): Promise<string> {
    const paidAt = this.range(query);
    const rows = await this.prisma.payment.findMany({
      where: paidAt ? { paidAt } : undefined,
      orderBy: { paidAt: 'desc' },
      take: EXPORT_FETCH_LIMIT,
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
    ], query);
  }

  async collections(actorId?: string, query?: ReportQueryDto): Promise<string> {
    const openedAt = this.range(query);
    const rows = await this.prisma.collectionCase.findMany({
      where: openedAt ? { openedAt } : undefined,
      orderBy: { daysOverdue: 'desc' },
      take: EXPORT_FETCH_LIMIT,
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
    ], query);
  }

  async auditLogs(actorId?: string, query?: ReportQueryDto): Promise<string> {
    const createdAt = this.range(query);
    const rows = await this.prisma.auditLog.findMany({
      where: createdAt ? { createdAt } : undefined,
      orderBy: { createdAt: 'desc' },
      take: EXPORT_FETCH_LIMIT,
      select: { createdAt: true, userId: true, action: true, entity: true, entityId: true },
    });
    return this.audited('audit', actorId, rows, [
      { header: 'Data', value: (r) => iso(r.createdAt) },
      { header: 'Usuário', value: (r) => r.userId },
      { header: 'Ação', value: (r) => r.action },
      { header: 'Entidade', value: (r) => r.entity },
      { header: 'ID da entidade', value: (r) => r.entityId },
    ], query);
  }
}
