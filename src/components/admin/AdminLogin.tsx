import React, { useState } from 'react';
import {
  Tv,
  ShieldCheck,
  Lock,
  Mail,
  RefreshCw,
  ArrowRight,
  Sparkles,
  Gift,
  Shield,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { ClientTestGeneratorView } from '../client/ClientTestGeneratorView';

export const AdminLogin: React.FC = () => {
  const { loginAdmin, setPortal } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const admin = await api.adminLogin(email, password);
      loginAdmin(admin);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Credenciais administrativas incorretas.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-center items-center p-4 relative selection:bg-indigo-600 selection:text-white">
      {/* Subtle background ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-64 h-64 bg-emerald-600/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl space-y-6 relative z-10">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 border border-indigo-500/30">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-xl font-bold text-zinc-100 tracking-tight">
                Painel Administrativo
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                PRO
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Gestão centralizada de assinantes.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="text-zinc-300 font-medium block">
              E-mail do Administrador
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-xs font-medium focus:border-indigo-500 focus:outline-none placeholder-zinc-600 transition-colors"
                placeholder="Digite seu e-mail"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-zinc-300 font-medium block">
              Senha de Acesso
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-xs font-medium focus:border-indigo-500 focus:outline-none placeholder-zinc-600 transition-colors"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/25 hover:shadow-indigo-600/40"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Autenticando Gestor...</span>
              </>
            ) : (
              <>
                <Shield className="w-4 h-4" />
                <span>Acessar Painel Administrativo</span>
              </>
            )}
          </button>
        </form>

        {/* Quick Test Generator Shortcut */}
        <div className="pt-4 border-t border-zinc-800 space-y-2">
          <div className="text-[11px] text-zinc-400 text-center">
            Precisa emitir um teste IPTV rápido sem logar?
          </div>
          <button
            type="button"
            onClick={() => setShowTestModal(true)}
            className="w-full py-2.5 px-4 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-indigo-300 hover:text-indigo-200 border border-indigo-500/30 text-xs font-semibold flex items-center justify-center gap-2 transition-all"
          >
            <Gift className="w-4 h-4 text-indigo-400" />
            <span>Gerar Teste Grátis de 1 Hora</span>
            <Sparkles className="w-3.5 h-3.5 text-amber-400 ml-auto" />
          </button>
        </div>

        {/* Switch to Client Portal */}
        <div className="text-center pt-2">
          <button
            onClick={() => setPortal('CLIENT')}
            className="text-xs text-zinc-400 hover:text-zinc-200 font-medium inline-flex items-center gap-1.5 transition-colors"
          >
            <Tv className="w-3.5 h-3.5 text-indigo-400" />
            <span>Ir para o Portal do Assinante (Cliente)</span>
            <ArrowRight className="w-3 h-3 text-zinc-500" />
          </button>
        </div>
      </div>

      {/* System Badge */}
      <div className="mt-6 flex items-center gap-3 text-[11px] text-zinc-500 font-mono">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Playwright Server Active
        </span>
        <span>•</span>
        <span>PAINEL v2.4</span>
      </div>

      {/* Test Generator Modal */}
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
    </div>
  );
};
