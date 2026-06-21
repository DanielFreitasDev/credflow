import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { api, apiError, tokenStore } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { roleLabel } from '../lib/format';
import { PageHeader, Spinner, Stat } from '../components/ui';

// Mirrors the backend ChangePasswordDto: newPassword min 12 with letters + numbers.
const schema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual'),
    newPassword: z
      .string()
      .min(12, 'Mínimo de 12 caracteres')
      .regex(/(?=.*[A-Za-z])(?=.*\d)/, 'Deve conter letras e números'),
    confirmNewPassword: z.string().min(1, 'Confirme a nova senha'),
  })
  .refine((v) => v.newPassword === v.confirmNewPassword, {
    path: ['confirmNewPassword'],
    message: 'As senhas não coincidem',
  });

type FormValues = z.infer<typeof schema>;

export function ProfilePage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (v: FormValues) => {
    try {
      await api.post('/auth/change-password', {
        currentPassword: v.currentPassword,
        newPassword: v.newPassword,
      });
      // Backend revokes all sessions — drop tokens locally and force a fresh login.
      tokenStore.clear();
      toast.success('Senha alterada. Faça login novamente.');
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Minha conta" subtitle="Dados da sessão e segurança" />

      <div className="space-y-6">
        <section className="card space-y-4 p-6">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Dados do usuário</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat label="Nome" value={user?.name ?? '—'} />
            <Stat label="E-mail" value={user?.email ?? '—'} />
            <Stat label="Perfil" value={user ? roleLabel[user.role] : '—'} />
          </div>
        </section>

        <section className="card space-y-4 p-6">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Alterar senha</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Por segurança, ao trocar a senha todas as sessões são encerradas e você precisará entrar novamente.
          </p>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Field label="Senha atual" htmlFor="pf-current" error={errors.currentPassword?.message}>
              <input id="pf-current" type="password" autoComplete="current-password" className="input" {...register('currentPassword')} />
            </Field>
            <Field label="Nova senha" htmlFor="pf-new" error={errors.newPassword?.message}>
              <input
                id="pf-new"
                type="password"
                autoComplete="new-password"
                className="input"
                placeholder="mín. 12 caracteres, com letras e números"
                {...register('newPassword')}
              />
            </Field>
            <Field label="Confirmar nova senha" htmlFor="pf-confirm" error={errors.confirmNewPassword?.message}>
              <input id="pf-confirm" type="password" autoComplete="new-password" className="input" {...register('confirmNewPassword')} />
            </Field>
            <div className="flex justify-end">
              <button type="submit" className="btn-primary" disabled={isSubmitting}>
                {isSubmitting ? <Spinner className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
                Alterar senha
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

function Field({ label, error, htmlFor, children }: { label: string; error?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
