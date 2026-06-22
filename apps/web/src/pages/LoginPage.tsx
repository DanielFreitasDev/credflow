import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { apiError } from '../lib/api';
import { Spinner } from '../components/ui';
import { Logo } from '../components/Logo';
import { LoginBackground } from '../components/LoginBackground';

export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-linear-to-br from-[#102A56] to-[#071427] p-4">
      <LoginBackground />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <Logo size="lg" onDark />
          <p className="mt-3 text-sm text-brand-100">Plataforma de Gestão de Crédito e Empréstimos</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4 p-8 shadow-2xl shadow-black/40 ring-1 ring-white/10">
          <div>
            <label className="label" htmlFor="login-email">E-mail</label>
            <input
              id="login-email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="login-password">Senha</label>
            <input
              id="login-password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30">
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading && <Spinner className="h-4 w-4" />}
            Entrar
          </button>

          {import.meta.env.DEV && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-center text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              Demo: <strong>admin@credflow.dev</strong> / <strong>Admin@123456</strong>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
