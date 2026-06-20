import { useState } from 'react';
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
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
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
        <Link to={`/collections/${c.collectionCase.id}`} className="mb-4 flex items-center gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
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
            <div className="card p-4"><Stat label="Em atraso" value={<span className={c.summary.overdue > 0 ? 'text-rose-600' : ''}>{currency(c.summary.overdue)}</span>} /></div>
            <div className="card p-4"><Stat label="Parcelas pagas" value={`${c.summary.paidCount}/${c.summary.installmentsCount}`} /></div>
          </>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card p-6 lg:col-span-2">
          <h3 className="mb-4 font-semibold text-slate-800">Cronograma de parcelas</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Vencimento</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-right">Pago</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {c.installments?.map((i) => (
                  <tr key={i.id}>
                    <td className="px-3 py-2">{i.number}</td>
                    <td className="px-3 py-2">{date(i.dueDate)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{currency(i.amountDue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{currency(i.amountPaid)}</td>
                    <td className="px-3 py-2 text-center"><StatusBadge status={i.status} label={installmentStatusLabel[i.status]} /></td>
                    <td className="px-3 py-2 text-right">
                      {canPay && ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'].includes(i.status) && (
                        <button className="text-sm font-medium text-brand-600 hover:underline" onClick={() => setPayInstallment(i)}>
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
            <h3 className="mb-4 font-semibold text-slate-800">Condições</h3>
            <div className="space-y-3">
              <Stat label="Taxa mensal" value={percentFromFraction(c.interestRate)} />
              <Stat label="CET anual" value={percentFromFraction(c.cetAnnual)} />
              <Stat label="Multa / Mora" value={`${percentFromFraction(c.lateFeeRate)} / ${percentFromFraction(c.lateInterestRate)} a.m.`} />
              <Stat label="Sistema" value={amortizationLabel[c.amortizationType]} />
              <Stat label="Início / Fim" value={`${date(c.startDate)} → ${date(c.endDate)}`} />
            </div>
          </div>

          <div className="card p-6">
            <h3 className="mb-4 font-semibold text-slate-800">Pagamentos</h3>
            {c.payments && c.payments.length > 0 ? (
              <div className="space-y-3">
                {c.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between border-b border-slate-50 pb-2 text-sm last:border-0">
                    <div>
                      <p className="font-medium text-slate-700">{currency(p.amount)} <span className="text-xs text-slate-400">({p.method})</span></p>
                      <p className="text-xs text-slate-400">Parc. {p.installment?.number} · {dateTime(p.paidAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">Nenhum pagamento registrado.</p>
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

function PaymentModal({ installment, onClose, onDone }: { installment: Installment; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState<number | null>(null);
  const [method, setMethod] = useState('PIX');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  const { data: charges } = useQuery({
    queryKey: ['charges', installment.id, paidAt],
    queryFn: async () =>
      (await api.get<ChargesPreview>(`/contracts/installments/${installment.id}/charges`, { params: { date: new Date(paidAt).toISOString() } })).data,
  });

  const due = charges?.totalDue ?? installment.amountDue - installment.amountPaid;
  const value = amount ?? due;

  const submit = async () => {
    setLoading(true);
    try {
      await api.post('/payments', { installmentId: installment.id, amount: value, method, paidAt: new Date(paidAt).toISOString() });
      toast.success('Pagamento registrado');
      onDone();
      onClose();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Pagar parcela ${installment.number}`}>
      <div className="space-y-4">
        {charges && (
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
            <span className="text-slate-500">Em atraso</span>
            <span className="text-right font-medium">{charges.daysLate} dia(s)</span>
            <span className="text-slate-500">Saldo da parcela</span>
            <span className="text-right tabular-nums">{currency(charges.outstanding)}</span>
            <span className="text-slate-500">Multa</span>
            <span className="text-right tabular-nums">{currency(charges.fine)}</span>
            <span className="text-slate-500">Juros de mora</span>
            <span className="text-right tabular-nums">{currency(charges.interest)}</span>
            <span className="font-semibold text-slate-700">Total devido</span>
            <span className="text-right font-bold tabular-nums text-brand-700">{currency(charges.totalDue)}</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Valor pago (R$)</label>
            <input type="number" step="0.01" className="input" value={value} onChange={(e) => setAmount(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Data</label>
            <input type="date" className="input" value={paidAt} onChange={(e) => { setPaidAt(e.target.value); setAmount(null); }} />
          </div>
          <div className="col-span-2">
            <label className="label">Forma de pagamento</label>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              {['PIX', 'BOLETO', 'TED', 'CASH', 'CARD', 'INTERNAL'].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-slate-400">Pagamento parcial é permitido (valor menor que o total devido).</p>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={submit} disabled={loading}><Banknote className="h-4 w-4" />{loading && <Spinner className="h-4 w-4" />}Registrar pagamento</button>
        </div>
      </div>
    </Modal>
  );
}

function RenegotiateModal({ open, contract, onClose, onDone }: { open: boolean; contract: Contract; onClose: () => void; onDone: (id: string) => void }) {
  const toast = useToast();
  const [termMonths, setTermMonths] = useState(contract.termMonths);
  const [ratePercent, setRatePercent] = useState(Number((contract.interestRate * 100).toFixed(2)));
  const [amortizationType, setAmortizationType] = useState(contract.amortizationType);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const res = await api.post(`/collections/contracts/${contract.id}/renegotiate`, {
        termMonths,
        interestRate: ratePercent / 100,
        amortizationType,
        reason: reason || 'Renegociação de dívida',
      });
      toast.success(`Novo contrato ${res.data.number} gerado`);
      onClose();
      onDone(res.data.id);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Renegociar dívida">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">O saldo devedor em aberto (incluindo encargos de mora) será consolidado em um novo contrato.</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Novo prazo (meses)</label>
            <input type="number" className="input" value={termMonths} onChange={(e) => setTermMonths(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Nova taxa (% a.m.)</label>
            <input type="number" step="0.01" className="input" value={ratePercent} onChange={(e) => setRatePercent(Number(e.target.value))} />
          </div>
          <div className="col-span-2">
            <label className="label">Sistema</label>
            <select className="input" value={amortizationType} onChange={(e) => setAmortizationType(e.target.value as 'PRICE')}>
              {Object.entries(amortizationLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">Motivo</label>
            <textarea rows={2} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={submit} disabled={loading}>{loading && <Spinner className="h-4 w-4" />}Renegociar</button>
        </div>
      </div>
    </Modal>
  );
}
