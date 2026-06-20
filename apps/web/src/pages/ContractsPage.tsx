import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api, apiError } from '../lib/api';
import { Contract, Paginated } from '../lib/types';
import { contractStatusLabel, currency } from '../lib/format';
import { Column, DataTable } from '../components/DataTable';
import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination, StatusBadge } from '../components/ui';

const columns: Column<Contract>[] = [
  { key: 'number', header: 'Contrato', render: (c) => <span className="font-semibold text-slate-800">{c.number}</span> },
  { key: 'customer', header: 'Cliente', render: (c) => c.customer?.name ?? '—' },
  { key: 'principal', header: 'Principal', align: 'right', render: (c) => currency(c.principal) },
  { key: 'termMonths', header: 'Prazo', align: 'right', render: (c) => `${c.termMonths}x` },
  { key: 'outstanding', header: 'Em aberto', align: 'right', render: (c) => currency(c.outstanding) },
  { key: 'overdue', header: 'Em atraso', align: 'right', render: (c) => (c.overdue ? <span className="font-medium text-rose-600">{currency(c.overdue)}</span> : currency(0)) },
  { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} label={contractStatusLabel[c.status]} /> },
];

export function ContractsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['contracts', page, search, status],
    queryFn: async () =>
      (
        await api.get<Paginated<Contract>>('/contracts', {
          params: { page, pageSize: 10, search: search || undefined, status: status || undefined },
        })
      ).data,
  });

  return (
    <div>
      <PageHeader title="Contratos" subtitle="Carteira de empréstimos contratados" />

      <div className="card">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Buscar por número ou cliente..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <select className="input w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Todos os status</option>
            {Object.entries(contractStatusLabel).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={apiError(error)} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState title="Nenhum contrato encontrado" />
        ) : (
          <>
            <div className={isFetching ? 'opacity-60 transition' : ''}>
              <DataTable columns={columns} data={data.data} onRowClick={(c) => navigate(`/contracts/${c.id}`)} />
            </div>
            <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
