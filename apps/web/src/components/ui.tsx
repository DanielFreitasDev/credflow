import { ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Loader2, Inbox, AlertTriangle, X, ChevronDown, Check, Search } from 'lucide-react';

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

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Lock body scroll + remember the element that had focus before opening.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      // Restore focus to whatever was focused before the modal opened.
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  // Move focus inside the dialog when it opens.
  useEffect(() => {
    if (!open) return;
    const node = dialogRef.current;
    if (!node) return;
    const first = node.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (first ?? node).focus();
  }, [open]);

  // Close on Esc and trap Tab within the dialog.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const node = dialogRef.current;
      if (!node) return;
      const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusable.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  const widths = { md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-16 dark:bg-black/60"
      onMouseDown={(e) => {
        // Close only when the backdrop itself is pressed, not when a press inside bubbles up.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={clsx('card w-full p-6 focus:outline-hidden', widths[size])}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-slate-50">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A styled confirmation dialog (replaces native window.confirm), built on Modal. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
  loading = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-5">
        <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={tone === 'danger' ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <Spinner className="h-4 w-4" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export type SelectOption = { value: string; label: string; disabled?: boolean };

/**
 * A themed, accessible dropdown that replaces the native <select> across the app.
 * Keyboard-driven (arrows / Home / End / Enter / Esc / type-ahead), ARIA listbox
 * semantics, dark-mode aware, and an optional search box (auto-enabled past 6
 * options). Controlled via `value`/`onChange`; pair with RHF's <Controller> for forms.
 */
export function Select({
  value,
  onChange,
  options,
  id,
  name,
  placeholder = 'Selecione...',
  disabled = false,
  searchable,
  searchPlaceholder = 'Buscar...',
  className,
  triggerClassName,
  onBlur,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  id?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Force the search box on/off. Defaults to auto: on when there are > 6 options. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Classes for the wrapper — use this to set width (defaults to `w-full`). */
  className?: string;
  /** Extra classes for the trigger button (e.g. height/padding/text size). */
  triggerClassName?: string;
  onBlur?: () => void;
  'aria-label'?: string;
}) {
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ buffer: '', at: 0 });

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [dropUp, setDropUp] = useState(false);

  const showSearch = searchable ?? options.length > 6;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const selected = options.find((o) => o.value === value);
  const activeId = filtered[activeIndex] ? `${baseId}-opt-${activeIndex}` : undefined;

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setQuery('');
    if (refocus) triggerRef.current?.focus();
  }, []);

  const selectOption = useCallback(
    (opt: SelectOption | undefined) => {
      if (!opt || opt.disabled) return;
      onChange(opt.value);
      close(true);
    },
    [onChange, close],
  );

  const openMenu = useCallback(() => {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      setDropUp(below < 288 && rect.top > below);
    }
    const idx = options.findIndex((o) => o.value === value);
    setActiveIndex(idx >= 0 ? idx : 0);
    setOpen(true);
  }, [disabled, options, value]);

  // Focus the search box (or list) when the menu opens.
  useEffect(() => {
    if (open) (showSearch ? searchRef.current : listRef.current)?.focus();
  }, [open, showSearch]);

  // Keep the highlighted option scrolled into view.
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, query]);

  // Close when pointing outside the component.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
        onBlur?.();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, onBlur]);

  const moveActive = (delta: number) => {
    const n = filtered.length;
    if (n === 0) return;
    setActiveIndex((i) => {
      let next = i;
      for (let step = 0; step < n; step++) {
        next = (next + delta + n) % n;
        if (!filtered[next]?.disabled) return next;
      }
      return i;
    });
  };

  const edgeActive = (fromEnd: boolean) => {
    const list = fromEnd ? [...filtered].reverse() : filtered;
    const found = list.findIndex((o) => !o.disabled);
    if (found >= 0) setActiveIndex(fromEnd ? filtered.length - 1 - found : found);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (open) moveActive(1);
        else openMenu();
        return;
      case 'ArrowUp':
        e.preventDefault();
        if (open) moveActive(-1);
        else openMenu();
        return;
      case 'Home':
        if (open) { e.preventDefault(); edgeActive(false); }
        return;
      case 'End':
        if (open) { e.preventDefault(); edgeActive(true); }
        return;
      case 'Enter':
        if (open) { e.preventDefault(); selectOption(filtered[activeIndex]); }
        return;
      case 'Escape':
        if (open) { e.preventDefault(); e.stopPropagation(); close(true); }
        return;
      case 'Tab':
        if (open) { setOpen(false); setQuery(''); onBlur?.(); }
        return;
      case ' ':
        if (!open) { e.preventDefault(); openMenu(); }
        else if (!showSearch) { e.preventDefault(); selectOption(filtered[activeIndex]); }
        return;
      default:
        // Type-ahead only when there's no search box to type into.
        if (!showSearch && e.key.length === 1 && e.key.trim()) {
          if (!open) openMenu();
          const now = e.timeStamp;
          const t = typeahead.current;
          t.buffer = now - t.at > 800 ? e.key : t.buffer + e.key;
          t.at = now;
          const q = t.buffer.toLowerCase();
          const found = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(q));
          if (found >= 0) setActiveIndex(found);
        }
    }
  };

  return (
    <div ref={wrapperRef} className={clsx('relative', className ?? 'w-full')}>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        ref={triggerRef}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close(true) : openMenu())}
        onKeyDown={onKeyDown}
        onBlur={() => { if (!open) onBlur?.(); }}
        className={clsx(
          'input flex w-full items-center justify-between gap-2 text-left',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          triggerClassName,
        )}
      >
        <span className={clsx('truncate', !selected && 'text-slate-400 dark:text-slate-500')}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className={clsx('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          className={clsx(
            'card absolute left-0 right-0 z-50 overflow-hidden shadow-lg ring-1 ring-black/5 dark:ring-white/10',
            dropUp ? 'bottom-full mb-1' : 'top-full mt-1',
          )}
        >
          {showSearch && (
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 dark:border-slate-800">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
                onKeyDown={onKeyDown}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                aria-controls={listboxId}
                aria-activedescendant={activeId}
                className="w-full bg-transparent py-2 text-sm placeholder:text-slate-400 focus:outline-hidden dark:text-slate-100"
              />
            </div>
          )}
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            tabIndex={-1}
            aria-label={ariaLabel}
            aria-activedescendant={activeId}
            onKeyDown={showSearch ? undefined : onKeyDown}
            className="max-h-60 overflow-auto py-1 focus:outline-hidden"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-slate-400 dark:text-slate-500">Nenhum resultado</li>
            ) : (
              filtered.map((opt, i) => {
                const isSelected = opt.value === value;
                const isActive = i === activeIndex;
                return (
                  <li
                    key={opt.value}
                    id={`${baseId}-opt-${i}`}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled || undefined}
                    data-active={isActive || undefined}
                    onMouseEnter={() => setActiveIndex(i)}
                    onMouseDown={(e) => { e.preventDefault(); selectOption(opt); }}
                    className={clsx(
                      'flex items-center justify-between gap-2 px-3 py-2 text-sm',
                      opt.disabled
                        ? 'cursor-not-allowed opacity-40'
                        : isActive
                          ? 'cursor-pointer bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                          : 'cursor-pointer text-slate-700 dark:text-slate-200',
                    )}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  onPage,
  pageSize,
  onPageSize,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
  /** When provided with `onPageSize`, renders a page-size selector. */
  pageSize?: number;
  onPageSize?: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
      <div className="flex items-center gap-3">
        <span>{total} registro(s)</span>
        {pageSize != null && onPageSize && (
          <Select
            className="w-32"
            triggerClassName="h-8 py-0 text-xs"
            aria-label="Itens por página"
            searchable={false}
            value={String(pageSize)}
            onChange={(v) => onPageSize(Number(v))}
            options={[10, 20, 50].map((n) => ({ value: String(n), label: `${n} / página` }))}
          />
        )}
      </div>
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
