import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { api, apiError } from '../lib/api';
import { Paginated, Proposal } from '../lib/types';
import { currency, percentFromFraction, proposalStatusLabel } from '../lib/format';
import { Column, DataTable, SortState } from '../components/DataTable';
import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination, StatusBadge } from '../components/ui';
import { ExportCsvButton } from '../components/ExportCsvButton';

const columns: Column<Proposal>[] = [
  { key: 'number', header: 'Número', sortable: true, render: (p) => <span className="font-semibold text-slate-800 dark:text-slate-100">{p.number}</span> },
  { key: 'customer', header: 'Cliente', render: (p) => p.customer?.name ?? '—' },
  { key: 'requestedAmount', header: 'Valor', align: 'right', sortable: true, render: (p) => currency(p.requestedAmount) },
  { key: 'termMonths', header: 'Prazo', align: 'right', render: (p) => `${p.termMonths}x` },
  { key: 'interestRate', header: 'Taxa/mês', align: 'right', render: (p) => percentFromFraction(p.interestRate) },
  { key: 'cetAnnual', header: 'CET a.a.', align: 'right', render: (p) => percentFromFraction(p.cetAnnual) },
  { key: 'status', header: 'Status', sortable: true, render: (p) => <StatusBadge status={p.status} label={proposalStatusLabel[p.status]} /> },
];

export function ProposalsPage() {
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
    queryKey: ['proposals', page, pageSize, sort.by, sort.order, search, status],
    queryFn: async () =>
      (
        await api.get<Paginated<Proposal>>('/proposals', {
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
        title="Propostas"
        subtitle="Simulações e solicitações de crédito"
        actions={
          <>
            <ExportCsvButton path="/reports/proposals.csv" filename="propostas.csv" />
            <button className="btn-primary" onClick={() => navigate('/proposals/new')}>
              <Plus className="h-4 w-4" /> Nova proposta
            </button>
          </>
        }
      />

      <div className="card">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 dark:border-slate-800 p-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input className="input pl-9" placeholder="Buscar por número ou cliente..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <select className="input w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Todos os status</option>
            {Object.entries(proposalStatusLabel).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={apiError(error)} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState title="Nenhuma proposta encontrada" />
        ) : (
          <>
            <div className={isFetching ? 'opacity-60 transition' : ''}>
              <DataTable columns={columns} data={data.data} onRowClick={(p) => navigate(`/proposals/${p.id}`)} rowLabel={(p) => `Abrir proposta ${p.number}`} sort={sort} onSort={toggleSort} />
            </div>
            <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} pageSize={pageSize} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
          </>
        )}
      </div>
    </div>
  );
}
