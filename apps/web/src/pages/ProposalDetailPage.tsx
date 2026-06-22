import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Cpu, Gavel, FileSignature, Send, Ban } from 'lucide-react';
import { api, apiError } from '../lib/api';
import { useToast } from '../lib/toast';
import { useAuth } from '../lib/auth';
import { Proposal } from '../lib/types';
import {
  amortizationLabel,
  currency,
  dateInputToIso,
  dateTime,
  decisionLabel,
  percentFromFraction,
  proposalStatusLabel,
} from '../lib/format';
import { ConfirmDialog, ErrorState, LoadingState, Modal, PageHeader, Spinner, StatusBadge, Stat } from '../components/ui';

export function ProposalDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const { data: p, isLoading, error } = useQuery({
    queryKey: ['proposal', id],
    queryFn: async () => (await api.get<Proposal>(`/proposals/${id}`)).data,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['proposal', id] });
    qc.invalidateQueries({ queryKey: ['proposals'] });
    // Generating a contract from a proposal creates a contract and shifts KPIs.
    qc.invalidateQueries({ queryKey: ['contracts'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const action = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => { invalidate(); },
    onError: (e) => toast.error(apiError(e)),
  });

  if (isLoading) return <LoadingState />;
  if (error || !p) return <ErrorState message={apiError(error)} />;

  const canAnalyze = hasRole('ANALYST', 'MANAGER');
  const canOperate = hasRole('OPERATOR', 'ANALYST', 'MANAGER');

  return (
    <div>
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>
      <PageHeader
        title={p.number}
        subtitle={p.customer ? p.customer.name : ''}
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={p.status} label={proposalStatusLabel[p.status]} />
            {p.status === 'DRAFT' && canOperate && (
              <button className="btn-primary" onClick={() => action.mutate(() => api.post(`/proposals/${id}/submit`).then(r => { toast.success('Enviada para análise'); return r; }))}>
                <Send className="h-4 w-4" /> Enviar p/ análise
              </button>
            )}
            {p.status === 'UNDER_REVIEW' && canAnalyze && (
              <>
                <button className="btn-secondary" onClick={() => action.mutate(() => api.post(`/proposals/${id}/analyze`).then(r => { toast.success('Análise executada'); return r; }))}>
                  <Cpu className="h-4 w-4" /> Análise automática
                </button>
                <button className="btn-primary" onClick={() => setDecisionOpen(true)}>
                  <Gavel className="h-4 w-4" /> Decisão manual
                </button>
              </>
            )}
            {p.status === 'APPROVED' && canAnalyze && (
              <button className="btn-primary" onClick={() => setContractOpen(true)}>
                <FileSignature className="h-4 w-4" /> Gerar contrato
              </button>
            )}
            {['DRAFT', 'UNDER_REVIEW', 'APPROVED'].includes(p.status) && canAnalyze && (
              <button className="btn-danger" onClick={() => setCancelOpen(true)}>
                <Ban className="h-4 w-4" /> Cancelar
              </button>
            )}
          </div>
        }
      />

      {p.contract && (
        <Link to={`/contracts/${p.contract.id}`} className="mb-4 block rounded-lg bg-brand-50 dark:bg-brand-500/10 px-4 py-3 text-sm text-brand-700 dark:text-brand-300 ring-1 ring-brand-200 dark:ring-brand-500/30">
          Contrato gerado: <strong>{p.contract.number}</strong> — clique para abrir.
        </Link>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card p-6">
            <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Condições</h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label="Valor solicitado" value={currency(p.requestedAmount)} />
              <Stat label="Valor financiado" value={currency(p.financedAmount)} />
              <Stat label="Parcela" value={currency(p.installmentAmount)} />
              <Stat label="Prazo" value={`${p.termMonths} meses`} />
              <Stat label="Taxa mensal" value={percentFromFraction(p.interestRate)} />
              <Stat label="CET anual" value={percentFromFraction(p.cetAnnual)} />
              <Stat label="IOF" value={currency(p.iofAmount)} />
              <Stat label="TAC" value={currency(p.tacAmount)} />
              <Stat label="Sistema" value={amortizationLabel[p.amortizationType]} />
            </div>
          </div>

          {p.schedule && (
            <div className="card p-6">
              <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Cronograma simulado</h3>
              <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-100 dark:border-slate-800">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-right">Amortização</th>
                      <th className="px-3 py-2 text-right">Juros</th>
                      <th className="px-3 py-2 text-right">Parcela</th>
                      <th className="px-3 py-2 text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {p.schedule.map((s) => (
                      <tr key={s.number}>
                        <td className="px-3 py-1.5">{s.number}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{currency(s.principal)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{currency(s.interest)}</td>
                        <td className="px-3 py-1.5 text-right font-medium tabular-nums">{currency(s.amount)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-400 dark:text-slate-500">{currency(s.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Análise de crédito</h3>
            {p.analysis ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <StatusBadge status={p.analysis.decision} label={decisionLabel[p.analysis.decision]} />
                  <StatusBadge status={p.analysis.riskBand} label={`Risco ${p.analysis.riskBand}`} />
                </div>
                <Stat label="Score apurado" value={p.analysis.score} />
                <Stat label="Limite sugerido" value={currency(p.analysis.suggestedLimit)} />
                {p.analysis.approvedAmount != null && <Stat label="Valor aprovado" value={currency(p.analysis.approvedAmount)} />}
                <Stat label="Tipo" value={p.analysis.automatic ? 'Automática' : 'Manual'} hint={`Política ${p.analysis.policyVersion}`} />
                <div>
                  <p className="mb-1 text-xs font-medium uppercase text-slate-400 dark:text-slate-500">Motivos</p>
                  <ul className="list-inside list-disc space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    {p.analysis.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400 dark:text-slate-500">Sem análise registrada.</p>
            )}
          </div>

          <div className="card p-6">
            <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Histórico</h3>
            <ol className="relative space-y-4 border-l border-slate-200 dark:border-slate-800 pl-4">
              {p.events?.map((ev) => (
                <li key={ev.id}>
                  <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full bg-brand-500" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {ev.fromStatus ? `${proposalStatusLabel[ev.fromStatus]} → ` : ''}
                    {proposalStatusLabel[ev.toStatus]}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {dateTime(ev.createdAt)} {ev.changedBy ? `· ${ev.changedBy.name}` : ''}
                  </p>
                  {ev.reason && <p className="text-xs text-slate-500 dark:text-slate-400">{ev.reason}</p>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      <DecisionModal open={decisionOpen} onClose={() => setDecisionOpen(false)} proposalId={id!} requested={p.requestedAmount} onDone={invalidate} />
      <ContractModal open={contractOpen} onClose={() => setContractOpen(false)} proposalId={id!} onDone={(cid) => navigate(`/contracts/${cid}`)} />
      <ConfirmDialog
        open={cancelOpen}
        title="Cancelar proposta"
        message="Tem certeza que deseja cancelar esta proposta? Esta ação não pode ser desfeita."
        confirmLabel="Cancelar proposta"
        cancelLabel="Voltar"
        loading={action.isPending}
        onConfirm={() =>
          action.mutate(
            () =>
              api
                .post(`/proposals/${id}/cancel`, { reason: 'Cancelada pelo usuário' })
                .then((r) => {
                  toast.success('Proposta cancelada');
                  return r;
                }),
            { onSuccess: () => setCancelOpen(false) },
          )
        }
        onClose={() => setCancelOpen(false)}
      />
    </div>
  );
}

const decisionSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    approvedAmount: z.coerce.number().optional(),
    reason: z.string().optional(),
  })
  .refine((v) => v.decision !== 'APPROVED' || (v.approvedAmount != null && v.approvedAmount > 0), {
    path: ['approvedAmount'],
    message: 'Informe um valor maior que zero',
  });
type DecisionValues = z.infer<typeof decisionSchema>;

function DecisionModal({ open, onClose, proposalId, requested, onDone }: { open: boolean; onClose: () => void; proposalId: string; requested: number; onDone: () => void }) {
  const toast = useToast();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof decisionSchema>, unknown, DecisionValues>({
    resolver: zodResolver(decisionSchema),
    defaultValues: { decision: 'APPROVED', approvedAmount: requested, reason: '' },
  });
  const decision = watch('decision');

  const submit = async (v: DecisionValues) => {
    try {
      await api.post(`/proposals/${proposalId}/decision`, {
        decision: v.decision,
        approvedAmount: v.decision === 'APPROVED' ? v.approvedAmount : undefined,
        reason: v.reason || 'Decisão manual',
      });
      toast.success('Decisão registrada');
      onDone();
      onClose();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Decisão manual de crédito">
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <div>
          <label className="label" htmlFor="dec-decision">Decisão</label>
          <select id="dec-decision" className="input" {...register('decision')}>
            <option value="APPROVED">Aprovar</option>
            <option value="REJECTED">Recusar</option>
          </select>
        </div>
        {decision === 'APPROVED' && (
          <div>
            <label className="label" htmlFor="dec-amount">Valor aprovado (R$)</label>
            <input id="dec-amount" type="number" step="0.01" className="input" {...register('approvedAmount')} />
            {errors.approvedAmount && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{errors.approvedAmount.message}</p>}
          </div>
        )}
        <div>
          <label className="label" htmlFor="dec-reason">Justificativa</label>
          <textarea id="dec-reason" rows={3} className="input" {...register('reason')} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner className="h-4 w-4" />}Confirmar</button>
        </div>
      </form>
    </Modal>
  );
}

const contractSchema = z.object({
  startDate: z.string().optional(),
  firstDueDate: z.string().optional(),
  lateFee: z.coerce.number().min(0, 'Não pode ser negativo').max(100, 'Máximo de 100%'),
  lateInterest: z.coerce.number().min(0, 'Não pode ser negativo').max(100, 'Máximo de 100%'),
});
type ContractValues = z.infer<typeof contractSchema>;

function ContractModal({ open, onClose, proposalId, onDone }: { open: boolean; onClose: () => void; proposalId: string; onDone: (contractId: string) => void }) {
  const toast = useToast();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof contractSchema>, unknown, ContractValues>({
    resolver: zodResolver(contractSchema),
    defaultValues: { startDate: '', firstDueDate: '', lateFee: 2, lateInterest: 1 },
  });

  const submit = async (v: ContractValues) => {
    try {
      const res = await api.post(`/contracts/from-proposal/${proposalId}`, {
        startDate: v.startDate ? dateInputToIso(v.startDate) : undefined,
        firstDueDate: v.firstDueDate ? dateInputToIso(v.firstDueDate) : undefined,
        lateFeeRate: v.lateFee / 100,
        lateInterestRate: v.lateInterest / 100,
      });
      toast.success(`Contrato ${res.data.number} gerado`);
      onClose();
      onDone(res.data.id);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Gerar contrato">
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="ctr-start">Data de início</label>
            <input id="ctr-start" type="date" className="input" {...register('startDate')} />
          </div>
          <div>
            <label className="label" htmlFor="ctr-due">1º vencimento</label>
            <input id="ctr-due" type="date" className="input" {...register('firstDueDate')} />
          </div>
          <div>
            <label className="label" htmlFor="ctr-fee">Multa por atraso (%)</label>
            <input id="ctr-fee" type="number" step="0.5" className="input" {...register('lateFee')} />
            {errors.lateFee && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{errors.lateFee.message}</p>}
          </div>
          <div>
            <label className="label" htmlFor="ctr-mora">Juros de mora (% a.m.)</label>
            <input id="ctr-mora" type="number" step="0.5" className="input" {...register('lateInterest')} />
            {errors.lateInterest && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{errors.lateInterest.message}</p>}
          </div>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">Datas em branco usam hoje e o vencimento padrão (início + 1 mês).</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner className="h-4 w-4" />}Gerar contrato</button>
        </div>
      </form>
    </Modal>
  );
}
