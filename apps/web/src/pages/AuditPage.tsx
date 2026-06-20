import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiError } from '../lib/api';
import { AuditLog, Paginated } from '../lib/types';
import { dateTime } from '../lib/format';
import { Badge, EmptyState, ErrorState, LoadingState, PageHeader, Pagination } from '../components/ui';

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['audit', page, entity],
    queryFn: async () =>
      (await api.get<Paginated<AuditLog>>('/audit', { params: { page, pageSize: 20, entity: entity || undefined } })).data,
  });

  return (
    <div>
      <PageHeader title="Auditoria" subtitle="Trilha de auditoria de todas as operações" />
      <div className="card">
        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 p-4">
          <select className="input w-auto" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }}>
            <option value="">Todas as entidades</option>
            {['Customer', 'CreditProposal', 'Contract', 'Installment', 'CollectionCase', 'PaymentPromise', 'User'].map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={apiError(error)} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState title="Sem registros de auditoria" />
        ) : (
          <>
            <div className="divide-y divide-slate-50 dark:divide-slate-800">
              {data.data.map((log) => (
                <div key={log.id} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="indigo">{log.action}</Badge>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{log.entity}</span>
                      {log.entityId && <span className="truncate text-xs text-slate-400 dark:text-slate-500">#{log.entityId}</span>}
                    </div>
                    {(log.after as Record<string, unknown>) && (
                      <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{JSON.stringify(log.after)}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-xs text-slate-400 dark:text-slate-500">
                    <p>{dateTime(log.createdAt)}</p>
                    <p>{log.user?.name ?? 'Sistema'}</p>
                  </div>
                </div>
              ))}
            </div>
            <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
