import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Package,
  CreditCard,
  CalendarClock,
  Bot,
  Settings,
  ExternalLink,
  Gift,
  Sparkles,
  Shield,
  Layers,
  LogOut,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ClientTestGeneratorView } from '../client/ClientTestGeneratorView';

export interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  expiringCount?: number;
  pendingPayments?: number;
  pendingJobs?: number;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  expiringCount = 0,
  pendingPayments = 0,
  pendingJobs = 0,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const { setPortal } = useAuth();
  const [showTestModal, setShowTestModal] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard Geral', icon: LayoutDashboard },
    { id: 'customers', label: 'Clientes & Acessos', icon: Users },
    { id: 'plans', label: 'Planos & Preços', icon: Package },
    {
      id: 'payments',
      label: 'Pagamentos PIX',
      icon: CreditCard,
      badge: pendingPayments > 0 ? pendingPayments : undefined,
      badgeColor: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    },
    {
      id: 'expirations',
      label: 'Vencimentos',
      icon: CalendarClock,
      badge: expiringCount > 0 ? expiringCount : undefined,
      badgeColor: 'bg-red-500/15 text-red-300 border-red-500/30',
    },
    {
      id: 'automation',
      label: 'Robô Playwright',
      icon: Bot,
      badge: pendingJobs > 0 ? `${pendingJobs} fila` : undefined,
      badgeColor: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  const sidebarContent = (
    <div className="p-4 space-y-5 h-full flex flex-col justify-between overflow-y-auto">
      <div className="space-y-5">
        {/* Mobile Header with Close Button */}
        <div className="flex items-center justify-between md:hidden pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold tracking-tight text-zinc-100">
              IPTV <span className="text-indigo-400">FLOW</span>
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
              ADMIN
            </span>
          </div>
          <button
            onClick={onCloseMobile}
            className="p-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section: Main Menu */}
        <div>
          <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-2.5">
            Administração
          </p>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    onCloseMobile?.();
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group ${
                    isActive
                      ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`w-4 h-4 transition-colors ${
                        isActive ? 'text-indigo-400' : 'text-zinc-500 group-hover:text-zinc-300'
                      }`}
                    />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${
                        isActive
                          ? 'bg-indigo-600 text-white border-indigo-400'
                          : item.badgeColor || 'bg-zinc-950 text-zinc-400 border-zinc-800'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Quick Action: Gerar Teste IPTV (1h) */}
        <div className="p-3.5 rounded-2xl bg-zinc-950 border border-indigo-500/20 relative overflow-hidden group space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-600/20 text-indigo-400">
                <Gift className="w-3.5 h-3.5" />
              </span>
              <span className="text-xs font-bold text-zinc-100">Teste (1h)</span>
            </div>
            <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Crie rapidamente um teste temporário para enviar no WhatsApp do prospect.
          </p>
          <button
            onClick={() => {
              setShowTestModal(true);
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20"
          >
            <span>Gerar Teste Grátis</span>
            <Sparkles className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Client Portal Quick Link */}
        <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-300">Portal do Assinante</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <p className="text-[11px] text-zinc-400">
            Visualizar como o cliente vê os acessos e paga via PIX.
          </p>
          <button
            onClick={() => setPortal('CLIENT')}
            className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-750 text-zinc-300 hover:text-white text-xs font-medium transition-colors"
          >
            <span>Acessar como Cliente</span>
            <ExternalLink className="w-3 h-3 text-zinc-400" />
          </button>
        </div>
      </div>

      {/* User profile & System Footer */}
      <div className="p-4 border-t border-zinc-800 space-y-3 bg-zinc-950/40 mt-auto">
        <div className="flex items-center justify-between gap-2 p-2 bg-zinc-950 rounded-xl border border-zinc-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm shadow-indigo-600/20">
              <Shield className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold truncate text-zinc-200">Administrador</p>
              <p className="text-[10px] text-zinc-500 truncate font-mono">admin@painel.com</p>
            </div>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem('iptv_admin_token');
              window.location.reload();
            }}
            title="Encerrar sessão de Administrador"
            className="p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center justify-between text-[10px] text-zinc-500 px-1 font-mono">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            PLAYWRIGHT OK
          </span>
          <span>v2.4</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="w-64 shrink-0 bg-zinc-900 border-r border-zinc-800 hidden md:flex flex-col min-h-[calc(100vh-61px)]">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={onCloseMobile}
          />
          <div className="relative w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col h-full shadow-2xl z-10">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Quick Test Modal inside Admin */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl p-6 relative">
            <ClientTestGeneratorView />
            <div className="mt-4 pt-3 border-t border-zinc-800 flex justify-end">
              <button
                onClick={() => setShowTestModal(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
