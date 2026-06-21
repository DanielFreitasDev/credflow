import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches render-time errors in the React tree and shows a friendly pt-BR
 * fallback instead of a blank screen. Wrapped around the whole app (in
 * `main.tsx`) and around the routed Layout, so a single page crash is
 * contained and the surrounding shell survives.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface the stack in the console; in production a logging service would hook here.
    console.error('ErrorBoundary caught an error', error, info);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 p-6 text-center dark:bg-slate-950">
        <div className="rounded-full bg-rose-50 p-5 dark:bg-rose-500/10">
          <AlertTriangle className="h-10 w-10 text-rose-500" />
        </div>
        <div className="max-w-md space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Algo deu errado</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Ocorreu um erro inesperado ao exibir esta página. Tente recarregar; se o problema persistir, volte ao início.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-slate-100 p-3 text-left text-xs text-rose-600 dark:bg-slate-900 dark:text-rose-400">
              {this.state.error.message}
            </pre>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button type="button" className="btn-primary" onClick={this.handleReload}>
            <RotateCw className="h-4 w-4" /> Recarregar a página
          </button>
          <a href="/" className="btn-secondary">
            <Home className="h-4 w-4" /> Voltar ao início
          </a>
        </div>
      </div>
    );
  }
}
