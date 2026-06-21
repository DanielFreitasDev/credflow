import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { api, apiError } from '../lib/api';
import { Customer, Paginated } from '../lib/types';
import {
  currency,
  customerStatusLabel,
  customerTypeLabel,
  formatDocument,
} from '../lib/format';
import { DataTable, Column } from '../components/DataTable';
import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination, StatusBadge } from '../components/ui';
import { ExportCsvButton } from '../components/ExportCsvButton';

const columns: Column<Customer>[] = [
  {
    key: 'name',
    header: 'Nome / Razão Social',
    render: (c) => (
      <div>
        <p className="font-semibold text-slate-800 dark:text-slate-100">{c.name}</p>
        {c.tradeName && <p className="text-xs text-slate-400 dark:text-slate-500">{c.tradeName}</p>}
      </div>
    ),
  },
  { key: 'document', header: 'Documento', render: (c) => formatDocument(c.document) },
  { key: 'type', header: 'Tipo', render: (c) => customerTypeLabel[c.type] },
  { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} label={customerStatusLabel[c.status]} /> },
  { key: 'internalScore', header: 'Score', align: 'right', render: (c) => c.internalScore },
  { key: 'monthlyIncome', header: 'Renda/Fat.', align: 'right', render: (c) => currency(c.monthlyIncome) },
];

export function CustomersPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['customers', page, search, type, status],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Customer>>('/customers', {
        params: { page, pageSize: 10, search: search || undefined, type: type || undefined, status: status || undefined },
      });
      return data;
    },
  });

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Pessoas físicas e jurídicas"
        actions={
          <>
            <ExportCsvButton path="/reports/customers.csv" filename="clientes.csv" />
            <button className="btn-primary" onClick={() => navigate('/customers/new')}>
              <Plus className="h-4 w-4" /> Novo cliente
            </button>
          </>
        }
      />

      <div className="card">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 dark:border-slate-800 p-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              className="input pl-9"
              placeholder="Buscar por nome, documento ou e-mail..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select className="input w-auto" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
            <option value="">Todos os tipos</option>
            <option value="INDIVIDUAL">Pessoa Física</option>
            <option value="COMPANY">Pessoa Jurídica</option>
          </select>
          <select className="input w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Todos os status</option>
            {Object.entries(customerStatusLabel).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={apiError(error)} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState title="Nenhum cliente encontrado" hint="Ajuste os filtros ou cadastre um novo cliente." />
        ) : (
          <>
            <div className={isFetching ? 'opacity-60 transition' : ''}>
              <DataTable columns={columns} data={data.data} onRowClick={(c) => navigate(`/customers/${c.id}`)} />
            </div>
            <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
