import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Search } from 'lucide-react';
import { api, apiError } from '../lib/api';
import { useDebounce } from '../lib/hooks';
import { useToast } from '../lib/toast';
import { Customer, Paginated, SimulationResult } from '../lib/types';
import { amortizationLabel, currency, formatDocument, percentFromFraction } from '../lib/format';
import { ErrorState, PageHeader, Spinner } from '../components/ui';

export function ProposalNewPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();

  const [customerId, setCustomerId] = useState(params.get('customerId') ?? '');
  const [customerSearch, setCustomerSearch] = useState('');
  const debouncedCustomer = useDebounce(customerSearch, 350);
  const [showList, setShowList] = useState(false);

  const [amortizationType, setAmortizationType] = useState<'PRICE' | 'SAC' | 'SIMPLE'>('PRICE');
  const [requestedAmount, setRequestedAmount] = useState(10000);
  const [termMonths, setTermMonths] = useState(12);
  const [ratePercent, setRatePercent] = useState(2.5); // monthly %
  const [tacAmount, setTacAmount] = useState(0);
  const [autoIof, setAutoIof] = useState(true);
  const [purpose, setPurpose] = useState('');
  const [creating, setCreating] = useState(false);

  // Preselected customer (from query param) or search results.
  const { data: selected } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: async () => (await api.get<Customer>(`/customers/${customerId}`)).data,
    enabled: !!customerId,
  });

  const { data: results } = useQuery({
    queryKey: ['customer-search', debouncedCustomer],
    queryFn: async () =>
      (await api.get<Paginated<Customer>>('/customers', { params: { search: debouncedCustomer, pageSize: 6 } })).data,
    enabled: showList && debouncedCustomer.length >= 2,
  });

  const simInput = useMemo(
    () => ({
      amortizationType,
      requestedAmount,
      termMonths,
      interestRate: ratePercent / 100,
      tacAmount,
      autoIof,
    }),
    [amortizationType, requestedAmount, termMonths, ratePercent, tacAmount, autoIof],
  );
  const debouncedSim = useDebounce(simInput, 400);

  const { data: sim, error: simError, isFetching } = useQuery({
    queryKey: ['simulate', debouncedSim],
    queryFn: async () => (await api.post<SimulationResult>('/proposals/simulate', debouncedSim)).data,
    enabled: requestedAmount > 0 && termMonths > 0,
  });

  const handleCreate = async () => {
    if (!customerId) {
      toast.error('Selecione um cliente');
      return;
    }
    setCreating(true);
    try {
      const res = await api.post('/proposals', { ...simInput, customerId, purpose: purpose || undefined });
      toast.success(`Proposta ${res.data.number} criada`);
      navigate(`/proposals/${res.data.id}`);
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>
      <PageHeader title="Nova proposta" subtitle="Simule e registre uma solicitação de crédito" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Inputs */}
        <div className="card space-y-4 p-6">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Parâmetros</h3>

          <div className="relative">
            <label className="label">Cliente</label>
            {selected && customerId ? (
              <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-100">{selected.name}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{formatDocument(selected.document)}</p>
                </div>
                <button className="text-sm text-brand-600 dark:text-brand-400 hover:underline" onClick={() => { setCustomerId(''); setShowList(true); }}>
                  Trocar
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <input
                    className="input pl-9"
                    placeholder="Buscar cliente por nome/documento..."
                    value={customerSearch}
                    onFocusCapture={() => setShowList(true)}
                    onChange={(e) => { setCustomerSearch(e.target.value); setShowList(true); }}
                  />
                </div>
                {showList && results && results.data.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg">
                    {results.data.map((c) => (
                      <button
                        key={c.id}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm dark:hover:bg-brand-500/10 hover:bg-brand-50"
                        onClick={() => { setCustomerId(c.id); setShowList(false); setCustomerSearch(''); }}
                      >
                        <span className="font-medium text-slate-800 dark:text-slate-100">{c.name}</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">{formatDocument(c.document)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <label className="label">Sistema de amortização</label>
            <select className="input" value={amortizationType} onChange={(e) => setAmortizationType(e.target.value as 'PRICE')}>
              {Object.entries(amortizationLabel).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Valor solicitado (R$)</label>
              <input type="number" className="input" value={requestedAmount} onChange={(e) => setRequestedAmount(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Prazo (meses)</label>
              <input type="number" className="input" value={termMonths} onChange={(e) => setTermMonths(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Taxa de juros (% ao mês)</label>
              <input type="number" step="0.01" className="input" value={ratePercent} onChange={(e) => setRatePercent(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">TAC (R$)</label>
              <input type="number" step="0.01" className="input" value={tacAmount} onChange={(e) => setTacAmount(Number(e.target.value))} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={autoIof} onChange={(e) => setAutoIof(e.target.checked)} className="h-4 w-4 rounded border-slate-300 dark:border-slate-700" />
            Calcular IOF automaticamente
          </label>

          <div>
            <label className="label">Finalidade</label>
            <input className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Ex.: capital de giro" />
          </div>

          <button className="btn-primary w-full" onClick={handleCreate} disabled={creating || !customerId}>
            {creating && <Spinner className="h-4 w-4" />}
            Criar proposta
          </button>
        </div>

        {/* Simulation result */}
        <div className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">Simulação</h3>
            {isFetching && <Spinner className="h-4 w-4 text-slate-400 dark:text-slate-500" />}
          </div>

          {simError ? (
            <ErrorState message={apiError(simError)} />
          ) : sim ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Result label="Parcela" value={currency(sim.installmentAmount)} highlight />
                <Result label="Total a pagar" value={currency(sim.totalAmount)} />
                <Result label="Valor financiado" value={currency(sim.financedAmount)} />
                <Result label="Juros totais" value={currency(sim.totalInterest)} />
                <Result label="IOF" value={currency(sim.iofAmount)} />
                <Result label="CET anual" value={percentFromFraction(sim.cetAnnual)} highlight />
              </div>

              <h4 className="mb-2 mt-6 text-sm font-semibold text-slate-700 dark:text-slate-200">Cronograma</h4>
              <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-100 dark:border-slate-800">
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
                    {sim.schedule.map((s) => (
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
            </>
          ) : (
            <p className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">Informe os parâmetros para simular.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Result({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? 'bg-brand-50 dark:bg-brand-500/10' : 'bg-slate-50 dark:bg-slate-800/50'}`}>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${highlight ? 'text-brand-700 dark:text-brand-400' : 'text-slate-800 dark:text-slate-100'}`}>{value}</p>
    </div>
  );
}
