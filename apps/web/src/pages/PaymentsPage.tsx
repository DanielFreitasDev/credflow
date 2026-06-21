import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api, apiError } from '../lib/api';
import { Paginated, Payment } from '../lib/types';
import { currency, dateTime } from '../lib/format';
import { useDebounce } from '../lib/hooks';
import { Column, DataTable, SortState } from '../components/DataTable';
import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination } from '../components/ui';
import { ExportCsvButton } from '../components/ExportCsvButton';

const columns: Column<Payment>[] = [
  { key: 'paidAt', header: 'Data', sortable: true, render: (p) => dateTime(p.paidAt) },
  { key: 'contract', header: 'Contrato', render: (p) => p.contract?.number ?? '—' },
  { key: 'installment', header: 'Parcela', align: 'center', render: (p) => p.installment?.number ?? '—' },
  { key: 'amount', header: 'Valor', align: 'right', render: (p) => <span className="font-semibold">{currency(p.amount)}</span> },
  { key: 'principalPortion', header: 'Principal', align: 'right', render: (p) => currency(p.principalPortion) },
  { key: 'interestPortion', header: 'Juros', align: 'right', render: (p) => currency(p.interestPortion) },
  { key: 'charges', header: 'Multa+Mora', align: 'right', render: (p) => currency(p.lateFeePortion + p.lateInterestPortion) },
  { key: 'method', header: 'Forma', render: (p) => p.method },
  { key: 'registeredBy', header: 'Registrado por', render: (p) => p.registeredBy?.name ?? '—' },
];

export function PaymentsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  // The payments list is ordered by paidAt; only the sort direction is togglable.
  const [sort, setSort] = useState<SortState>({ by: 'paidAt', order: 'desc' });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);

  const toggleSort = () => {
    setSort((s) => ({ by: 'paidAt', order: s.order === 'asc' ? 'desc' : 'asc' }));
    setPage(1);
  };

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['payments', page, pageSize, sort.order, debouncedSearch],
    queryFn: async () =>
      (
        await api.get<Paginated<Payment>>('/payments', {
          params: { page, pageSize, sortOrder: sort.order, search: debouncedSearch || undefined },
        })
      ).data,
  });

  return (
    <div>
      <PageHeader
        title="Pagamentos"
        subtitle="Histórico de recebimentos e baixas"
        actions={<ExportCsvButton path="/reports/payments.csv" filename="pagamentos.csv" />}
      />
      <div className="card">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 dark:border-slate-800 p-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              className="input pl-9"
              placeholder="Buscar por contrato ou cliente..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={apiError(error)} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState title="Nenhum pagamento registrado" hint="Registre pagamentos a partir de um contrato ou ajuste a busca." />
        ) : (
          <>
            <div className={isFetching ? 'opacity-60 transition' : ''}>
              <DataTable columns={columns} data={data.data} sort={sort} onSort={toggleSort} />
            </div>
            <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} pageSize={pageSize} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
          </>
        )}
      </div>
    </div>
  );
}
