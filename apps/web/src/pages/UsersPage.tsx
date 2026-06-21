import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, apiError } from '../lib/api';
import { useToast } from '../lib/toast';
import { Paginated, Role, User } from '../lib/types';
import { dateTime, roleLabel } from '../lib/format';
import { Column, DataTable, SortState } from '../components/DataTable';
import { Badge, EmptyState, ErrorState, LoadingState, Modal, PageHeader, Pagination, Spinner } from '../components/ui';

const ROLES: Role[] = ['ADMIN', 'MANAGER', 'ANALYST', 'OPERATOR', 'AUDITOR'];

export function UsersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<SortState>({ by: 'createdAt', order: 'desc' });
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const toggleSort = (key: string) => {
    setSort((s) => ({ by: key, order: s.by === key && s.order === 'asc' ? 'desc' : 'asc' }));
    setPage(1);
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['users', page, pageSize, sort.by, sort.order],
    queryFn: async () =>
      (
        await api.get<Paginated<User>>('/users', {
          params: { page, pageSize, sortBy: sort.by, sortOrder: sort.order },
        })
      ).data,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] });

  const toggleActive = async (u: User) => {
    try {
      await api.patch(`/users/${u.id}/${u.active ? 'deactivate' : 'activate'}`);
      toast.success(u.active ? 'Usuário desativado' : 'Usuário ativado');
      invalidate();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const columns: Column<User>[] = [
    { key: 'name', header: 'Nome', sortable: true, render: (u) => <span className="font-semibold text-slate-800 dark:text-slate-100">{u.name}</span> },
    { key: 'email', header: 'E-mail', sortable: true },
    { key: 'role', header: 'Perfil', sortable: true, render: (u) => <Badge tone="indigo">{roleLabel[u.role]}</Badge> },
    { key: 'active', header: 'Situação', render: (u) => <Badge tone={u.active ? 'green' : 'gray'}>{u.active ? 'Ativo' : 'Inativo'}</Badge> },
    { key: 'lastLoginAt', header: 'Último acesso', render: (u) => dateTime(u.lastLoginAt) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (u) => (
        <div className="flex items-center justify-end gap-3">
          <button className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline" onClick={() => setEditing(u)}>
            Editar
          </button>
          <button className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:underline" onClick={() => toggleActive(u)}>
            {u.active ? 'Desativar' : 'Ativar'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Usuários"
        subtitle="Controle de acesso e perfis"
        actions={<button className="btn-primary" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Novo usuário</button>}
      />
      <div className="card">
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={apiError(error)} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState title="Nenhum usuário" />
        ) : (
          <>
            <DataTable columns={columns} data={data.data} sort={sort} onSort={toggleSort} />
            <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} pageSize={pageSize} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
          </>
        )}
      </div>
      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onDone={invalidate} />
      <EditUserModal user={editing} onClose={() => setEditing(null)} onDone={invalidate} />
    </div>
  );
}

// ---- Create ----
const createSchema = z.object({
  name: z.string().min(3, 'Mínimo de 3 caracteres').max(120, 'Máximo de 120 caracteres'),
  email: z.string().email('E-mail inválido'),
  password: z
    .string()
    .min(12, 'Mínimo de 12 caracteres')
    .max(72, 'Máximo de 72 caracteres')
    .regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Use maiúsculas, minúsculas e número'),
  role: z.enum(['ADMIN', 'MANAGER', 'ANALYST', 'OPERATOR', 'AUDITOR']),
});
type CreateValues = z.infer<typeof createSchema>;

function CreateUserModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: '', email: '', password: '', role: 'OPERATOR' },
  });

  const close = () => {
    reset();
    onClose();
  };

  const submit = async (v: CreateValues) => {
    try {
      await api.post('/users', v);
      toast.success('Usuário criado');
      onDone();
      close();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <Modal open={open} onClose={close} title="Novo usuário">
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <Field label="Nome" htmlFor="user-name" error={errors.name?.message}>
          <input id="user-name" className="input" {...register('name')} />
        </Field>
        <Field label="E-mail" htmlFor="user-email" error={errors.email?.message}>
          <input id="user-email" type="email" className="input" {...register('email')} />
        </Field>
        <Field label="Senha" htmlFor="user-password" error={errors.password?.message}>
          <input id="user-password" type="password" className="input" placeholder="mín. 12 caracteres, maiúscula, minúscula e número" {...register('password')} />
        </Field>
        <Field label="Perfil" htmlFor="user-role" error={errors.role?.message}>
          <select id="user-role" className="input" aria-label="Perfil do usuário" {...register('role')}>
            {ROLES.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
          </select>
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={close}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner className="h-4 w-4" />}Criar</button>
        </div>
      </form>
    </Modal>
  );
}

// ---- Edit (ADMIN) ----
const editSchema = z.object({
  name: z.string().min(3, 'Mínimo de 3 caracteres').max(120, 'Máximo de 120 caracteres'),
  email: z.string().email('E-mail inválido'),
  role: z.enum(['ADMIN', 'MANAGER', 'ANALYST', 'OPERATOR', 'AUDITOR']),
});
type EditValues = z.infer<typeof editSchema>;

function EditUserModal({ user, onClose, onDone }: { user: User | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditValues>({ resolver: zodResolver(editSchema) });

  useEffect(() => {
    if (user) reset({ name: user.name, email: user.email, role: user.role });
  }, [user, reset]);

  const submit = async (v: EditValues) => {
    if (!user) return;
    try {
      await api.patch(`/users/${user.id}`, v);
      toast.success('Usuário atualizado');
      onDone();
      onClose();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <Modal open={!!user} onClose={onClose} title="Editar usuário">
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <Field label="Nome" htmlFor="edit-name" error={errors.name?.message}>
          <input id="edit-name" className="input" {...register('name')} />
        </Field>
        <Field label="E-mail" htmlFor="edit-email" error={errors.email?.message}>
          <input id="edit-email" type="email" className="input" {...register('email')} />
        </Field>
        <Field label="Perfil" htmlFor="edit-role" error={errors.role?.message}>
          <select id="edit-role" className="input" aria-label="Perfil do usuário" {...register('role')}>
            {ROLES.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
          </select>
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner className="h-4 w-4" />}Salvar</button>
        </div>
      </form>
    </Modal>
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
