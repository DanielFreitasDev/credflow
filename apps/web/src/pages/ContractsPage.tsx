import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api, apiError } from '../lib/api';
import { Contract, Paginated } from '../lib/types';
import { contractStatusLabel, currency } from '../lib/format';
import { Column, DataTable, SortState } from '../components/DataTable';
import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination, Select, StatusBadge } from '../components/ui';
import { ExportCsvButton } from '../components/ExportCsvButton';

const columns: Column<Contract>[] = [
  { key: 'number', header: 'Contrato', sortable: true, render: (c) => <span className="font-semibold text-slate-800 dark:text-slate-100">{c.number}</span> },
  { key: 'customer', header: 'Cliente', render: (c) => c.customer?.name ?? '—' },
  { key: 'principal', header: 'Principal', align: 'right', sortable: true, render: (c) => currency(c.principal) },
  { key: 'termMonths', header: 'Prazo', align: 'right', render: (c) => `${c.termMonths}x` },
  { key: 'outstanding', header: 'Em aberto', align: 'right', render: (c) => currency(c.outstanding) },
  { key: 'overdue', header: 'Em atraso', align: 'right', render: (c) => (c.overdue ? <span className="font-medium text-rose-600 dark:text-rose-400">{currency(c.overdue)}</span> : currency(0)) },
  { key: 'status', header: 'Status', sortable: true, render: (c) => <StatusBadge status={c.status} label={contractStatusLabel[c.status]} /> },
];

export function ContractsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<SortState>({ by: 'createdAt', order: 'desc' });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const toggleSort = (key: string) => {
    setSort((s) => ({ by: key, order: s.by === key && s.order === 'asc' ? 'desc' : 'asc' }));
    setPage(1);
  };

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['contracts', page, pageSize, sort.by, sort.order, search, status],
    queryFn: async () =>
      (
        await api.get<Paginated<Contract>>('/contracts', {
          params: {
            page,
            pageSize,
            sortBy: sort.by,
            sortOrder: sort.order,
            search: search || undefined,
            status: status || undefined,
          },
        })
      ).data,
  });

  return (
    <div>
      <PageHeader
        title="Contratos"
        subtitle="Carteira de empréstimos contratados"
        actions={<ExportCsvButton path="/reports/contracts.csv" filename="contratos.csv" />}
      />

      <div className="card">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 dark:border-slate-800 p-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input className="input pl-9" placeholder="Buscar por número ou cliente..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Select
            className="w-full sm:w-48"
            aria-label="Filtrar por status"
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            options={[
              { value: '', label: 'Todos os status' },
              ...Object.entries(contractStatusLabel).map(([value, label]) => ({ value, label })),
            ]}
          />
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
              <DataTable columns={columns} data={data.data} onRowClick={(c) => navigate(`/contracts/${c.id}`)} rowLabel={(c) => `Abrir contrato ${c.number}`} sort={sort} onSort={toggleSort} />
            </div>
            <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} pageSize={pageSize} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
          </>
        )}
      </div>
    </div>
  );
}
