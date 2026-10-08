import React, { useState } from 'react';
import {
  User,
  Key,
  Phone,
  Mail,
  Calendar,
  ShieldCheck,
  Check,
  Receipt,
  MessageSquare,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { Customer, Payment } from '../../types';
import { api } from '../../lib/api';

interface ClientProfileViewProps {
  customer: Customer;
  payments: Payment[];
  onCustomerUpdated: () => void;
}

export const ClientProfileView: React.FC<ClientProfileViewProps> = ({
  customer,
  payments,
  onCustomerUpdated,
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await api.clientChangePassword('', newPassword.trim());
      setSavedSuccess(true);
      setNewPassword('');
      setTimeout(() => setSavedSuccess(false), 3000);
      onCustomerUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg || 'Erro ao atualizar senha.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-zinc-100 tracking-tight flex items-center gap-2">
          <User className="w-5 h-5 text-indigo-500" />
          Meus Dados & Suporte
        </h2>
        <p className="text-xs text-zinc-400">
          Informações cadastrais da sua conta, segurança e histórico de pagamentos.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Customer Info Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-zinc-100">Dados do Assinante</h3>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-850 flex items-center justify-between">
              <span className="text-zinc-400">Nome:</span>
              <strong className="text-zinc-100 font-semibold">{customer.name}</strong>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-850 flex items-center justify-between">
              <span className="text-zinc-400">Usuário Principal:</span>
              <strong className="text-indigo-400 font-mono">{customer.iptvUsername}</strong>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-850 flex items-center justify-between">
              <span className="text-zinc-400">WhatsApp / Telefone:</span>
              <strong className="text-zinc-100">{customer.phone || 'Não informado'}</strong>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-850 flex items-center justify-between">
              <span className="text-zinc-400">E-mail:</span>
              <strong className="text-zinc-100">{customer.email || 'Não informado'}</strong>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-850 flex items-center justify-between">
              <span className="text-zinc-400">Status da Conta:</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                {customer.status || 'ACTIVE'}
              </span>
            </div>
          </div>
        </div>

        {/* Change Portal Password & Support */}
        <div className="space-y-5">
          {/* Change Password Card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
              <Key className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-zinc-100">Alterar Senha do Portal</h3>
            </div>

            {savedSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                <Check className="w-4 h-4" />
                <span>Senha do portal atualizada com sucesso!</span>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleUpdatePassword} className="space-y-3 text-xs">
              <div className="space-y-1.5">
                <label className="text-zinc-300 font-medium">Nova Senha de Acesso ao Portal:</label>
                <input
                  type="text"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Digite sua nova senha"
                  className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={saving || !newPassword}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                {saving ? 'Salvando...' : 'Salvar Nova Senha'}
              </button>
            </form>
          </div>

          {/* WhatsApp Support Box */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3 shadow-xl">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-zinc-100">Suporte e Atendimento</h3>
            </div>
            <p className="text-xs text-zinc-400">
              Precisa de ajuda com configuração em sua TV ou dúvidas sobre seu plano?
            </p>
            <a
              href={`https://wa.me/55${(customer.phone || '47996201025').replace(/\D/g, '')}?text=Olá!+Preciso+de+ajuda+com+minha+assinatura+IPTV.`}
              target="_blank"
              rel="noreferrer"
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-md shadow-emerald-600/20"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Falar no WhatsApp com Suporte</span>
              <ExternalLink className="w-3.5 h-3.5 ml-auto" />
            </a>
          </div>
        </div>
      </div>

      {/* Payment History Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
          <Receipt className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-bold text-zinc-100">Histórico de Pagamentos PIX</h3>
        </div>

        {payments.length === 0 ? (
          <div className="p-6 text-center text-xs text-zinc-500">
            Nenhum pagamento registrado até o momento.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
                <tr>
                  <th className="pb-2.5 pl-2">Data</th>
                  <th className="pb-2.5">Ponto IPTV</th>
                  <th className="pb-2.5">Valor</th>
                  <th className="pb-2.5">Status</th>
                  <th className="pb-2.5 text-right pr-2">ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono">
                {(payments || []).map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-800/40">
                    <td className="py-2.5 pl-2 text-zinc-300">
                      {new Date(p.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-2.5 text-zinc-200 font-sans font-medium">
                      {p.accessName || 'Ponto Principal'}
                    </td>
                    <td className="py-2.5 text-emerald-400 font-bold">
                      R$ {p.amount?.toFixed(2)}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          p.status === 'RENEWED' || p.status === 'APPROVED'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {p.status === 'RENEWED' ? 'Aprovado' : p.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-right pr-2 text-[10px] text-zinc-500">
                      {p.id.slice(0, 8)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
