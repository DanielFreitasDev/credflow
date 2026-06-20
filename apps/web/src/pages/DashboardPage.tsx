import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Wallet, TrendingUp, AlertTriangle, Users, FileSignature, Percent } from 'lucide-react';
import { ReactNode } from 'react';
import { api, apiError } from '../lib/api';
import { DashboardOverview } from '../lib/types';
import { currency, monthLabel, number, percent, contractStatusLabel, proposalStatusLabel } from '../lib/format';
import { ErrorState, LoadingState, PageHeader } from '../components/ui';

const RISK_COLORS: Record<string, string> = { A: '#10b981', B: '#0ea5e9', C: '#f59e0b', D: '#f97316', E: '#ef4444' };

function KpiCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tone}`}>{icon}</div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
        <p className="truncate text-xl font-bold text-slate-900 dark:text-slate-50">{value}</p>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardOverview>('/dashboard/overview')).data,
  });

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState message={apiError(error)} />;

  const { kpis } = data;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Visão geral da carteira de crédito" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard icon={<Wallet className="h-6 w-6 text-brand-600 dark:text-brand-400" />} tone="bg-brand-50 dark:bg-brand-500/15" label="Carteira (a receber)" value={currency(kpis.portfolioOutstanding)} />
        <KpiCard icon={<TrendingUp className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />} tone="bg-emerald-50 dark:bg-emerald-500/15" label="Total emprestado" value={currency(kpis.totalLent)} />
        <KpiCard icon={<TrendingUp className="h-6 w-6 text-sky-600 dark:text-sky-400" />} tone="bg-sky-50 dark:bg-sky-500/15" label="Total recebido" value={currency(kpis.totalReceived)} />
        <KpiCard icon={<AlertTriangle className="h-6 w-6 text-rose-600 dark:text-rose-400" />} tone="bg-rose-50 dark:bg-rose-500/15" label="Total em atraso" value={currency(kpis.totalOverdue)} />
        <KpiCard icon={<Percent className="h-6 w-6 text-amber-600 dark:text-amber-400" />} tone="bg-amber-50 dark:bg-amber-500/15" label="Inadimplência" value={percent(kpis.delinquencyRate)} />
        <KpiCard icon={<Users className="h-6 w-6 text-purple-600 dark:text-purple-400" />} tone="bg-purple-50 dark:bg-purple-500/15" label="Clientes" value={number(kpis.customers)} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-2 xl:grid-cols-2">
        <KpiCard icon={<FileSignature className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />} tone="bg-indigo-50 dark:bg-indigo-500/15" label="Contratos ativos" value={number(kpis.activeContracts)} />
        <KpiCard icon={<FileSignature className="h-6 w-6 text-slate-600 dark:text-slate-300" />} tone="bg-slate-100 dark:bg-slate-800" label="Propostas pendentes" value={number(kpis.proposalsPending)} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-200">Recebimentos futuros (6 meses)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.upcomingReceivables.map((r) => ({ ...r, label: monthLabel(r.month) }))}>
              <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <Tooltip formatter={(v: number) => currency(v)} cursor={{ fill: '#eef2ff' }} />
              <Bar dataKey="amount" fill="#4f46e5" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-200">Clientes por faixa de risco</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={data.customersByRisk}
                dataKey="count"
                nameKey="band"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={2}
                label={(e) => `${e.band}: ${e.count}`}
              >
                {data.customersByRisk.map((e) => (
                  <Cell key={e.band} fill={RISK_COLORS[e.band]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-3 font-semibold text-slate-800 dark:text-slate-200">Contratos por status</h3>
          <BreakdownList items={data.contractsByStatus.map((c) => ({ label: contractStatusLabel[c.status] ?? c.status, count: c.count }))} />
        </div>
        <div className="card p-5">
          <h3 className="mb-3 font-semibold text-slate-800 dark:text-slate-200">Propostas por status</h3>
          <BreakdownList items={data.proposalsByStatus.map((p) => ({ label: proposalStatusLabel[p.status] ?? p.status, count: p.count }))} />
        </div>
      </div>
    </div>
  );
}

function BreakdownList({ items }: { items: { label: string; count: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  if (!items.length) return <p className="text-sm text-slate-400 dark:text-slate-500">Sem dados.</p>;
  return (
    <div className="space-y-3">
      {items.map((i) => (
        <div key={i.label}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-300">{i.label}</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{i.count}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${(i.count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
