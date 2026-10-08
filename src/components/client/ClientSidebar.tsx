import React from 'react';
import {
  Tv,
  Zap,
  Gift,
  Smartphone,
  User,
  LogOut,
  Clock,
  Sparkles,
  ChevronRight,
  X,
} from 'lucide-react';
import { Customer } from '../../types';

export type ClientTab = 'accesses' | 'renew' | 'test' | 'apps' | 'profile';

interface ClientSidebarProps {
  activeTab: ClientTab;
  setActiveTab: (tab: ClientTab) => void;
  customer: Customer;
  onLogout: () => void;
  accessCount: number;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const ClientSidebar: React.FC<ClientSidebarProps> = ({
  activeTab,
  setActiveTab,
  customer,
  onLogout,
  accessCount,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const menuItems = [
    {
      id: 'accesses' as ClientTab,
      label: 'Meus Acessos & Pontos',
      icon: Tv,
      badge: accessCount > 0 ? `${accessCount}` : undefined,
      desc: 'Telas e aparelhos',
    },
    {
      id: 'renew' as ClientTab,
      label: 'Renovar / Pagar PIX',
      icon: Zap,
      badge: 'Instantâneo',
      badgeColor: 'emerald',
      desc: 'Liberação imediata 24/7',
    },
    {
      id: 'test' as ClientTab,
      label: 'Gerar Teste (1 Hora)',
      icon: Gift,
      badge: 'Grátis',
      badgeColor: 'indigo',
      desc: 'Crie testes com 1 clique',
    },
    {
      id: 'apps' as ClientTab,
      label: 'Aplicativos & DNS',
      icon: Smartphone,
      desc: 'Samsung, LG, Roku, Android',
    },
    {
      id: 'profile' as ClientTab,
      label: 'Meus Dados & Suporte',
      icon: User,
      desc: 'Perfil e ajuda WhatsApp',
    },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-zinc-900 border-r border-zinc-800 select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/20 font-bold">
            <Tv className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-zinc-100 tracking-tight flex items-center gap-1.5">
              PAINEL
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-400 font-semibold border border-indigo-500/20">
                CLIENTE
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 font-medium">Portal do Assinante</p>
          </div>
        </div>
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="md:hidden p-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Quick Test Highlight Banner */}
      <div className="p-3 mx-3 my-2.5 rounded-xl bg-gradient-to-br from-indigo-950/40 via-zinc-900 to-zinc-900 border border-indigo-500/30">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-indigo-400" />
            TESTE RÁPIDO
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
            1 HORA
          </span>
        </div>
        <p className="text-xs text-zinc-300 mb-2 leading-relaxed">
          Gere novos testes para amigos ou clientes instantaneamente.
        </p>
        <button
          onClick={() => {
            setActiveTab('test');
            onCloseMobile?.();
          }}
          className="w-full py-1.5 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
        >
          <Gift className="w-3.5 h-3.5" />
          <span>Gerar Teste 1h</span>
          <ChevronRight className="w-3.5 h-3.5 ml-auto" />
        </button>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Navegação Principal
        </div>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                onCloseMobile?.();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all text-left group relative ${
                isActive
                  ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-transparent'
              }`}
            >
              <div
                className={`p-1.5 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 group-hover:text-zinc-200 group-hover:bg-zinc-750'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`truncate font-semibold ${isActive ? 'text-zinc-100' : 'text-zinc-300'}`}>
                    {item.label}
                  </span>
                  {item.badge && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                        item.badgeColor === 'emerald'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : item.badgeColor === 'indigo'
                          ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                          : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-zinc-500 truncate block mt-0.5">{item.desc}</span>
              </div>
            </button>
          );
        })}
      </nav>

      {/* User Footer Profile */}
      <div className="p-3 border-t border-zinc-800 bg-zinc-950/60">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 font-bold text-xs uppercase shrink-0">
              {customer.name?.charAt(0) || 'U'}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-zinc-200 truncate">{customer.name}</div>
              <div className="text-[10px] text-zinc-500 font-mono truncate">
                Usuário: {customer.iptvUsername}
              </div>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
            title="Sair do Portal"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="w-64 bg-zinc-900 border-r border-zinc-800 hidden md:flex flex-col h-full shrink-0 select-none">
        {sidebarContent}
      </aside>

      {isMobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={onCloseMobile}
          />
          <div className="relative w-72 h-full shadow-2xl z-10">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
