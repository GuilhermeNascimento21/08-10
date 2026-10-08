import React, { useState, useEffect, useCallback } from 'react';
import {
  Tv,
  User,
  Key,
  AlertCircle,
  RefreshCw,
  Gift,
  Clock,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Zap,
  Menu,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Plan, Payment, IptvAccess, IptvTestResult } from '../../types';
import { api } from '../../lib/api';
import { ClientSidebar, ClientTab } from './ClientSidebar';
import { ClientAccessesView } from './ClientAccessesView';
import { ClientRenewalView } from './ClientRenewalView';
import { ClientTestGeneratorView } from './ClientTestGeneratorView';
import { ClientAppsView } from './ClientAppsView';
import { ClientProfileView } from './ClientProfileView';

export const ClientPortal: React.FC = () => {
  const { currentCustomer, logoutCustomer, loginCustomer, refreshCustomer } = useAuth();
  const [activeTab, setActiveTab] = useState<ClientTab>('accesses');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Core Data
  const [plans, setPlans] = useState<Plan[]>([]);
  const [accesses, setAccesses] = useState<IptvAccess[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Renewal target and active pending payment state (persists across tab switches)
  const [targetAccessForRenewal, setTargetAccessForRenewal] = useState<IptvAccess | null>(null);
  const [activePendingPayment, setActivePendingPayment] = useState<Payment | null>(null);

  // Login Form state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Public Test Generator Modal for Unauthenticated Users
  const [showPublicTestModal, setShowPublicTestModal] = useState(false);

  const fetchClientData = useCallback(async () => {
    if (!currentCustomer) return;
    try {
      setRefreshing(true);
      const [allPlans, allAccesses, paymentsList] = await Promise.all([
        api.getPlans(),
        api.getClientAccesses(),
        api.getClientPayments(),
      ]);
      setPlans(allPlans.filter((p) => p.active));
      setAccesses(allAccesses);
      setPayments(paymentsList);
    } catch (err) {
      console.error('Error fetching client portal data', err);
    } finally {
      setRefreshing(false);
    }
  }, [currentCustomer]);

  useEffect(() => {
    if (currentCustomer) {
      fetchClientData();
    }
  }, [currentCustomer, fetchClientData]);

  // Initial fetch for plans
  useEffect(() => {
    api.getPlans().then((list) => {
      setPlans(list.filter((p) => p.active));
    }).catch(() => {});
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    try {
      const { customer, token } = await api.clientLogin(loginIdentifier, loginPassword);
      loginCustomer(customer, token);
      setActiveTab('accesses');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLoginError(msg || 'Credenciais inválidas. Verifique usuário e senha.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRenewAccess = (access: IptvAccess) => {
    setTargetAccessForRenewal(access);
    setActiveTab('renew');
  };

  // If user is NOT logged in, show Modern Zinc Dark Login Screen with Test Generator CTA
  if (!currentCustomer) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-center items-center p-4 relative selection:bg-indigo-600 selection:text-white">
        {/* Subtle background glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl space-y-6 relative z-10">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 rounded-2xl bg-indigo-600/15 border border-indigo-500/30 text-indigo-400 shadow-md">
              <Tv className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-zinc-100 tracking-tight">
              Portal do Assinante
            </h1>
            <p className="text-xs text-zinc-400">
              Acesse sua conta para consultar suas telas, credenciais e renovar seu acesso.
            </p>
          </div>

          {loginError && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{loginError}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="text-zinc-300 font-medium flex items-center justify-between">
                <span>Usuário Seu acesso</span>
                <span className="text-[10px] text-zinc-500 font-mono">Ex: seu_usuario@painel.com</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  required
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-xs font-medium focus:border-indigo-500 focus:outline-none placeholder-zinc-600 transition-colors"
                  placeholder="Seu usuário ou e-mail"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-zinc-300 font-medium flex items-center justify-between">
                <span>Senha de Acesso ao Portal</span>
                <span className="text-[10px] text-zinc-500 font-mono">Ex: sua senha</span>
              </label>
              <div className="relative">
                <Key className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-xs font-medium focus:border-indigo-500 focus:outline-none placeholder-zinc-600 transition-colors"
                  placeholder="Sua senha de acesso"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/25"
            >
              {loginLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Entrando no Portal...</span>
                </>
              ) : (
                <span>Acessar Minha Conta</span>
              )}
            </button>
          </form>

          {/* Quick 1-Hour Test Trigger */}
          <div className="pt-4 border-t border-zinc-800 space-y-2">
            <div className="text-[11px] text-zinc-400 text-center">
              Novo por aqui? Cadastre-se e receba o teste no seu e-mail:
            </div>
            <button
              type="button"
              onClick={() => setShowPublicTestModal(true)}
              className="w-full py-2.5 px-4 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-indigo-300 hover:text-indigo-200 border border-indigo-500/30 text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-sm"
            >
              <Gift className="w-4 h-4 text-indigo-400" />
              <span>Fazer Cadastro & Gerar Teste Grátis</span>
              <Sparkles className="w-3.5 h-3.5 text-amber-400 ml-auto" />
            </button>
          </div>
        </div>

        {/* Public Test Generator Modal */}
        {showPublicTestModal && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl p-6 relative my-8">
              <button
                onClick={() => setShowPublicTestModal(false)}
                className="absolute top-5 right-5 p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors z-20"
                title="Fechar"
              >
                ✕
              </button>
              <ClientTestGeneratorView
                onSuccessRegistered={(customer) => {
                  setTimeout(() => {
                    setShowPublicTestModal(false);
                  }, 2000);
                }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Authenticated State with Left Sidebar Layout
  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans selection:bg-indigo-600 selection:text-white">
      {/* Left Sidebar */}
      <ClientSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        customer={currentCustomer}
        onLogout={logoutCustomer}
        accessCount={accesses.length}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-zinc-950">
        {/* Top Navbar Header */}
        <header className="h-16 border-b border-zinc-800 px-4 sm:px-6 flex items-center justify-between bg-zinc-900/50 backdrop-blur-sm shrink-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white transition-colors"
              title="Abrir Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-sm font-bold text-zinc-100 capitalize truncate">
              {activeTab === 'accesses' && 'Meus Acessos & Pontos'}
              {activeTab === 'renew' && 'Renovar / Pagar com PIX'}
              {activeTab === 'test' && 'Gerador de Teste (1 Hora)'}
              {activeTab === 'apps' && 'Aplicativos, Códigos & DNS'}
              {activeTab === 'profile' && 'Meus Dados & Atendimento'}
            </h1>
            <span className="text-xs text-zinc-500 hidden sm:inline">•</span>
            <span className="text-xs text-zinc-400 hidden sm:inline truncate max-w-[150px]">
              {currentCustomer.name}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Test Button */}
            <button
              onClick={() => setActiveTab('test')}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition-colors"
            >
              <Gift className="w-3.5 h-3.5 text-indigo-400" />
              <span>Gerar Teste</span>
            </button>

            {/* Quick Refresh Button */}
            <button
              onClick={() => {
                fetchClientData();
                refreshCustomer();
              }}
              disabled={refreshing}
              className="p-2 rounded-lg bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-750 transition-colors"
              title="Atualizar Dados"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
          </div>
        </header>

        {/* Scrollable View Container */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          {activeTab === 'accesses' && (
            <ClientAccessesView
              customer={currentCustomer}
              accesses={accesses}
              plans={plans}
              onRenewAccess={handleRenewAccess}
              onRefresh={() => {
                fetchClientData();
                refreshCustomer();
              }}
            />
          )}

          {activeTab === 'renew' && (
            <ClientRenewalView
              customer={currentCustomer}
              accesses={accesses}
              plans={plans}
              initialAccess={targetAccessForRenewal}
              initialPayment={activePendingPayment}
              onPaymentChange={setActivePendingPayment}
              onSuccessRenewal={() => {
                setActivePendingPayment(null);
                fetchClientData();
                refreshCustomer();
              }}
            />
          )}

          {activeTab === 'test' && (
            <ClientTestGeneratorView
              onNavigateToRenew={() => setActiveTab('renew')}
              onTestGenerated={() => {
                fetchClientData();
                refreshCustomer();
              }}
            />
          )}

          {activeTab === 'apps' && <ClientAppsView customer={currentCustomer} />}

          {activeTab === 'profile' && (
            <ClientProfileView
              customer={currentCustomer}
              payments={payments}
              onCustomerUpdated={() => {
                fetchClientData();
                refreshCustomer();
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
};
