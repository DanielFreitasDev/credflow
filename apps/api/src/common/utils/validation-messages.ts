import { BadRequestException, ValidationError } from '@nestjs/common';

/**
 * Renders class-validator failures as pt-BR messages so the UI never surfaces
 * English. The frontend validates with Zod (pt-BR) before submitting, so these
 * are a server-side safety net — but they must still read in Portuguese when hit
 * (e.g. direct API calls, query params). Wired as the ValidationPipe's
 * `exceptionFactory` in main.ts.
 */

// Field name -> pt-BR label shown to the user. Unknown fields fall back to the
// raw property name (rare: every user-facing DTO field is covered here).
const FIELD_LABELS: Record<string, string> = {
  active: 'Situação',
  address: 'Endereço',
  amortizationType: 'Sistema de amortização',
  amount: 'Valor',
  approvedAmount: 'Valor aprovado',
  autoIof: 'IOF automático',
  channel: 'Canal',
  contacts: 'Contatos',
  contractId: 'Contrato',
  currentPassword: 'Senha atual',
  customerId: 'Cliente',
  date: 'Data',
  document: 'Documento',
  documents: 'Documentos',
  email: 'E-mail',
  firstDueDate: 'Primeiro vencimento',
  idempotencyKey: 'Chave de idempotência',
  installmentId: 'Parcela',
  interestRate: 'Taxa de juros',
  internalScore: 'Score interno',
  iofAmount: 'IOF',
  lateFeeRate: 'Multa por atraso',
  lateInterestRate: 'Juros de mora',
  method: 'Forma de pagamento',
  monthlyIncome: 'Renda mensal',
  name: 'Nome',
  newPassword: 'Nova senha',
  notes: 'Observações',
  page: 'Página',
  pageSize: 'Itens por página',
  paidAt: 'Data de pagamento',
  password: 'Senha',
  promisedDate: 'Data da promessa',
  purpose: 'Finalidade',
  reason: 'Motivo',
  refreshToken: 'Token de atualização',
  requestedAmount: 'Valor solicitado',
  role: 'Perfil',
  search: 'Busca',
  sortBy: 'Ordenação',
  sortOrder: 'Ordem',
  startDate: 'Data de início',
  status: 'Status',
  tacAmount: 'TAC',
  termMonths: 'Prazo (meses)',
  tradeName: 'Nome fantasia',
  type: 'Tipo',
};

const labelFor = (property: string): string => FIELD_LABELS[property] ?? property;

// First integer in the original (English) message — the constraint bound, e.g.
// "must not be greater than 600" -> "600".
const boundOf = (raw: string): string => raw.match(/-?\d+/)?.[0] ?? '';

// class-validator constraint key -> pt-BR message builder.
const CONSTRAINT_MESSAGES: Record<string, (label: string, raw: string) => string> = {
  isNotEmpty: (l) => `${l} é obrigatório`,
  isDefined: (l) => `${l} é obrigatório`,
  isString: (l) => `${l} deve ser um texto`,
  isInt: (l) => `${l} deve ser um número inteiro`,
  isNumber: (l) => `${l} deve ser um número`,
  isPositive: (l) => `${l} deve ser um valor positivo`,
  isEmail: (l) => `${l} deve ser um e-mail válido`,
  isEnum: (l) => `${l} possui um valor inválido`,
  isIn: (l) => `${l} possui um valor inválido`,
  isBoolean: (l) => `${l} deve ser verdadeiro ou falso`,
  isArray: (l) => `${l} deve ser uma lista`,
  isDate: (l) => `${l} deve ser uma data válida`,
  isDateString: (l) => `${l} deve ser uma data válida`,
  isUuid: (l) => `${l} deve ser um identificador válido`,
  matches: (l) => `${l} está em formato inválido`,
  min: (l, raw) => `${l} deve ser maior ou igual a ${boundOf(raw)}`,
  max: (l, raw) => `${l} deve ser menor ou igual a ${boundOf(raw)}`,
  minLength: (l, raw) => `${l} deve ter no mínimo ${boundOf(raw)} caracteres`,
  maxLength: (l, raw) => `${l} deve ter no máximo ${boundOf(raw)} caracteres`,
  whitelistValidation: (l) => `${l} não é um campo permitido`,
};

const translateConstraint = (key: string, label: string, raw: string): string =>
  CONSTRAINT_MESSAGES[key]?.(label, raw) ?? `${label} é inválido`;

/** Flattens a (possibly nested) ValidationError tree into pt-BR messages. */
function collectMessages(errors: ValidationError[]): string[] {
  const messages: string[] = [];
  for (const error of errors) {
    const label = labelFor(error.property);
    if (error.constraints) {
      for (const [key, raw] of Object.entries(error.constraints)) {
        messages.push(translateConstraint(key, label, raw));
      }
    }
    if (error.children?.length) {
      messages.push(...collectMessages(error.children));
    }
  }
  return messages;
}

export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const messages = collectMessages(errors);
  return new BadRequestException({
    statusCode: 400,
    error: 'BadRequest',
    message: messages.length ? messages : ['Dados inválidos'],
  });
}
