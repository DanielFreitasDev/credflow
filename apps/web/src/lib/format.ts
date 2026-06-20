export const currency = (value?: number | null): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0);

export const number = (value?: number | null, digits = 0): string =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(
    value ?? 0,
  );

/** Renders a fraction (0.025) as a percentage string ("2,50%"). */
export const percentFromFraction = (fraction?: number | null, digits = 2): string =>
  `${number((fraction ?? 0) * 100, digits)}%`;

export const percent = (value?: number | null, digits = 2): string => `${number(value ?? 0, digits)}%`;

export const date = (iso?: string | null): string =>
  iso ? new Intl.DateTimeFormat('pt-BR').format(new Date(iso)) : '—';

export const dateTime = (iso?: string | null): string =>
  iso ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) : '—';

export const formatDocument = (doc?: string): string => {
  if (!doc) return '—';
  const d = doc.replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return doc;
};

export const monthLabel = (ym: string): string => {
  const [y, m] = ym.split('-');
  const names = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${names[parseInt(m, 10) - 1]}/${y.slice(2)}`;
};

// ---- Human labels for enums (pt-BR) ----
export const customerTypeLabel: Record<string, string> = {
  INDIVIDUAL: 'Pessoa Física',
  COMPANY: 'Pessoa Jurídica',
};

export const customerStatusLabel: Record<string, string> = {
  PROSPECT: 'Prospect',
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  BLOCKED: 'Bloqueado',
};

export const proposalStatusLabel: Record<string, string> = {
  DRAFT: 'Rascunho',
  UNDER_REVIEW: 'Em análise',
  APPROVED: 'Aprovada',
  REJECTED: 'Recusada',
  CANCELLED: 'Cancelada',
  CONTRACTED: 'Contratada',
};

export const contractStatusLabel: Record<string, string> = {
  ACTIVE: 'Ativo',
  SETTLED: 'Quitado',
  DEFAULTED: 'Inadimplente',
  CANCELLED: 'Cancelado',
  RENEGOTIATED: 'Renegociado',
};

export const installmentStatusLabel: Record<string, string> = {
  PENDING: 'A vencer',
  PARTIALLY_PAID: 'Parcial',
  PAID: 'Pago',
  OVERDUE: 'Vencido',
  RENEGOTIATED: 'Renegociado',
  CANCELLED: 'Cancelado',
};

export const collectionStatusLabel: Record<string, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em andamento',
  PROMISE: 'Promessa',
  NEGOTIATING: 'Negociando',
  RESOLVED: 'Resolvido',
  WRITTEN_OFF: 'Baixado',
};

export const amortizationLabel: Record<string, string> = {
  PRICE: 'Price (parcela fixa)',
  SAC: 'SAC (amortização constante)',
  SIMPLE: 'Juros simples',
};

export const roleLabel: Record<string, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  ANALYST: 'Analista',
  OPERATOR: 'Operador',
  AUDITOR: 'Auditor',
};

export const decisionLabel: Record<string, string> = {
  APPROVED: 'Aprovada',
  REJECTED: 'Recusada',
  MANUAL_REVIEW: 'Análise manual',
};
