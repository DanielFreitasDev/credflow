import clsx from 'clsx';

type LogoSize = 'sm' | 'lg';

const SIZES: Record<LogoSize, { symbol: string; text: string }> = {
  sm: { symbol: 'h-9', text: 'text-2xl' },
  lg: { symbol: 'h-14', text: 'text-4xl' },
};

/**
 * CredFlow lockup: brand symbol + "CredFlow" wordmark (the "Flow" half in the
 * brand gradient #255EEB→#16C7E6→#30D17A). The symbol is rendered from the
 * tight-cropped SVG so it reads large at small box sizes; the wordmark is live
 * text so it stays crisp and legible at any scale (no micro-subtitle).
 *
 * `onDark` forces a light wordmark for always-dark surfaces (e.g. the login
 * screen), where the theme-driven `dark:` variant can't be relied on.
 */
export function Logo({
  size = 'sm',
  onDark = false,
  className,
}: {
  size?: LogoSize;
  onDark?: boolean;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <img src="/brand/credflow_symbol_tight.svg" alt="" className={clsx('w-auto', s.symbol)} />
      <span className={clsx('font-extrabold leading-none tracking-tight', s.text)}>
        <span className={onDark ? 'text-white' : 'text-slate-900 dark:text-white'}>Cred</span>
        <span className="bg-linear-to-r from-[#255EEB] via-[#16C7E6] to-[#30D17A] bg-clip-text text-transparent">
          Flow
        </span>
      </span>
    </span>
  );
}
