import { ReactNode } from 'react';
import clsx from 'clsx';
import { Loader2, Inbox, AlertTriangle, X } from 'lucide-react';

type Tone = 'gray' | 'green' | 'red' | 'amber' | 'blue' | 'indigo' | 'purple';

const toneClasses: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
  red: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30',
  indigo: 'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/30',
  purple: 'bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-500/30',
};

export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  // proposals
  DRAFT: 'gray',
  UNDER_REVIEW: 'amber',
  APPROVED: 'green',
  REJECTED: 'red',
  CANCELLED: 'gray',
  CONTRACTED: 'indigo',
  // contracts
  ACTIVE: 'green',
  SETTLED: 'blue',
  DEFAULTED: 'red',
  RENEGOTIATED: 'purple',
  // installments
  PENDING: 'gray',
  PARTIALLY_PAID: 'amber',
  PAID: 'green',
  OVERDUE: 'red',
  // customer
  PROSPECT: 'blue',
  INACTIVE: 'gray',
  BLOCKED: 'red',
  // collections
  OPEN: 'amber',
  IN_PROGRESS: 'blue',
  PROMISE: 'indigo',
  NEGOTIATING: 'purple',
  RESOLVED: 'green',
  WRITTEN_OFF: 'gray',
  // risk
  A: 'green',
  B: 'blue',
  C: 'amber',
  D: 'amber',
  E: 'red',
  // decision
  MANUAL_REVIEW: 'amber',
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={STATUS_TONES[status] ?? 'gray'}>{label ?? status}</Badge>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('animate-spin', className)} />;
}

export function LoadingState({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400 dark:text-slate-500">
      <Spinner className="h-8 w-8" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="rounded-full bg-slate-100 p-4 dark:bg-slate-800">
        <Inbox className="h-7 w-7 text-slate-400 dark:text-slate-500" />
      </div>
      <div>
        <p className="font-semibold text-slate-700 dark:text-slate-200">{title}</p>
        {hint && <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="rounded-full bg-rose-50 p-4 dark:bg-rose-500/10">
        <AlertTriangle className="h-7 w-7 text-rose-500" />
      </div>
      <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">{message}</p>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'md' | 'lg' | 'xl';
}) {
  if (!open) return null;
  const widths = { md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-16 dark:bg-black/60">
      <div className={clsx('card w-full p-6', widths[size])} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
      <span>{total} registro(s)</span>
      <div className="flex items-center gap-2">
        <button
          className="btn-secondary px-3 py-1"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Anterior
        </button>
        <span className="px-2">
          {page} / {totalPages}
        </span>
        <button
          className="btn-secondary px-3 py-1"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">{value}</p>
      {hint && <p className="text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  );
}
