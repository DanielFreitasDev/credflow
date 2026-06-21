import { Link } from 'react-router-dom';
import { Compass, LayoutDashboard } from 'lucide-react';

/** Friendly pt-BR 404 shown inside the Layout for authenticated users. */
export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <div className="rounded-full bg-brand-50 p-5 dark:bg-brand-500/10">
        <Compass className="h-10 w-10 text-brand-600 dark:text-brand-400" />
      </div>
      <div className="max-w-md space-y-2">
        <p className="text-5xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">404</p>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Página não encontrada</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          O endereço que você acessou não existe ou foi movido. Verifique o link ou volte para o dashboard.
        </p>
      </div>
      <Link to="/" className="btn-primary">
        <LayoutDashboard className="h-4 w-4" /> Voltar ao dashboard
      </Link>
    </div>
  );
}
