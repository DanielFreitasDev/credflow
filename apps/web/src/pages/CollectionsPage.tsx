import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { api, apiError } from '../lib/api';
import { useToast } from '../lib/toast';
import { useAuth } from '../lib/auth';
import { CollectionCase, Paginated } from '../lib/types';
import { collectionStatusLabel, currency } from '../lib/format';
import { Column, DataTable } from '../components/DataTable';
import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination, Spinner, StatusBadge } from '../components/ui';
import { ExportCsvButton } from '../components/ExportCsvButton';

export function CollectionsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [running, setRunning] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['collections', page, status],
    queryFn: async () =>
      (await api.get<Paginated<CollectionCase>>('/collections', { params: { page, pageSize: 10, status: status || undefined } })).data,
  });

  const runEngine = async () => {
    setRunning(true);
    try {
      const res = await api.post('/collections/run');
      toast.success(`Régua executada: ${res.data.scanned} contratos, ${res.data.openCases} em atraso`);
      qc.invalidateQueries({ queryKey: ['collections'] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setRunning(false);
    }
  };

  const columns: Column<CollectionCase>[] = [
    { key: 'contract', header: 'Contrato', render: (c) => <span className="font-semibold text-slate-800 dark:text-slate-100">{c.contract?.number}</span> },
    { key: 'customer', header: 'Cliente', render: (c) => c.contract?.customer?.name ?? '—' },
    { key: 'daysOverdue', header: 'Atraso', align: 'right', render: (c) => <span className="font-medium text-rose-600 dark:text-rose-400">{c.daysOverdue} dias</span> },
    { key: 'totalOverdue', header: 'Em atraso (com encargos)', align: 'right', render: (c) => currency(c.totalOverdue) },
    { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} label={collectionStatusLabel[c.status]} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Cobrança"
        subtitle="Carteira inadimplente e régua de cobrança"
        actions={
          <>
            <ExportCsvButton path="/reports/collections.csv" filename="cobranca.csv" />
            {hasRole('OPERATOR', 'MANAGER') && (
              <button className="btn-primary" onClick={runEngine} disabled={running}>
                {running ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />} Executar régua
              </button>
            )}
          </>
        }
      />

      <div className="card">
        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 p-4">
          <select className="input w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Todos os status</option>
            {Object.entries(collectionStatusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={apiError(error)} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState title="Nenhum caso de cobrança" hint="Execute a régua para identificar parcelas vencidas." />
        ) : (
          <>
            <DataTable columns={columns} data={data.data} onRowClick={(c) => navigate(`/collections/${c.id}`)} />
            <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
