import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MessageSquarePlus, HandCoins } from 'lucide-react';
import { api, apiError } from '../lib/api';
import { useToast } from '../lib/toast';
import { useAuth } from '../lib/auth';
import { CollectionCase } from '../lib/types';
import { collectionStatusLabel, currency, date, dateInputToIso, dateTime } from '../lib/format';
import { ConfirmDialog, ErrorState, LoadingState, PageHeader, Select, Spinner, StatusBadge, Stat } from '../components/ui';

const CHANNELS = ['PHONE', 'EMAIL', 'SMS', 'WHATSAPP', 'LETTER', 'VISIT', 'SYSTEM'];
// Irreversible case outcomes — confirm before applying.
const TERMINAL_STATUSES = ['WRITTEN_OFF', 'RESOLVED'];

const today = () => new Date().toISOString().slice(0, 10);

const interactionSchema = z.object({
  channel: z.string().min(1, 'Selecione um canal'),
  notes: z.string().trim().min(1, 'Descreva a interação'),
});
type InteractionValues = z.infer<typeof interactionSchema>;

const promiseSchema = z.object({
  amount: z.coerce.number({ error: 'Informe um valor' }).positive('O valor deve ser maior que zero'),
  promisedDate: z
    .string()
    .min(1, 'Informe a data')
    .refine((d) => d >= today(), 'A data deve ser hoje ou futura'),
});
type PromiseValues = z.infer<typeof promiseSchema>;

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

  // Pending terminal status awaiting confirmation.
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  const interactionForm = useForm<InteractionValues>({
    resolver: zodResolver(interactionSchema),
    defaultValues: { channel: 'PHONE', notes: '' },
  });

  const promiseForm = useForm<z.input<typeof promiseSchema>, unknown, PromiseValues>({
    resolver: zodResolver(promiseSchema),
    defaultValues: { amount: 0, promisedDate: today() },
  });

  // A collections change (status, promise, renegotiation) can flip the linked
  // contract to/from DEFAULTED and move portfolio KPIs, so refresh those caches
  // too — not just this case — to avoid showing stale figures elsewhere.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['collection', id] });
    qc.invalidateQueries({ queryKey: ['collections'] });
    qc.invalidateQueries({ queryKey: ['contracts'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    if (c?.contract?.id) qc.invalidateQueries({ queryKey: ['contract', c.contract.id] });
  };

  const interactionMut = useMutation({
    mutationFn: async (v: InteractionValues) => api.post(`/collections/${id}/interactions`, v),
    onSuccess: () => { interactionForm.reset({ channel: 'PHONE', notes: '' }); toast.success('Interação registrada'); invalidate(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const promiseMut = useMutation({
    mutationFn: async (v: PromiseValues) =>
      api.post(`/collections/${id}/promises`, { amount: v.amount, promisedDate: dateInputToIso(v.promisedDate) }),
    onSuccess: () => { promiseForm.reset({ amount: 0, promisedDate: today() }); toast.success('Promessa registrada'); invalidate(); },
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

  const changeStatus = (status: string) => {
    if (status === c.status) return;
    if (TERMINAL_STATUSES.includes(status)) {
      setPendingStatus(status);
      return;
    }
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
            <Select
              className="w-full sm:w-56"
              aria-label="Alterar status do caso"
              value={c.status}
              disabled={statusMut.isPending}
              onChange={(v) => changeStatus(v)}
              options={Object.entries(collectionStatusLabel).map(([value, label]) => ({ value, label }))}
            />
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
            <form
              onSubmit={interactionForm.handleSubmit((v) => interactionMut.mutate(v))}
              className="mb-4 space-y-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3"
            >
              <div className="flex gap-2">
                <Controller
                  control={interactionForm.control}
                  name="channel"
                  render={({ field }) => (
                    <Select
                      className="w-44 shrink-0"
                      aria-label="Canal da interação"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      options={CHANNELS.map((ch) => ({ value: ch, label: ch }))}
                    />
                  )}
                />
                <input className="input flex-1" aria-label="Descrição da interação" placeholder="Descreva a interação..." {...interactionForm.register('notes')} />
              </div>
              {interactionForm.formState.errors.notes && (
                <p className="text-xs text-rose-600 dark:text-rose-400">{interactionForm.formState.errors.notes.message}</p>
              )}
              <button type="submit" className="btn-primary w-full" disabled={interactionMut.isPending}>
                {interactionMut.isPending ? <Spinner className="h-4 w-4" /> : <MessageSquarePlus className="h-4 w-4" />} Registrar interação
              </button>
            </form>
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
            <form
              onSubmit={promiseForm.handleSubmit((v) => promiseMut.mutate(v))}
              className="mb-4 space-y-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3"
            >
              <div className="flex gap-2">
                <input type="number" step="0.01" className="input" aria-label="Valor da promessa" placeholder="Valor" {...promiseForm.register('amount')} />
                <input type="date" className="input" aria-label="Data da promessa" min={today()} {...promiseForm.register('promisedDate')} />
              </div>
              {(promiseForm.formState.errors.amount || promiseForm.formState.errors.promisedDate) && (
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  {promiseForm.formState.errors.amount?.message ?? promiseForm.formState.errors.promisedDate?.message}
                </p>
              )}
              <button type="submit" className="btn-primary w-full" disabled={promiseMut.isPending}>
                {promiseMut.isPending ? <Spinner className="h-4 w-4" /> : <HandCoins className="h-4 w-4" />} Registrar promessa
              </button>
            </form>
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
                    <Select
                      className="w-36"
                      triggerClassName="py-1 text-xs"
                      aria-label="Atualizar status da promessa"
                      placeholder="Atualizar"
                      searchable={false}
                      value=""
                      disabled={updatePromiseMut.isPending}
                      onChange={(v) => v && updatePromiseMut.mutate({ pid: pr.id, status: v })}
                      options={[
                        { value: 'KEPT', label: 'Cumprida' },
                        { value: 'BROKEN', label: 'Quebrada' },
                        { value: 'CANCELLED', label: 'Cancelar' },
                      ]}
                    />
                  )}
                </div>
              </div>
            )) : <p className="text-sm text-slate-400 dark:text-slate-500">Nenhuma promessa.</p>}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingStatus}
        title="Alterar status do caso"
        message={
          pendingStatus
            ? `Alterar o status para "${collectionStatusLabel[pendingStatus] ?? pendingStatus}"? Esta ação é irreversível.`
            : ''
        }
        confirmLabel="Confirmar alteração"
        loading={statusMut.isPending}
        onConfirm={() => {
          if (pendingStatus) {
            statusMut.mutate(pendingStatus, { onSuccess: () => setPendingStatus(null) });
          }
        }}
        onClose={() => setPendingStatus(null)}
      />
    </div>
  );
}
