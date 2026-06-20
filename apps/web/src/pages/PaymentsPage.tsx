import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiError } from '../lib/api';
import { Paginated, Payment } from '../lib/types';
import { currency, dateTime } from '../lib/format';
import { Column, DataTable } from '../components/DataTable';
import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination } from '../components/ui';

const columns: Column<Payment>[] = [
  { key: 'paidAt', header: 'Data', render: (p) => dateTime(p.paidAt) },
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

  const { data, isLoading, error } = useQuery({
    queryKey: ['payments', page],
    queryFn: async () => (await api.get<Paginated<Payment>>('/payments', { params: { page, pageSize: 15 } })).data,
  });

  return (
    <div>
      <PageHeader title="Pagamentos" subtitle="Histórico de recebimentos e baixas" />
      <div className="card">
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={apiError(error)} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState title="Nenhum pagamento registrado" hint="Registre pagamentos a partir de um contrato." />
        ) : (
          <>
            <DataTable columns={columns} data={data.data} />
            <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
