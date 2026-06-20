import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { apiError } from '../lib/api';
import { Spinner } from '../components/ui';

export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@credflow.dev');
  const [password, setPassword] = useState('Admin@123456');
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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-600 to-brand-800 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center text-white">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-2xl font-bold backdrop-blur">
            C
          </div>
          <h1 className="text-3xl font-bold">CredFlow</h1>
          <p className="mt-1 text-brand-100">Plataforma de Gestão de Crédito e Empréstimos</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4 p-8">
          <div>
            <label className="label">E-mail</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="label">Senha</label>
            <input
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

          <p className="rounded-lg bg-slate-50 px-3 py-2 text-center text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            Demo: <strong>admin@credflow.dev</strong> / <strong>Admin@123456</strong>
          </p>
        </form>
      </div>
    </div>
  );
}
