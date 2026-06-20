export type Role = 'ADMIN' | 'MANAGER' | 'ANALYST' | 'OPERATOR' | 'AUDITOR';
export type CustomerType = 'INDIVIDUAL' | 'COMPANY';
export type CustomerStatus = 'PROSPECT' | 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
export type AmortizationType = 'PRICE' | 'SAC' | 'SIMPLE';
export type ProposalStatus =
  | 'DRAFT'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'CONTRACTED';
export type ContractStatus = 'ACTIVE' | 'SETTLED' | 'DEFAULTED' | 'CANCELLED' | 'RENEGOTIATED';
export type InstallmentStatus =
  | 'PENDING'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'RENEGOTIATED'
  | 'CANCELLED';
export type CollectionStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'PROMISE'
  | 'NEGOTIATING'
  | 'RESOLVED'
  | 'WRITTEN_OFF';
export type RiskBand = 'A' | 'B' | 'C' | 'D' | 'E';
export type AnalysisDecision = 'APPROVED' | 'REJECTED' | 'MANUAL_REVIEW';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface Address {
  street: string;
  number?: string;
  complement?: string;
  district?: string;
  city: string;
  state: string;
  zipCode: string;
  country?: string;
}

export interface Customer {
  id: string;
  type: CustomerType;
  status: CustomerStatus;
  name: string;
  tradeName?: string;
  document: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  foundationDate?: string;
  occupation?: string;
  monthlyIncome: number;
  internalScore: number;
  notes?: string;
  createdAt: string;
  address?: Address | null;
  contacts?: { id: string; type: string; value: string; isPrimary: boolean }[];
  documents?: { id: string; type: string; number?: string | null }[];
  proposals?: Proposal[];
  contracts?: Contract[];
  _count?: { proposals: number; contracts: number };
}

export interface FinancialHistory {
  totalContracts: number;
  activeContracts: number;
  defaultedContracts: number;
  totalBorrowed: number;
  totalPaid: number;
  outstanding: number;
  overdue: number;
}

export interface ScheduleRow {
  number: number;
  principal: number;
  interest: number;
  amount: number;
  balance: number;
}

export interface SimulationResult {
  amortizationType: AmortizationType;
  interestRate: number;
  termMonths: number;
  requestedAmount: number;
  iofAmount: number;
  tacAmount: number;
  financedAmount: number;
  installmentAmount: number;
  totalAmount: number;
  totalInterest: number;
  cetMonthly: number;
  cetAnnual: number;
  schedule: ScheduleRow[];
}

export interface Analysis {
  id: string;
  decision: AnalysisDecision;
  score: number;
  riskBand: RiskBand;
  suggestedLimit: number;
  approvedAmount?: number | null;
  reasons: string[];
  policyVersion: string;
  automatic: boolean;
  analyst?: { id: string; name: string } | null;
  createdAt: string;
}

export interface Proposal {
  id: string;
  number: string;
  status: ProposalStatus;
  amortizationType: AmortizationType;
  requestedAmount: number;
  termMonths: number;
  interestRate: number;
  financedAmount: number;
  installmentAmount: number;
  totalAmount: number;
  totalInterest: number;
  iofAmount: number;
  tacAmount: number;
  cetMonthly: number;
  cetAnnual: number;
  purpose?: string;
  createdAt: string;
  customer?: Customer;
  analysis?: Analysis | null;
  contract?: { id: string; number: string; status: string } | null;
  events?: ProposalEvent[];
  schedule?: ScheduleRow[];
}

export interface ProposalEvent {
  id: string;
  fromStatus?: ProposalStatus | null;
  toStatus: ProposalStatus;
  reason?: string;
  createdAt: string;
  changedBy?: { id: string; name: string } | null;
}

export interface Installment {
  id: string;
  number: number;
  dueDate: string;
  principalDue: number;
  interestDue: number;
  amountDue: number;
  amountPaid: number;
  lateFee: number;
  lateInterest: number;
  status: InstallmentStatus;
  paidAt?: string | null;
}

export interface Payment {
  id: string;
  amount: number;
  method: string;
  paidAt: string;
  principalPortion: number;
  interestPortion: number;
  lateFeePortion: number;
  lateInterestPortion: number;
  notes?: string;
  installment?: { number: number };
  contract?: { number: string };
  registeredBy?: { id: string; name: string } | null;
}

export interface ContractSummary {
  installmentsCount: number;
  paidCount: number;
  totalDue: number;
  totalPaid: number;
  outstanding: number;
  overdue: number;
}

export interface Contract {
  id: string;
  number: string;
  status: ContractStatus;
  amortizationType: AmortizationType;
  principal: number;
  interestRate: number;
  termMonths: number;
  totalAmount: number;
  totalInterest: number;
  cetAnnual: number;
  lateFeeRate: number;
  lateInterestRate: number;
  startDate: string;
  firstDueDate: string;
  endDate: string;
  createdAt: string;
  customer?: Customer;
  installments?: Installment[];
  payments?: Payment[];
  collectionCase?: CollectionCase | null;
  summary?: ContractSummary;
  // present on list endpoint
  outstanding?: number;
  overdue?: number;
  paidCount?: number;
  installmentsCount?: number;
}

export interface ChargesPreview {
  installmentId: string;
  number: number;
  dueDate: string;
  daysLate: number;
  outstanding: number;
  fine: number;
  interest: number;
  totalDue: number;
}

export interface CollectionInteraction {
  id: string;
  channel: string;
  notes: string;
  createdAt: string;
  createdBy?: { id: string; name: string } | null;
}

export interface PaymentPromise {
  id: string;
  amount: number;
  promisedDate: string;
  status: string;
  notes?: string;
  createdAt: string;
}

export interface CollectionCase {
  id: string;
  status: CollectionStatus;
  daysOverdue: number;
  totalOverdue: number;
  openedAt: string;
  resolvedAt?: string | null;
  contract?: Contract & { customer?: Customer };
  interactions?: CollectionInteraction[];
  promises?: PaymentPromise[];
}

export interface DashboardOverview {
  kpis: {
    customers: number;
    activeContracts: number;
    proposalsPending: number;
    totalLent: number;
    totalReceived: number;
    portfolioOutstanding: number;
    totalOverdue: number;
    delinquencyRate: number;
  };
  proposalsByStatus: { status: ProposalStatus; count: number }[];
  contractsByStatus: { status: ContractStatus; count: number }[];
  customersByRisk: { band: RiskBand; count: number }[];
  upcomingReceivables: { month: string; amount: number }[];
}

export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  createdAt: string;
  user?: { id: string; name: string; email: string } | null;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
}
