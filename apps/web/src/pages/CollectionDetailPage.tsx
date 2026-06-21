import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MessageSquarePlus, HandCoins } from 'lucide-react';
import { api, apiError } from '../lib/api';
import { useToast } from '../lib/toast';
import { useAuth } from '../lib/auth';
import { CollectionCase } from '../lib/types';
import { collectionStatusLabel, currency, date, dateTime } from '../lib/format';
import { ErrorState, LoadingState, PageHeader, StatusBadge, Stat } from '../components/ui';

const CHANNELS = ['PHONE', 'EMAIL', 'SMS', 'WHATSAPP', 'LETTER', 'VISIT', 'SYSTEM'];
// Irreversible case outcomes — confirm before applying.
const TERMINAL_STATUSES = ['WRITTEN_OFF', 'RESOLVED'];

export function CollectionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { hasRole } = useAuth();

  const { data: c, isLoading, error } = useQuery({
    queryKey: ['collection', id],
    queryFn: async () => (await api.get<CollectionCase>(`/collections/${id}`)).data,
  });

  const [channel, setChannel] = useState('PHONE');
  const [notes, setNotes] = useState('');
  const [promiseAmount, setPromiseAmount] = useState(0);
  const [promiseDate, setPromiseDate] = useState(new Date().toISOString().slice(0, 10));

  const invalidate = () => qc.invalidateQueries({ queryKey: ['collection', id] });

  const interactionMut = useMutation({
    mutationFn: async () => api.post(`/collections/${id}/interactions`, { channel, notes }),
    onSuccess: () => { setNotes(''); toast.success('Interação registrada'); invalidate(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const promiseMut = useMutation({
    mutationFn: async () =>
      api.post(`/collections/${id}/promises`, { amount: promiseAmount, promisedDate: new Date(promiseDate).toISOString() }),
    onSuccess: () => { setPromiseAmount(0); toast.success('Promessa registrada'); invalidate(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const statusMut = useMutation({
    mutationFn: async (status: string) => api.patch(`/collections/${id}/status`, { status }),
    onSuccess: () => { toast.success('Status atualizado'); invalidate(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const updatePromiseMut = useMutation({
    mutationFn: async ({ pid, status }: { pid: string; status: string }) =>
      api.patch(`/collections/promises/${pid}`, { status }),
    onSuccess: () => { invalidate(); },
    onError: (e) => toast.error(apiError(e)),
  });

  if (isLoading) return <LoadingState />;
  if (error || !c) return <ErrorState message={apiError(error)} />;

  const canAct = hasRole('OPERATOR', 'MANAGER');
  const canChangeStatus = hasRole('MANAGER');

  const addInteraction = () => {
    if (!notes.trim()) return;
    interactionMut.mutate();
  };

  const addPromise = () => {
    if (promiseAmount <= 0) return;
    promiseMut.mutate();
  };

  const changeStatus = (status: string) => {
    if (TERMINAL_STATUSES.includes(status) && !confirm(`Alterar status para "${collectionStatusLabel[status] ?? status}"? Esta ação é irreversível.`)) return;
    statusMut.mutate(status);
  };

  return (
    <div>
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>
      <PageHeader
        title={`Cobrança — ${c.contract?.number ?? ''}`}
        subtitle={c.contract?.customer?.name}
        actions={
          canChangeStatus && (
            <select
              className="input w-auto"
              aria-label="Alterar status do caso"
              value={c.status}
              disabled={statusMut.isPending}
              onChange={(e) => changeStatus(e.target.value)}
            >
              {Object.entries(collectionStatusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="card p-4"><Stat label="Dias em atraso" value={<span className="text-rose-600 dark:text-rose-400">{c.daysOverdue}</span>} /></div>
        <div className="card p-4"><Stat label="Em atraso (com encargos)" value={currency(c.totalOverdue)} /></div>
        <div className="card p-4"><Stat label="Status" value={<StatusBadge status={c.status} label={collectionStatusLabel[c.status]} />} /></div>
        <div className="card p-4"><Stat label="Aberto em" value={date(c.openedAt)} /></div>
      </div>

      {c.contract && (
        <Link to={`/contracts/${c.contract.id}`} className="mb-6 block rounded-lg bg-brand-50 dark:bg-brand-500/10 px-4 py-3 text-sm text-brand-700 dark:text-brand-300 ring-1 ring-brand-200 dark:ring-brand-500/30">
          Abrir contrato {c.contract.number} para registrar pagamento ou renegociar.
        </Link>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Interações</h3>
          {canAct && (
            <div className="mb-4 space-y-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
              <div className="flex gap-2">
                <select className="input w-auto" aria-label="Canal da interação" value={channel} onChange={(e) => setChannel(e.target.value)}>
                  {CHANNELS.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
                </select>
                <input className="input flex-1" aria-label="Descrição da interação" placeholder="Descreva a interação..." value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <button className="btn-primary w-full" onClick={addInteraction} disabled={interactionMut.isPending}>
                <MessageSquarePlus className="h-4 w-4" /> Registrar interação
              </button>
            </div>
          )}
          <div className="space-y-3">
            {c.interactions && c.interactions.length > 0 ? c.interactions.map((it) => (
              <div key={it.id} className="border-b border-slate-50 dark:border-slate-800 pb-2 last:border-0">
                <div className="flex justify-between">
                  <StatusBadge status="IN_PROGRESS" label={it.channel} />
                  <span className="text-xs text-slate-400 dark:text-slate-500">{dateTime(it.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{it.notes}</p>
                {it.createdBy && <p className="text-xs text-slate-400 dark:text-slate-500">por {it.createdBy.name}</p>}
              </div>
            )) : <p className="text-sm text-slate-400 dark:text-slate-500">Nenhuma interação.</p>}
          </div>
        </div>

        <div className="card p-6">
          <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Promessas de pagamento</h3>
          {canAct && (
            <div className="mb-4 space-y-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
              <div className="flex gap-2">
                <input type="number" step="0.01" className="input" aria-label="Valor da promessa" placeholder="Valor" value={promiseAmount || ''} onChange={(e) => setPromiseAmount(Number(e.target.value))} />
                <input type="date" className="input" aria-label="Data da promessa" value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} />
              </div>
              <button className="btn-primary w-full" onClick={addPromise} disabled={promiseMut.isPending}>
                <HandCoins className="h-4 w-4" /> Registrar promessa
              </button>
            </div>
          )}
          <div className="space-y-3">
            {c.promises && c.promises.length > 0 ? c.promises.map((pr) => (
              <div key={pr.id} className="flex items-center justify-between border-b border-slate-50 dark:border-slate-800 pb-2 last:border-0">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{currency(pr.amount)}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Para {date(pr.promisedDate)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={pr.status === 'KEPT' ? 'PAID' : pr.status === 'BROKEN' ? 'OVERDUE' : 'PENDING'} label={pr.status} />
                  {canAct && pr.status === 'PENDING' && (
                    <select
                      className="input w-auto py-1 text-xs"
                      aria-label="Atualizar status da promessa"
                      defaultValue=""
                      disabled={updatePromiseMut.isPending}
                      onChange={(e) => e.target.value && updatePromiseMut.mutate({ pid: pr.id, status: e.target.value })}
                    >
                      <option value="">...</option>
                      <option value="KEPT">Cumprida</option>
                      <option value="BROKEN">Quebrada</option>
                      <option value="CANCELLED">Cancelar</option>
                    </select>
                  )}
                </div>
              </div>
            )) : <p className="text-sm text-slate-400 dark:text-slate-500">Nenhuma promessa.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
