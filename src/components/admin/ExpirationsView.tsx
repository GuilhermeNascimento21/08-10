import React, { useState, useEffect } from 'react';
import {
  Search,
  RefreshCw,
  MessageSquare,
  Zap,
  CheckCircle2,
  CalendarClock,
  Tv,
  ExternalLink,
} from 'lucide-react';
import { Customer, Plan, IptvAccess } from '../../types';
import { api } from '../../lib/api';

export const ExpirationsView: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<
    'EXPIRED' | 'TODAY' | 'TOMORROW' | '3DAYS' | '7DAYS' | 'FUTURE'
  >('TODAY');
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [openingWhatsApp, setOpeningWhatsApp] = useState(false);

  const fetchCustomers = async () => {
    try {
      const [custList, planList] = await Promise.all([api.getCustomers(), api.getPlans()]);
      setCustomers(custList);
      setPlans(planList);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleOpenWhatsAppWeb = async () => {
    try {
      setOpeningWhatsApp(true);
      const res = await api.openWhatsAppWeb();
      showToast(res.message || 'WhatsApp Web aberto em segundo plano com sucesso!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Erro ao abrir WhatsApp: ${msg}`);
    } finally {
      setOpeningWhatsApp(false);
    }
  };

  const handleManualRenew = async (customer: Customer, access?: IptvAccess) => {
    try {
      const targetId = access ? access.id : customer.id;
      setRenewingId(targetId);
      if (access) {
        await api.renewAccessManual(access.id, 30);
        showToast(`Renovação do ponto "${access.name}" enviada para Playwright!`);
      } else {
        await api.renewCustomerManual(customer.id, 30);
        showToast(`Renovação +30 para "${customer.name}" enviada para Playwright!`);
      }
      setTimeout(() => fetchCustomers(), 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Erro: ${msg}`);
    } finally {
      setRenewingId(null);
    }
  };

  const handleWhatsAppSend = (customer: Customer, daysRemaining: number) => {
    let msg = '';
    const name = customer.name.split(' ')[0];
    const user = customer.iptvUsername;
    const expDate = customer.expirationDate || 'Data não informada';
    const siteUrl = window.location.origin;

    if (daysRemaining < 0) {
      msg = `Olá ${name}! ⚠️ Seu acesso de TV (${user}) expirou em ${expDate}. Para reativar seu sinal com todos os canais e filmes liberados, acesse nosso site e faça seu login:\n${siteUrl}`;
    } else if (daysRemaining === 0) {
      msg = `Olá ${name}! 🚨 Seu plano de TV (${user}) vence **HOJE** (${expDate})! Para não ficar sem o sinal dos seus canais favoritos e evitar o bloqueio, acesse nosso site, faça seu login e renove com aprovação imediata via Pix:\n${siteUrl}`;
    } else if (daysRemaining === 3) {
      msg = `Olá ${name}! 🔔 Lembramos que seu plano de TV (${user}) está prestes a vencer em **3 dias** (data de vencimento: ${expDate}). Para manter seu acesso liberado sem interrupções, acesse nosso site, faça seu login e antecipe sua renovação:\n${siteUrl}`;
    } else if (daysRemaining === 1) {
      msg = `Olá ${name}! ⏳ Seu plano de TV (${user}) vence AMANHÃ (${expDate}). Acesse nosso site, faça seu login e renove para evitar o bloqueio do sinal:\n${siteUrl}`;
    } else {
      msg = `Olá ${name}! Seu plano de TV (${user}) vencerá em ${daysRemaining} dias (${expDate}). Acesse nosso site, faça seu login para antecipar sua renovação:\n${siteUrl}`;
    }

    const cleanPhone = customer.phone.replace(/\D/g, '');
    const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    const url = `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  const parseExpiration = (expStr: string) => {
    try {
      const [dPart] = expStr.split(' ');
      const [d, m, y] = dPart.split('/').map(Number);
      const expDate = new Date(y, m - 1, d);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      expDate.setHours(0, 0, 0, 0);

      const diffTime = expDate.getTime() - now.getTime();
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return { daysRemaining, expDate };
    } catch {
      return { daysRemaining: 999, expDate: new Date() };
    }
  };

  const categorized = customers.reduce(
    (acc, cust) => {
      const { daysRemaining } = parseExpiration(cust.expirationDate);
      const custWithDays = { ...cust, daysRemaining };

      if (daysRemaining < 0) {
        acc.expired.push(custWithDays);
      } else if (daysRemaining === 0) {
        acc.today.push(custWithDays);
      } else if (daysRemaining === 1) {
        acc.tomorrow.push(custWithDays);
      } else if (daysRemaining <= 3) {
        acc.threeDays.push(custWithDays);
      } else if (daysRemaining <= 7) {
        acc.sevenDays.push(custWithDays);
      } else {
        acc.future.push(custWithDays);
      }
      return acc;
    },
    {
      expired: [] as (Customer & { daysRemaining: number })[],
      today: [] as (Customer & { daysRemaining: number })[],
      tomorrow: [] as (Customer & { daysRemaining: number })[],
      threeDays: [] as (Customer & { daysRemaining: number })[],
      sevenDays: [] as (Customer & { daysRemaining: number })[],
      future: [] as (Customer & { daysRemaining: number })[],
    }
  );

  const getActiveCategoryList = () => {
    switch (activeCategory) {
      case 'EXPIRED':
        return categorized.expired;
      case 'TODAY':
        return categorized.today;
      case 'TOMORROW':
        return categorized.tomorrow;
      case '3DAYS':
        return categorized.threeDays;
      case '7DAYS':
        return categorized.sevenDays;
      case 'FUTURE':
        return categorized.future;
      default:
        return categorized.expired;
    }
  };

  const currentList = getActiveCategoryList().filter((c) => {
    const search = searchTerm.toLowerCase();
    return (
      c.name.toLowerCase().includes(search) ||
      c.iptvUsername.includes(search) ||
      c.phone.includes(search) ||
      (c.accesses && c.accesses.some((a) => a.iptvUsername.includes(search) || a.name.toLowerCase().includes(search)))
    );
  });

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 bg-zinc-900 border border-zinc-700 text-zinc-100 rounded-xl shadow-2xl animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="text-xs font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-zinc-400" />
            <span>Controle Estratégico de Vencimentos</span>
          </h1>
          <p className="text-xs text-zinc-400">
            Segmentação por período de expiração com avisos via WhatsApp e renovação Playwright.
          </p>
        </div>

        <button
          onClick={fetchCustomers}
          className="flex items-center gap-2 px-3 py-2 bg-zinc-900 hover:bg-zinc-850 text-zinc-300 text-xs font-medium rounded-lg border border-zinc-800 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Atualizar</span>
        </button>
      </div>

      {/* WhatsApp Web Background Card */}
      <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
              WhatsApp Web em Segundo Plano (Avisos de 3 Dias e Vencimento Hoje)
            </h2>
          </div>
          <p className="text-xs text-zinc-400">
            Mantenha o WhatsApp Web aberto no servidor para disparar avisos automáticos informando a data exata de vencimento e o link de login do site.
          </p>
        </div>
        <button
          onClick={handleOpenWhatsAppWeb}
          disabled={openingWhatsApp}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 disabled:opacity-50 shrink-0"
        >
          {openingWhatsApp ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <ExternalLink className="w-4 h-4" />
          )}
          <span>{openingWhatsApp ? 'Conectando...' : 'Abrir WhatsApp Web (2º Plano)'}</span>
        </button>
      </div>

      {/* Category Segmented Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Vencidos */}
        <button
          onClick={() => setActiveCategory('EXPIRED')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            activeCategory === 'EXPIRED'
              ? 'bg-zinc-900 border-red-500/50 shadow-sm'
              : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-sm font-semibold text-red-400">
              {categorized.expired.length}
            </span>
          </div>
          <p className="text-xs font-medium text-zinc-200 mt-2">Vencidos</p>
          <span className="text-[10px] text-zinc-500">Expiração passada</span>
        </button>

        {/* Vencem Hoje */}
        <button
          onClick={() => setActiveCategory('TODAY')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            activeCategory === 'TODAY'
              ? 'bg-zinc-900 border-amber-500/50 shadow-sm'
              : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-sm font-semibold text-amber-400">
              {categorized.today.length}
            </span>
          </div>
          <p className="text-xs font-medium text-zinc-200 mt-2">Vencem Hoje</p>
          <span className="text-[10px] text-zinc-500">Urgência máxima</span>
        </button>

        {/* Vencem Amanhã */}
        <button
          onClick={() => setActiveCategory('TOMORROW')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            activeCategory === 'TOMORROW'
              ? 'bg-zinc-900 border-amber-500/50 shadow-sm'
              : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-sm font-semibold text-amber-400">
              {categorized.tomorrow.length}
            </span>
          </div>
          <p className="text-xs font-medium text-zinc-200 mt-2">Vencem Amanhã</p>
          <span className="text-[10px] text-zinc-500">1 dia restante</span>
        </button>

        {/* Vencem em 3 dias */}
        <button
          onClick={() => setActiveCategory('3DAYS')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            activeCategory === '3DAYS'
              ? 'bg-zinc-900 border-blue-500/50 shadow-sm'
              : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-sm font-semibold text-blue-400">
              {categorized.threeDays.length}
            </span>
          </div>
          <p className="text-xs font-medium text-zinc-200 mt-2">Até 3 Dias</p>
          <span className="text-[10px] text-zinc-500">Alerta prévio</span>
        </button>

        {/* Vencem em 7 dias */}
        <button
          onClick={() => setActiveCategory('7DAYS')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            activeCategory === '7DAYS'
              ? 'bg-zinc-900 border-emerald-500/50 shadow-sm'
              : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-sm font-semibold text-emerald-400">
              {categorized.sevenDays.length}
            </span>
          </div>
          <p className="text-xs font-medium text-zinc-200 mt-2">Até 7 Dias</p>
          <span className="text-[10px] text-zinc-500">Aviso programado</span>
        </button>

        {/* Vencimentos Futuros */}
        <button
          onClick={() => setActiveCategory('FUTURE')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            activeCategory === 'FUTURE'
              ? 'bg-zinc-900 border-zinc-600 shadow-sm'
              : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="w-2 h-2 rounded-full bg-zinc-500" />
            <span className="text-sm font-semibold text-zinc-300">
              {categorized.future.length}
            </span>
          </div>
          <p className="text-xs font-medium text-zinc-200 mt-2">Futuros</p>
          <span className="text-[10px] text-zinc-500">&gt; 7 dias</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar por nome, ponto, usuário IPTV ou telefone..."
            className="w-full pl-9 pr-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
          />
        </div>
      </div>

      {/* Categorized Customers Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 text-[10px] uppercase font-medium">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Pontos / Usuário</th>
                <th className="px-4 py-3">Telefone</th>
                <th className="px-4 py-3">Plano</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">Dias Restantes</th>
                <th className="px-4 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {currentList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                    Nenhum cliente ou ponto encontrado nesta categoria.
                  </td>
                </tr>
              ) : (
                currentList.map((cust) => {
                  const plan = plans.find((p) => p.id === cust.planId);
                  const planName = plan ? plan.name : 'Mensal';
                  const accesses = cust.accesses || [];

                  return (
                    <tr key={cust.id} className="hover:bg-zinc-850/40 transition-colors">
                      <td className="px-4 py-3 font-medium text-zinc-200">
                        {cust.name}
                      </td>
                      <td className="px-4 py-3 font-mono text-zinc-300">
                        <div className="flex items-center gap-1">
                          <Tv className="w-3.5 h-3.5 text-blue-400" />
                          <span>{cust.iptvUsername}</span>
                        </div>
                        {accesses.length > 1 && (
                          <div className="text-[10px] text-zinc-500">
                            +{accesses.length - 1} outro(s) ponto(s)
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-400 font-mono">{cust.phone}</td>
                      <td className="px-4 py-3 text-zinc-300">{planName}</td>
                      <td className="px-4 py-3 font-mono text-zinc-400 text-[11px]">
                        {cust.expirationDate}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {cust.daysRemaining < 0 ? (
                          <span className="text-red-400">
                            Venceu há {Math.abs(cust.daysRemaining)} dias
                          </span>
                        ) : cust.daysRemaining === 0 ? (
                          <span className="text-amber-400 font-bold">Vence Hoje</span>
                        ) : (
                          <span className="text-emerald-400">
                            {cust.daysRemaining} dias restantes
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right space-x-1.5">
                        <button
                          onClick={() => handleWhatsAppSend(cust, cust.daysRemaining)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-medium transition-colors"
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span>WhatsApp</span>
                        </button>

                        <button
                          disabled={renewingId === cust.id}
                          onClick={() => handleManualRenew(cust)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-750 text-zinc-200 border border-zinc-700 text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          {renewingId === cust.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />
                          ) : (
                            <Zap className="w-3 h-3 text-blue-400" />
                          )}
                          <span>Renovar Playwright</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
