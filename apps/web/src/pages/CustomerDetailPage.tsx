import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Pencil, FilePlus } from 'lucide-react';
import { api, apiError } from '../lib/api';
import { Customer, FinancialHistory } from '../lib/types';
import {
  currency,
  customerStatusLabel,
  customerTypeLabel,
  date,
  formatDocument,
  proposalStatusLabel,
  contractStatusLabel,
} from '../lib/format';
import { ErrorState, LoadingState, PageHeader, Stat, StatusBadge } from '../components/ui';

export function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: customer, isLoading, error } = useQuery({
    queryKey: ['customer', id],
    queryFn: async () => (await api.get<Customer>(`/customers/${id}`)).data,
  });
  const { data: history } = useQuery({
    queryKey: ['customer-history', id],
    queryFn: async () => (await api.get<FinancialHistory>(`/customers/${id}/financial-history`)).data,
  });

  if (isLoading) return <LoadingState />;
  if (error || !customer) return <ErrorState message={apiError(error)} />;

  return (
    <div>
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>
      <PageHeader
        title={customer.name}
        subtitle={`${customerTypeLabel[customer.type]} · ${formatDocument(customer.document)}`}
        actions={
          <>
            <Link to={`/proposals/new?customerId=${customer.id}`} className="btn-secondary"><FilePlus className="h-4 w-4" /> Nova proposta</Link>
            <Link to={`/customers/${customer.id}/edit`} className="btn-primary"><Pencil className="h-4 w-4" /> Editar</Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Dados cadastrais</h3>
              <StatusBadge status={customer.status} label={customerStatusLabel[customer.status]} />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label="E-mail" value={customer.email || '—'} />
              <Stat label="Telefone" value={customer.phone || '—'} />
              <Stat label={customer.type === 'COMPANY' ? 'Ramo' : 'Profissão'} value={customer.occupation || '—'} />
              <Stat label={customer.type === 'COMPANY' ? 'Faturamento' : 'Renda mensal'} value={currency(customer.monthlyIncome)} />
              <Stat label="Score interno" value={customer.internalScore} />
              <Stat label={customer.type === 'COMPANY' ? 'Fundação' : 'Nascimento'} value={date(customer.foundationDate || customer.birthDate)} />
            </div>
            {customer.address && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <Stat
                  label="Endereço"
                  value={`${customer.address.street}, ${customer.address.number ?? 's/n'} — ${customer.address.district ?? ''} ${customer.address.city}/${customer.address.state} · ${customer.address.zipCode}`}
                />
              </div>
            )}
          </div>

          <div className="card p-6">
            <h3 className="mb-4 font-semibold text-slate-800">Propostas recentes</h3>
            {customer.proposals && customer.proposals.length > 0 ? (
              <div className="divide-y divide-slate-50">
                {customer.proposals.map((p) => (
                  <Link key={p.id} to={`/proposals/${p.id}`} className="flex items-center justify-between py-3 hover:bg-slate-50">
                    <div>
                      <p className="font-medium text-slate-800">{p.number}</p>
                      <p className="text-xs text-slate-400">{currency(p.requestedAmount)} · {p.termMonths}x</p>
                    </div>
                    <StatusBadge status={p.status} label={proposalStatusLabel[p.status]} />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">Nenhuma proposta.</p>
            )}
          </div>

          <div className="card p-6">
            <h3 className="mb-4 font-semibold text-slate-800">Contratos</h3>
            {customer.contracts && customer.contracts.length > 0 ? (
              <div className="divide-y divide-slate-50">
                {customer.contracts.map((c) => (
                  <Link key={c.id} to={`/contracts/${c.id}`} className="flex items-center justify-between py-3 hover:bg-slate-50">
                    <div>
                      <p className="font-medium text-slate-800">{c.number}</p>
                      <p className="text-xs text-slate-400">{currency(c.principal)} · {c.termMonths}x</p>
                    </div>
                    <StatusBadge status={c.status} label={contractStatusLabel[c.status]} />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">Nenhum contrato.</p>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="mb-4 font-semibold text-slate-800">Histórico financeiro</h3>
            {history ? (
              <div className="space-y-4">
                <Stat label="Total emprestado" value={currency(history.totalBorrowed)} />
                <Stat label="Total pago" value={currency(history.totalPaid)} />
                <Stat label="Saldo em aberto" value={currency(history.outstanding)} />
                <Stat label="Em atraso" value={<span className={history.overdue > 0 ? 'text-rose-600' : ''}>{currency(history.overdue)}</span>} />
                <div className="flex gap-4 border-t border-slate-100 pt-4 text-sm">
                  <span className="text-slate-500">Contratos: <strong className="text-slate-800">{history.totalContracts}</strong></span>
                  <span className="text-slate-500">Ativos: <strong className="text-slate-800">{history.activeContracts}</strong></span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Carregando...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
