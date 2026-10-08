import React, { useState } from 'react';
import {
  Users,
  UserCheck,
  Clock,
  CalendarClock,
  DollarSign,
  TrendingUp,
  CreditCard,
  ArrowUpRight,
  MessageSquare,
  RefreshCw,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Play,
  Tv,
  Sparkles,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { DashboardStats, Customer } from '../../types';
import { api } from '../../lib/api';

interface DashboardViewProps {
  stats: DashboardStats | null;
  loading: boolean;
  onRefresh: () => void;
  onNavigateTab: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  loading,
  onRefresh,
  onNavigateTab,
}) => {
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  if (loading || !stats) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-28 bg-zinc-900 rounded-2xl border border-zinc-800" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="h-80 bg-zinc-900 rounded-2xl border border-zinc-800 lg:col-span-2" />
          <div className="h-80 bg-zinc-900 rounded-2xl border border-zinc-800" />
        </div>
      </div>
    );
  }

  const handleQuickRenew = async (customerId: string, name: string) => {
    try {
      setRenewingId(customerId);
      await api.renewCustomerManual(customerId, 30);
      setSuccessToast(`Renovação de 30 dias enviada para fila Playwright para ${name}!`);
      setTimeout(() => setSuccessToast(null), 4000);
      onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Erro ao renovar: ${msg}`);
    } finally {
      setRenewingId(null);
    }
  };

  const handleWhatsAppAlert = (customer: Customer, daysRemaining: number) => {
    const phone = customer.phone.replace(/\D/g, '');
    const cleanPhone = phone.startsWith('55') ? phone : `55${phone}`;
    const text = encodeURIComponent(
      `Olá ${customer.name}! Notamos que seu acesso IPTV vence em ${customer.expirationDate} (${daysRemaining} dias restantes). Renove agora com liberação automática via PIX: ${window.location.origin}`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${text}`, '_blank');
  };

  const formatCurrency = (val: number | undefined | null) => {
    return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 bg-zinc-900 border border-emerald-500/30 text-zinc-100 rounded-2xl shadow-2xl animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="text-xs font-semibold">{successToast}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            <span>Dashboard Geral</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
              AO VIVO
            </span>
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Monitoramento em tempo real de múltiplos pontos, faturamento PIX e automação Playwright.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigateTab('customers')}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-600/20"
          >
            <Users className="w-4 h-4" />
            <span>Gerenciar Clientes & Pontos</span>
          </button>
          <button
            onClick={onRefresh}
            className="p-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-xl border border-zinc-800 transition-colors"
            title="Atualizar dados"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Grid - Zinc Dark Modern */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Clientes */}
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl space-y-1.5 hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-medium">Total de Clientes</span>
            <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-indigo-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-zinc-100">{stats.totalCustomers}</div>
          <div className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Base cadastrada no sistema
          </div>
        </div>

        {/* Clientes Ativos */}
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl space-y-1.5 hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-medium">Acessos Ativos</span>
            <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-emerald-400">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-400">{stats.activeCustomers}</div>
          <div className="text-[11px] text-zinc-500">Com validade regular</div>
        </div>

        {/* Vencendo em Breve */}
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl space-y-1.5 hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-medium">Vencendo em Breve</span>
            <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-amber-400">
              <CalendarClock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-400">{stats.expiringSoonCustomers}</div>
          <div className="text-[11px] text-zinc-500">Próximos 7 dias</div>
        </div>

        {/* Vencidos */}
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl space-y-1.5 hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-medium">Vencidos / Bloqueados</span>
            <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-red-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-red-400">{stats.expiredCustomers}</div>
          <div className="text-[11px] text-zinc-500">Aguardando renovação</div>
        </div>
      </div>

      {/* Financial KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl space-y-1.5 hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-medium">Faturamento Mensal</span>
            <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-zinc-100">
            {formatCurrency(stats.monthRevenue)}
          </div>
          <div className="text-[11px] text-emerald-400 font-medium">Via Mercado Pago PIX</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl space-y-1.5 hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-medium">Receita Hoje</span>
            <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-indigo-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-zinc-100">
            {formatCurrency(stats.todayRevenue)}
          </div>
          <div className="text-[11px] text-zinc-500">Aprovados hoje</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl space-y-1.5 hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-medium">Pagamentos Pendentes</span>
            <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-amber-400">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-zinc-100">{stats.pendingPaymentsCount}</div>
          <div className="text-[11px] text-zinc-500">PIX aguardando liquidação</div>
        </div>
      </div>

      {/* Revenue & Distribution Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Monthly Revenue Area Chart */}
        <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-zinc-100">Evolução do Faturamento</h3>
              <p className="text-xs text-zinc-400">Histórico de renovações mensais via PIX</p>
            </div>
            <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
              PIX Automático Ativo
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.monthlyRevenueChart}>
                <defs>
                  <linearGradient id="colorRevIndigo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="month" stroke="#71717a" fontSize={11} />
                <YAxis stroke="#71717a" fontSize={11} tickFormatter={(v) => `R$${v}`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    borderColor: '#27272a',
                    borderRadius: '12px',
                    color: '#f4f4f5',
                    fontSize: '12px',
                  }}
                  formatter={(val: any) => [`R$ ${Number(val || 0).toFixed(2)}`, 'Faturamento']}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorRevIndigo)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Customer Status Distribution */}
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-zinc-100">Distribuição de Status</h3>
            <p className="text-xs text-zinc-400">Status dos acessos ativos no painel</p>
          </div>

          <div className="h-44 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.customerStatusChart}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={68}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {(stats?.customerStatusChart || []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    borderColor: '#27272a',
                    borderRadius: '12px',
                    color: '#f4f4f5',
                    fontSize: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            {(stats?.customerStatusChart || []).map((s) => (
              <div key={s.name} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-zinc-400 text-[11px]">{s.name}:</span>
                <span className="font-semibold text-zinc-200">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Upcoming Expirations Action Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-amber-400" />
              <span>Próximos Vencimentos & Ação Rápida</span>
            </h3>
            <p className="text-xs text-zinc-400">
              Clientes que requerem aviso ou renovação direta via automação
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('expirations')}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 transition-colors"
          >
            <span>Ver Todos</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="pb-3 font-semibold">Cliente</th>
                <th className="pb-3 font-semibold">Pontos / Usuário</th>
                <th className="pb-3 font-semibold">Vencimento</th>
                <th className="pb-3 font-semibold">Status</th>
                <th className="pb-3 font-semibold text-right">Ações Rápidas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {(stats?.upcomingExpirations || []).map((cust) => {
                const isExpired = cust.daysRemaining < 0;
                const isToday = cust.daysRemaining === 0;

                return (
                  <tr key={cust.id} className="hover:bg-zinc-850/40 transition-colors">
                    <td className="py-3.5 font-medium text-zinc-200">
                      <div className="font-semibold">{cust.name}</div>
                      <div className="text-[11px] text-zinc-500 font-mono">{cust.phone}</div>
                    </td>

                    <td className="py-3.5 text-zinc-300">
                      <div className="flex items-center gap-1 font-mono text-[11px]">
                        <Tv className="w-3.5 h-3.5 text-zinc-500" />
                        <span>{cust.iptvUsername}</span>
                      </div>
                      <div className="text-[10px] text-zinc-500 font-medium">
                        {cust.accesses?.length || 1} ponto(s) cadastrado(s)
                      </div>
                    </td>

                    <td className="py-3.5 text-zinc-300">
                      <div className="font-semibold">{cust.expirationDate}</div>
                      <div
                        className={`text-[10px] font-medium ${
                          isExpired
                            ? 'text-red-400'
                            : isToday
                            ? 'text-amber-400 font-bold'
                            : 'text-zinc-400'
                        }`}
                      >
                        {isExpired
                          ? `Venceu há ${Math.abs(cust.daysRemaining)} dias`
                          : isToday
                          ? 'VENCE HOJE'
                          : `Faltam ${cust.daysRemaining} dias`}
                      </div>
                    </td>

                    <td className="py-3.5">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border ${
                          isExpired
                            ? 'bg-red-500/15 text-red-300 border-red-500/30'
                            : isToday
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        }`}
                      >
                        {isExpired ? 'Vencido' : isToday ? 'Vence Hoje' : 'Ativo'}
                      </span>
                    </td>

                    <td className="py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleWhatsAppAlert(cust, cust.daysRemaining)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                          title="Enviar lembrete no WhatsApp"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">WhatsApp</span>
                        </button>

                        <button
                          onClick={() => handleQuickRenew(cust.id, cust.name)}
                          disabled={renewingId === cust.id}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm shadow-indigo-600/20"
                          title="Renovar 30 dias com Playwright"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>{renewingId === cust.id ? 'Renovando...' : '+30 dias'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
