import React, { useState } from 'react';
import {
  Tv,
  Key,
  User,
  Copy,
  Check,
  Calendar,
  Clock,
  Sparkles,
  Zap,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Play,
  Eye,
  EyeOff,
  Radio,
  CheckCircle2,
} from 'lucide-react';
import { Customer, IptvAccess, Plan } from '../../types';
import { copyToClipboard as safeCopy } from '../../utils/clipboard';
import { api } from '../../lib/api';

interface ClientAccessesViewProps {
  customer: Customer;
  accesses: IptvAccess[];
  plans: Plan[];
  onRenewAccess: (access: IptvAccess) => void;
  onRefresh: () => void;
}

export const ClientAccessesView: React.FC<ClientAccessesViewProps> = ({
  customer,
  accesses,
  plans,
  onRenewAccess,
  onRefresh,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<{ [id: string]: boolean }>({});
  const [macInput, setMacInput] = useState('');
  const [selectedAccessForMac, setSelectedAccessForMac] = useState(accesses[0]?.id || '');
  const [activatingMac, setActivatingMac] = useState(false);
  const [macSuccessMsg, setMacSuccessMsg] = useState<string | null>(null);
  const [macErrorMsg, setMacErrorMsg] = useState<string | null>(null);

  const copyToClipboard = async (text: string, key: string) => {
    await safeCopy(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getStatusBadge = (status: string, expirationDate?: string) => {
    const s = (status || '').toUpperCase();
    if (s === 'ACTIVE') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Ativo
        </span>
      );
    }
    if (s === 'EXPIRING') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          <Clock className="w-3.5 h-3.5" />
          Vencendo
        </span>
      );
    }
    if (s === 'EXPIRED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
          <AlertTriangle className="w-3.5 h-3.5" />
          Expirado
        </span>
      );
    }
    if (s === 'TEST') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30">
          <Sparkles className="w-3.5 h-3.5" />
          Teste Grátis
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700">
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Banner / Welcome Info */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-zinc-900 via-zinc-900 to-indigo-950/40 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              CLIENTE
            </span>
            <h2 className="text-lg font-bold text-zinc-100">
              Bem-vindo(a), {customer.name}!
            </h2>
          </div>
          <p className="text-xs text-zinc-400">
            Abaixo estão seus pontos e telas de IPTV contratados com login, senha e validade.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onRefresh}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 text-xs font-medium border border-zinc-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Prime TV MAC Activation Card */}
      {accesses.length > 0 && (
        <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-xl space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-600/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-100">
                Ativar Endereço MAC (Aplicativo Prime TV)
              </h3>
              <p className="text-xs text-zinc-400">
                Digite o endereço MAC que aparece na tela do aplicativo Prime TV para liberar o acesso instantaneamente.
              </p>
            </div>
          </div>

          {macSuccessMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{macSuccessMsg}</span>
            </div>
          )}

          {macErrorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{macErrorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="space-y-1">
              <label className="text-zinc-400 font-medium block">Selecione o Ponto IPTV</label>
              <select
                value={selectedAccessForMac}
                onChange={(e) => setSelectedAccessForMac(e.target.value)}
                className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-xs focus:border-cyan-500 focus:outline-none"
              >
                {accesses.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name || 'Ponto'} ({acc.iptvUsername})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-zinc-400 font-medium block">Endereço MAC da TV</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={17}
                  placeholder="00:00:00:00:00:00"
                  value={macInput}
                  onChange={(e) => {
                    let value = e.target.value.replace(/[^a-zA-Z0-9]/g, '');
                    if (value.length > 12) value = value.slice(0, 12);
                    const formatted = value.match(/.{1,2}/g)?.join(':') || value;
                    setMacInput(formatted);
                  }}
                  className="flex-1 px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-xs font-mono placeholder-zinc-600 focus:border-cyan-500 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={activatingMac || !macInput.trim()}
                  onClick={async () => {
                    setActivatingMac(true);
                    setMacSuccessMsg(null);
                    setMacErrorMsg(null);
                    try {
                      const targetAcc = accesses.find((a) => a.id === selectedAccessForMac) || accesses[0];
                      if (!targetAcc) throw new Error('Selecione um acesso IPTV.');
                      const res = await api.activateClientMac(targetAcc.iptvUsername, macInput.trim());
                      setMacSuccessMsg(res.message || 'MAC ativado com sucesso!');
                      setMacInput('');
                    } catch (err: unknown) {
                      const msg = err instanceof Error ? err.message : String(err);
                      setMacErrorMsg(msg || 'Erro ao ativar MAC');
                    } finally {
                      setActivatingMac(false);
                    }
                  }}
                  className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-zinc-950 font-bold rounded-xl transition-all disabled:opacity-50 shrink-0 flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${activatingMac ? 'animate-spin' : ''}`} />
                  <span>{activatingMac ? 'Ativando...' : 'Ativar MAC'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Access Cards List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
            <Tv className="w-4 h-4 text-indigo-400" />
            <span>Seus Acessos ({accesses.length})</span>
          </h3>
          <span className="text-xs text-zinc-500">
            Renove antes do vencimento para evitar interrupções
          </span>
        </div>

        {accesses.length === 0 ? (
          <div className="p-12 rounded-2xl bg-zinc-900 border border-zinc-800 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-zinc-800 text-zinc-500 flex items-center justify-center mx-auto">
              <Tv className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-300">Nenhum ponto IPTV ativo</p>
              <p className="text-xs text-zinc-500 mt-1">
                Gere um teste gratuito ou solicite a ativação do seu primeiro plano.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {(accesses || []).map((acc) => {
              const isPasswordVisible = visiblePasswords[acc.id] || false;
              const serverHost = acc.iptvUrl || 'http://anverif.top';
              const m3uUrl = `${serverHost}/get.php?username=${acc.iptvUsername}&password=${acc.iptvPassword || ''}&type=m3u_plus&output=ts`;

              return (
                <div
                  key={acc.id}
                  className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700/80 transition-all shadow-lg space-y-5"
                >
                  {/* Card Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800/80">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-600/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
                        <Tv className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-zinc-100">
                            {acc.name || 'Ponto de Acesso IPTV'}
                          </h4>
                          {acc.isTrial && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                              TESTE 1H
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          {acc.planName ? `Plano ${acc.planName}` : 'Acesso Padrão'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {getStatusBadge(acc.status, acc.expirationDate)}

                      <button
                        onClick={() => onRenewAccess(acc)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20"
                      >
                        <Zap className="w-3.5 h-3.5 fill-current" />
                        <span>Renovar via PIX</span>
                      </button>
                    </div>
                  </div>

                  {/* Credentials Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {/* Username */}
                    <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800/80 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">
                          Usuário IPTV
                        </span>
                        <span className="text-xs font-mono font-bold text-zinc-100 truncate block mt-0.5">
                          {acc.iptvUsername}
                        </span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(acc.iptvUsername, `user-${acc.id}`)}
                        className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors"
                        title="Copiar Usuário"
                      >
                        {copiedKey === `user-${acc.id}` ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    {/* Password */}
                    <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800/80 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">
                          Senha IPTV
                        </span>
                        <span className="text-xs font-mono font-bold text-zinc-100 truncate block mt-0.5">
                          {isPasswordVisible ? acc.iptvPassword || '••••••••' : '••••••••'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => togglePasswordVisibility(acc.id)}
                          className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors"
                          title={isPasswordVisible ? 'Ocultar' : 'Ver Senha'}
                        >
                          {isPasswordVisible ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                        {acc.iptvPassword && (
                          <button
                            onClick={() => copyToClipboard(acc.iptvPassword!, `pass-${acc.id}`)}
                            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors"
                            title="Copiar Senha"
                          >
                            {copiedKey === `pass-${acc.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expiration */}
                    <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800/80 flex items-center justify-between gap-2 sm:col-span-2 lg:col-span-1">
                      <div className="min-w-0">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">
                          Vencimento
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Calendar className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span className="text-xs font-mono font-bold text-zinc-100 truncate">
                            {acc.expirationDate || 'Não informado'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Fast Links & Actions Footer */}
                  <div className="pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => copyToClipboard(serverHost, `dns-${acc.id}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 border border-zinc-750 transition-colors text-[11px]"
                      >
                        <Radio className="w-3 h-3 text-indigo-400" />
                        <span>Copiar DNS: {serverHost.replace('http://', '').replace('https://', '')}</span>
                        {copiedKey === `dns-${acc.id}` ? (
                          <Check className="w-3 h-3 text-emerald-400 ml-1" />
                        ) : (
                          <Copy className="w-3 h-3 text-zinc-500 ml-1" />
                        )}
                      </button>

                      <button
                        onClick={() => copyToClipboard(m3uUrl, `m3u-${acc.id}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 border border-zinc-750 transition-colors text-[11px]"
                      >
                        <Copy className="w-3 h-3 text-zinc-400" />
                        <span>Copiar Link M3U</span>
                        {copiedKey === `m3u-${acc.id}` && (
                          <Check className="w-3 h-3 text-emerald-400 ml-1" />
                        )}
                      </button>
                    </div>

                    <a
                      href="http://navegauni.top/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 transition-colors font-medium text-[11px]"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Abrir Web Player Online</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
