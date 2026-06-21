import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, apiError } from '../lib/api';
import { useToast } from '../lib/toast';
import { Paginated, User } from '../lib/types';
import { dateTime, roleLabel } from '../lib/format';
import { Column, DataTable } from '../components/DataTable';
import { Badge, EmptyState, ErrorState, LoadingState, Modal, PageHeader, Pagination, Spinner } from '../components/ui';

export function UsersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['users', page],
    queryFn: async () => (await api.get<Paginated<User>>('/users', { params: { page, pageSize: 10 } })).data,
  });

  const toggleActive = async (u: User) => {
    try {
      await api.patch(`/users/${u.id}/${u.active ? 'deactivate' : 'activate'}`);
      toast.success(u.active ? 'Usuário desativado' : 'Usuário ativado');
      qc.invalidateQueries({ queryKey: ['users'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const columns: Column<User>[] = [
    { key: 'name', header: 'Nome', render: (u) => <span className="font-semibold text-slate-800 dark:text-slate-100">{u.name}</span> },
    { key: 'email', header: 'E-mail' },
    { key: 'role', header: 'Perfil', render: (u) => <Badge tone="indigo">{roleLabel[u.role]}</Badge> },
    { key: 'active', header: 'Situação', render: (u) => <Badge tone={u.active ? 'green' : 'gray'}>{u.active ? 'Ativo' : 'Inativo'}</Badge> },
    { key: 'lastLoginAt', header: 'Último acesso', render: (u) => dateTime(u.lastLoginAt) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (u) => (
        <button className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline" onClick={() => toggleActive(u)}>
          {u.active ? 'Desativar' : 'Ativar'}
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Usuários"
        subtitle="Controle de acesso e perfis"
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Novo usuário</button>}
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
            <DataTable columns={columns} data={data.data} />
            <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} />
          </>
        )}
      </div>
      <CreateUserModal open={open} onClose={() => setOpen(false)} onDone={() => qc.invalidateQueries({ queryKey: ['users'] })} />
    </div>
  );
}

function CreateUserModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('OPERATOR');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await api.post('/users', { name, email, password, role });
      toast.success('Usuário criado');
      setName(''); setEmail(''); setPassword('');
      onDone();
      onClose();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Novo usuário">
      <div className="space-y-4">
        <div><label className="label" htmlFor="user-name">Nome</label><input id="user-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label" htmlFor="user-email">E-mail</label><input id="user-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="label" htmlFor="user-password">Senha</label><input id="user-password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mín. 8 caracteres, maiúscula, minúscula e número" /></div>
        <div>
          <label className="label" htmlFor="user-role">Perfil</label>
          <select id="user-role" className="input" aria-label="Perfil do usuário" value={role} onChange={(e) => setRole(e.target.value)}>
            {Object.entries(roleLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={submit} disabled={loading}>{loading && <Spinner className="h-4 w-4" />}Criar</button>
        </div>
      </div>
    </Modal>
  );
}
