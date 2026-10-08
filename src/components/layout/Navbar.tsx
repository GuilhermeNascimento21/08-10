import React, { useState, useEffect } from 'react';
import { Tv, ShieldCheck, UserCheck, Bot, RefreshCw, AlertCircle, LogOut, Menu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';

interface NavbarProps {
  onNavigateTab?: (tab: string) => void;
  activeTab?: string;
  onToggleMobileMenu?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onNavigateTab, onToggleMobileMenu }) => {
  const { portal, setPortal, logoutAdmin } = useAuth();
  const [autoStatus, setAutoStatus] = useState<'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'ERROR'>('CONNECTED');
  const [pendingJobsCount, setPendingJobsCount] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchStatus = async () => {
    try {
      const statusRes = await api.getAutomationStatus();
      setAutoStatus(statusRes.status);
      const jobs = await api.getAutomationJobs();
      const pending = jobs.filter((j) => j.status === 'WAITING' || j.status === 'PROCESSING').length;
      setPendingJobsCount(pending);
    } catch {
      // fallback
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchStatus();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-800 bg-zinc-900/90 backdrop-blur-md px-4 lg:px-8 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Brand & Logo - Modern Zinc Dark */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white transition-colors"
            title="Abrir Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="w-9 h-9 bg-indigo-600 border border-indigo-500/40 rounded-xl flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-600/25">
            <Tv className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight text-zinc-100">
                PAINEL <span className="text-indigo-400"></span>
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                ADMIN
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 hidden sm:block">
              Gestão & Automação
            </p>
          </div>
        </div>

        {/* Center/Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Playwright Status Badge */}
          <button
            onClick={() => onNavigateTab && onNavigateTab('automation')}
            title="Clique para abrir status detalhado do Playwright"
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 text-xs text-zinc-300 transition-all shadow-sm"
          >
            <Bot className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden md:inline font-mono text-zinc-400 text-[11px]">Playwright:</span>
            <span className="flex items-center gap-1.5 font-medium text-xs">
              {autoStatus === 'CONNECTED' && (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-emerald-400 font-mono text-[11px]">CONECTADO</span>
                </>
              )}
              {autoStatus === 'CONNECTING' && (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-amber-400 font-mono text-[11px]">CONECTANDO</span>
                </>
              )}
              {autoStatus === 'DISCONNECTED' && (
                <>
                  <span className="w-2 h-2 rounded-full bg-zinc-600" />
                  <span className="text-zinc-400 font-mono text-[11px]">DESCONECTADO</span>
                </>
              )}
              {autoStatus === 'ERROR' && (
                <>
                  <AlertCircle className="w-3 h-3 text-red-400" />
                  <span className="text-red-400 font-mono text-[11px]">ERRO</span>
                </>
              )}
            </span>
            {pendingJobsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
                {pendingJobsCount} na fila
              </span>
            )}
          </button>

          {/* Quick Refresh */}
          <button
            onClick={handleManualRefresh}
            title="Atualizar status"
            className={`p-2 rounded-xl bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-all ${
              isRefreshing ? 'animate-spin text-indigo-400' : ''
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {/* Portal Switcher & Logout */}
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-xl bg-zinc-950 p-1 border border-zinc-800">
              <button
                onClick={() => setPortal('ADMIN')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  portal === 'ADMIN'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Admin</span>
              </button>
              <button
                onClick={() => setPortal('CLIENT')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  portal === 'CLIENT'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Portal Assinante</span>
              </button>
            </div>

            {portal === 'ADMIN' && (
              <button
                onClick={logoutAdmin}
                title="Sair do Painel Admin"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-950 hover:bg-red-500/10 border border-zinc-800 hover:border-red-500/30 text-xs font-medium text-zinc-400 hover:text-red-400 transition-all"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sair</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
