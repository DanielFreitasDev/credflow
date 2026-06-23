import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiError } from '../lib/api';
import { AuditLog, Paginated } from '../lib/types';
import { dateTime, auditEntityLabel, auditActionLabel } from '../lib/format';
import { Badge, EmptyState, ErrorState, LoadingState, PageHeader, Pagination, Select } from '../components/ui';
import { ExportCsvButton } from '../components/ExportCsvButton';

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
      <PageHeader
        title="Auditoria"
        subtitle="Trilha de auditoria de todas as operações"
        actions={<ExportCsvButton path="/reports/audit.csv" filename="auditoria.csv" />}
      />
      <div className="card">
        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 p-4">
          <Select
            className="w-full sm:w-60"
            aria-label="Filtrar por entidade"
            value={entity}
            onChange={(v) => { setEntity(v); setPage(1); }}
            options={[
              { value: '', label: 'Todas as entidades' },
              ...['Customer', 'CreditProposal', 'Contract', 'Installment', 'CollectionCase', 'PaymentPromise', 'User'].map((e) => ({ value: e, label: auditEntityLabel[e] ?? e })),
            ]}
          />
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
                      <Badge tone="indigo">{auditActionLabel[log.action] ?? log.action}</Badge>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{auditEntityLabel[log.entity] ?? log.entity}</span>
                      {log.entityId && <span className="truncate text-xs text-slate-400 dark:text-slate-500">#{log.entityId}</span>}
                    </div>
                    {log.after != null && (
                      <details className="mt-1 group">
                        <summary className="cursor-pointer text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                          Ver dados
                        </summary>
                        <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap wrap-break-word rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3 text-xs text-slate-600 dark:text-slate-300 ring-1 ring-slate-100 dark:ring-slate-800">
                          {JSON.stringify(log.after, null, 2)}
                        </pre>
                      </details>
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
