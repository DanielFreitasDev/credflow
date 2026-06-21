import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Banknote, RefreshCw, PhoneCall } from 'lucide-react';
import { api, apiError } from '../lib/api';
import { useToast } from '../lib/toast';
import { useAuth } from '../lib/auth';
import { ChargesPreview, Contract, Installment } from '../lib/types';
import {
  amortizationLabel,
  contractStatusLabel,
  currency,
  date,
  dateTime,
  installmentStatusLabel,
  percentFromFraction,
} from '../lib/format';
import { ErrorState, LoadingState, Modal, PageHeader, Spinner, StatusBadge, Stat } from '../components/ui';

export function ContractDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const [payInstallment, setPayInstallment] = useState<Installment | null>(null);
  const [renegOpen, setRenegOpen] = useState(false);

  const { data: c, isLoading, error } = useQuery({
    queryKey: ['contract', id],
    queryFn: async () => (await api.get<Contract>(`/contracts/${id}`)).data,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['contract', id] });
    qc.invalidateQueries({ queryKey: ['contracts'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  if (isLoading) return <LoadingState />;
  if (error || !c) return <ErrorState message={apiError(error)} />;

  const canPay = hasRole('OPERATOR', 'MANAGER');
  const canReneg = hasRole('MANAGER');

  return (
    <div>
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>
      <PageHeader
        title={c.number}
        subtitle={c.customer ? c.customer.name : ''}
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={c.status} label={contractStatusLabel[c.status]} />
            {canReneg && ['ACTIVE', 'DEFAULTED'].includes(c.status) && (
              <button className="btn-secondary" onClick={() => setRenegOpen(true)}>
                <RefreshCw className="h-4 w-4" /> Renegociar
              </button>
            )}
          </div>
        }
      />

      {c.collectionCase && (
        <Link to={`/collections/${c.collectionCase.id}`} className="mb-4 flex items-center gap-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-500/30">
          <PhoneCall className="h-4 w-4" /> Caso de cobrança aberto — {c.collectionCase.daysOverdue} dias em atraso ({currency(c.collectionCase.totalOverdue)}).
        </Link>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {c.summary && (
          <>
            <div className="card p-4"><Stat label="Principal" value={currency(c.principal)} /></div>
            <div className="card p-4"><Stat label="Total" value={currency(c.totalAmount)} /></div>
            <div className="card p-4"><Stat label="Pago" value={currency(c.summary.totalPaid)} /></div>
            <div className="card p-4"><Stat label="Em aberto" value={currency(c.summary.outstanding)} /></div>
            <div className="card p-4"><Stat label="Em atraso" value={<span className={c.summary.overdue > 0 ? 'text-rose-600 dark:text-rose-400' : ''}>{currency(c.summary.overdue)}</span>} /></div>
            <div className="card p-4"><Stat label="Parcelas pagas" value={`${c.summary.paidCount}/${c.summary.installmentsCount}`} /></div>
          </>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card p-6 lg:col-span-2">
          <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Cronograma de parcelas</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Vencimento</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-right">Pago</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {c.installments?.map((i) => (
                  <tr key={i.id}>
                    <td className="px-3 py-2">{i.number}</td>
                    <td className="px-3 py-2">{date(i.dueDate)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{currency(i.amountDue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">{currency(i.amountPaid)}</td>
                    <td className="px-3 py-2 text-center"><StatusBadge status={i.status} label={installmentStatusLabel[i.status]} /></td>
                    <td className="px-3 py-2 text-right">
                      {canPay && ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'].includes(i.status) && (
                        <button className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline" onClick={() => setPayInstallment(i)}>
                          Pagar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Condições</h3>
            <div className="space-y-3">
              <Stat label="Taxa mensal" value={percentFromFraction(c.interestRate)} />
              <Stat label="CET anual" value={percentFromFraction(c.cetAnnual)} />
              <Stat label="Multa / Mora" value={`${percentFromFraction(c.lateFeeRate)} / ${percentFromFraction(c.lateInterestRate)} a.m.`} />
              <Stat label="Sistema" value={amortizationLabel[c.amortizationType]} />
              <Stat label="Início / Fim" value={`${date(c.startDate)} → ${date(c.endDate)}`} />
            </div>
          </div>

          <div className="card p-6">
            <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Pagamentos</h3>
            {c.payments && c.payments.length > 0 ? (
              <div className="space-y-3">
                {c.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between border-b border-slate-50 dark:border-slate-800 pb-2 text-sm last:border-0">
                    <div>
                      <p className="font-medium text-slate-700 dark:text-slate-200">{currency(p.amount)} <span className="text-xs text-slate-400 dark:text-slate-500">({p.method})</span></p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">Parc. {p.installment?.number} · {dateTime(p.paidAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 dark:text-slate-500">Nenhum pagamento registrado.</p>
            )}
          </div>
        </div>
      </div>

      {payInstallment && (
        <PaymentModal installment={payInstallment} onClose={() => setPayInstallment(null)} onDone={invalidate} />
      )}
      <RenegotiateModal open={renegOpen} contract={c} onClose={() => setRenegOpen(false)} onDone={(cid) => navigate(`/contracts/${cid}`)} />
    </div>
  );
}

const paymentSchema = z.object({
  amount: z.coerce.number({ invalid_type_error: 'Informe um valor' }).positive('O valor deve ser maior que zero'),
  method: z.string().min(1),
  paidAt: z.string().min(1, 'Informe a data'),
});
type PaymentValues = z.infer<typeof paymentSchema>;

function PaymentModal({ installment, onClose, onDone }: { installment: Installment; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  // Tracks whether the user manually edited the amount; until then it mirrors the computed charges.
  const [amountTouched, setAmountTouched] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PaymentValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: installment.amountDue - installment.amountPaid,
      method: 'PIX',
      paidAt: new Date().toISOString().slice(0, 10),
    },
  });

  const paidAt = watch('paidAt');

  const { data: charges } = useQuery({
    queryKey: ['charges', installment.id, paidAt],
    queryFn: async () =>
      (await api.get<ChargesPreview>(`/contracts/installments/${installment.id}/charges`, { params: { date: new Date(paidAt).toISOString() } })).data,
    enabled: !!paidAt,
  });

  const due = charges?.totalDue ?? installment.amountDue - installment.amountPaid;
  // Keep the amount synced to the recomputed total until the user overrides it.
  useEffect(() => {
    if (!amountTouched) setValue('amount', due);
  }, [due, amountTouched, setValue]);

  const submit = async (v: PaymentValues) => {
    try {
      await api.post('/payments', { installmentId: installment.id, amount: v.amount, method: v.method, paidAt: new Date(v.paidAt).toISOString() });
      toast.success('Pagamento registrado');
      onDone();
      onClose();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <Modal open onClose={onClose} title={`Pagar parcela ${installment.number}`}>
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        {charges && (
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Em atraso</span>
            <span className="text-right font-medium">{charges.daysLate} dia(s)</span>
            <span className="text-slate-500 dark:text-slate-400">Saldo da parcela</span>
            <span className="text-right tabular-nums">{currency(charges.outstanding)}</span>
            <span className="text-slate-500 dark:text-slate-400">Multa</span>
            <span className="text-right tabular-nums">{currency(charges.fine)}</span>
            <span className="text-slate-500 dark:text-slate-400">Juros de mora</span>
            <span className="text-right tabular-nums">{currency(charges.interest)}</span>
            <span className="font-semibold text-slate-700 dark:text-slate-200">Total devido</span>
            <span className="text-right font-bold tabular-nums text-brand-700 dark:text-brand-400">{currency(charges.totalDue)}</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="pay-amount">Valor pago (R$)</label>
            <input
              id="pay-amount"
              type="number"
              step="0.01"
              className="input"
              {...register('amount', { onChange: () => setAmountTouched(true) })}
            />
            {errors.amount && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{errors.amount.message}</p>}
          </div>
          <div>
            <label className="label" htmlFor="pay-date">Data</label>
            <input
              id="pay-date"
              type="date"
              className="input"
              {...register('paidAt', { onChange: () => setAmountTouched(false) })}
            />
            {errors.paidAt && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{errors.paidAt.message}</p>}
          </div>
          <div className="col-span-2">
            <label className="label" htmlFor="pay-method">Forma de pagamento</label>
            <select id="pay-method" className="input" {...register('method')}>
              {['PIX', 'BOLETO', 'TED', 'CASH', 'CARD', 'INTERNAL'].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">Pagamento parcial é permitido (valor menor que o total devido).</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}><Banknote className="h-4 w-4" />{isSubmitting && <Spinner className="h-4 w-4" />}Registrar pagamento</button>
        </div>
      </form>
    </Modal>
  );
}

const renegSchema = z.object({
  termMonths: z.coerce.number().int('Use um número inteiro').min(1, 'Mínimo de 1 mês').max(600, 'Prazo muito longo'),
  ratePercent: z.coerce.number().min(0, 'Não pode ser negativa').max(100, 'Máximo de 100% a.m.'),
  amortizationType: z.enum(['PRICE', 'SAC', 'SIMPLE']),
  reason: z.string().optional(),
});
type RenegValues = z.infer<typeof renegSchema>;

function RenegotiateModal({ open, contract, onClose, onDone }: { open: boolean; contract: Contract; onClose: () => void; onDone: (id: string) => void }) {
  const toast = useToast();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RenegValues>({
    resolver: zodResolver(renegSchema),
    defaultValues: {
      termMonths: contract.termMonths,
      ratePercent: Number((contract.interestRate * 100).toFixed(2)),
      amortizationType: contract.amortizationType,
      reason: '',
    },
  });

  const submit = async (v: RenegValues) => {
    try {
      const res = await api.post(`/collections/contracts/${contract.id}/renegotiate`, {
        termMonths: v.termMonths,
        interestRate: v.ratePercent / 100,
        amortizationType: v.amortizationType,
        reason: v.reason || 'Renegociação de dívida',
      });
      toast.success(`Novo contrato ${res.data.number} gerado`);
      onClose();
      onDone(res.data.id);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Renegociar dívida">
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">O saldo devedor em aberto (incluindo encargos de mora) será consolidado em um novo contrato.</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="reneg-term">Novo prazo (meses)</label>
            <input id="reneg-term" type="number" className="input" {...register('termMonths')} />
            {errors.termMonths && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{errors.termMonths.message}</p>}
          </div>
          <div>
            <label className="label" htmlFor="reneg-rate">Nova taxa (% a.m.)</label>
            <input id="reneg-rate" type="number" step="0.01" className="input" {...register('ratePercent')} />
            {errors.ratePercent && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{errors.ratePercent.message}</p>}
          </div>
          <div className="col-span-2">
            <label className="label" htmlFor="reneg-system">Sistema</label>
            <select id="reneg-system" className="input" {...register('amortizationType')}>
              {Object.entries(amortizationLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label" htmlFor="reneg-reason">Motivo</label>
            <textarea id="reneg-reason" rows={2} className="input" {...register('reason')} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner className="h-4 w-4" />}Renegociar</button>
        </div>
      </form>
    </Modal>
  );
}
