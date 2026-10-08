import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  MessageSquare,
  Copy,
  Check,
  Save,
  CheckCircle2,
  RefreshCw,
  Bot,
  Sliders,
  Server,
  Radio,
  Clock,
  ExternalLink,
  Mail,
  Send,
  Bell,
  ShieldCheck,
  KeyRound,
  LogIn,
  Shield,
  Activity,
} from 'lucide-react';
import { SystemConfig } from '../../types';
import { api } from '../../lib/api';

export const SettingsView: React.FC = () => {
  const [settings, setSettings] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);
  const [refreshingSession, setRefreshingSession] = useState(false);
  const [autoLoggingIn, setAutoLoggingIn] = useState(false);
  const [savingVault, setSavingVault] = useState(false);
  const [vaultStatus, setVaultStatus] = useState<any>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // SMTP Test State
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Expiration Trigger State
  const [triggeringEmails, setTriggeringEmails] = useState(false);

  // Port 80 Diagnostics State
  const [testingPort, setTestingPort] = useState(false);
  const [portDiagResult, setPortDiagResult] = useState<any>(null);

  const handleTestPort80 = async () => {
    try {
      setTestingPort(true);
      const res = await api.checkPortDiagnostic(80);
      setPortDiagResult(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPortDiagResult({
        success: false,
        diagnostic: {
          available: false,
          canBind: false,
          error: msg,
          recommendations: ['Não foi possível executar o teste da porta.'],
        },
      });
    } finally {
      setTestingPort(false);
    }
  };

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const [res, vStatus] = await Promise.all([
        api.getConfig(),
        api.getVaultStatus().catch(() => null),
      ]);
      setSettings(res);
      if (vStatus) setVaultStatus(vStatus);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    try {
      setSaving(true);
      const updated = await api.updateConfig(settings);
      setSettings(updated);
      showToast('Configurações salvas e gravadas no sistema!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Erro ao salvar: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveVault = async () => {
    try {
      setSavingVault(true);
      const res = await api.saveVaultNow();
      showToast(res.message);
      const updatedVault = await api.getVaultStatus().catch(() => null);
      if (updatedVault) setVaultStatus(updatedVault);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Erro ao gravar Vault: ${msg}`);
    } finally {
      setSavingVault(false);
    }
  };

  const handleSyncNow = async () => {
    try {
      setSyncingNow(true);
      const res = await api.syncIptv();
      showToast(
        `Sincronização concluída! ${res.found} usuários verificados (${res.created} novos, ${res.updated} atualizados)`
      );
      await fetchSettings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Erro na sincronização: ${msg}`);
    } finally {
      setSyncingNow(false);
    }
  };

  const handleKeepAliveNow = async () => {
    try {
      setRefreshingSession(true);
      const res = await api.keepAliveNow();
      if (res.success) {
        showToast(res.message || 'Sessão do painel IPTV verificada e mantida ativa sem deslogar!');
      } else {
        showToast(`Aviso: ${res.message}`);
      }
      await fetchSettings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Erro ao verificar sessão: ${msg}`);
    } finally {
      setRefreshingSession(false);
    }
  };

  const handleAutoLoginNow = async () => {
    try {
      setAutoLoggingIn(true);
      const res = await api.autoLoginNow();
      if (res.success) {
        showToast(res.message || 'Auto-login efetuado com sucesso!');
      } else {
        showToast(`Aviso: ${res.message}`);
      }
      await fetchSettings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Erro no auto-login: ${msg}`);
    } finally {
      setAutoLoggingIn(false);
    }
  };

  const webhookUrl = `${window.location.origin}/api/webhook/mercadopago`;

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  const handleTestSmtp = async () => {
    if (!testEmailAddress || !testEmailAddress.includes('@')) {
      alert('Informe um e-mail de destino válido para o envio do teste.');
      return;
    }
    try {
      setTestingSmtp(true);
      setSmtpTestResult(null);
      const res = await api.testSmtp(testEmailAddress, settings || undefined);
      setSmtpTestResult(res);
      if (res.success) {
        showToast('E-mail de teste enviado com sucesso!');
      } else {
        showToast(`Falha no teste: ${res.message}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSmtpTestResult({ success: false, message: msg });
      showToast(`Erro ao testar: ${msg}`);
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleTriggerExpirationCheck = async () => {
    try {
      setTriggeringEmails(true);
      const res = await api.triggerExpirationEmails();
      showToast(res.message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Erro ao disparar: ${msg}`);
    } finally {
      setTriggeringEmails(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="p-8 text-center text-zinc-500 animate-pulse text-xs font-medium">
        Carregando configurações...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Toast */}
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
            <Sliders className="w-5 h-5 text-zinc-400" />
            <span>Configurações do Sistema</span>
          </h1>
          <p className="text-xs text-zinc-400">
            Parâmetros do gateway Mercado Pago, automação Playwright, sincronização contínua e links do servidor.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold rounded-lg shadow-sm transition-all disabled:opacity-50"
        >
          {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          <span>{saving ? 'Salvando...' : 'Salvar Alterações'}</span>
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {/* Section: Sincronização Automática com o Painel IPTV */}
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-zinc-200">
              <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
              <h3 className="text-xs font-semibold text-zinc-100">
                Sincronização Automática com o Painel IPTV
              </h3>
            </div>
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={syncingNow}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingNow ? 'animate-spin' : ''}`} />
              <span>{syncingNow ? 'Sincronizando...' : 'Sincronizar Agora'}</span>
            </button>
          </div>
          <p className="text-xs text-zinc-400">
            Mantém as datas de vencimento, status e contas de clientes sempre atualizados automaticamente em tempo real sem intervenção manual.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-2">
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="autoSyncEnabledCheck"
                  checked={settings.autoSyncEnabled !== false}
                  onChange={(e) =>
                    setSettings({ ...settings, autoSyncEnabled: e.target.checked })
                  }
                  className="rounded border-zinc-800 bg-zinc-950 text-emerald-600 focus:ring-0"
                />
                <label htmlFor="autoSyncEnabledCheck" className="text-zinc-200 font-medium cursor-pointer">
                  Ativar Sincronização Automática Contínua
                </label>
              </div>
              <span className="text-[11px] text-zinc-400 block pl-5">
                Executa em segundo plano a leitura do painel IPTV e sincroniza os dados locais.
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-zinc-300 font-medium flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                <span>Intervalo da Sincronização Automática</span>
              </label>
              <select
                value={settings.autoSyncIntervalMinutes || 5}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    autoSyncIntervalMinutes: parseInt(e.target.value, 10),
                  })
                }
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 text-xs focus:border-zinc-600 focus:outline-none"
              >
                <option value={3}>A cada 3 minutos (Alta frequência)</option>
                <option value={5}>A cada 5 minutos (Recomendado)</option>
                <option value={10}>A cada 10 minutos</option>
                <option value={15}>A cada 15 minutos</option>
                <option value={30}>A cada 30 minutos</option>
                <option value={60}>A cada 1 hora</option>
              </select>
            </div>
          </div>

          {/* Status da última sincronização */}
          {(settings.lastAutoSyncAt || settings.lastAutoSyncResult) && (
            <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-850 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-zinc-300">
                  Última sincronização:{' '}
                  <strong className="text-zinc-100">
                    {(() => {
                      try {
                        const d = settings.lastAutoSyncAt ? new Date(settings.lastAutoSyncAt) : null;
                        return d && !isNaN(d.getTime()) ? d.toLocaleString('pt-BR') : 'Nenhuma ainda';
                      } catch {
                        return 'Nenhuma ainda';
                      }
                    })()}
                  </strong>
                </span>
              </div>
              {settings.lastAutoSyncResult && (
                <span className="text-zinc-400 font-mono text-[10px] bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                  {settings.lastAutoSyncResult}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Section 1: Mercado Pago Official Gateway */}
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-4">
          <div className="flex items-center gap-2 text-zinc-200">
            <CreditCard className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-semibold text-zinc-100">
              Gateway de Pagamento Mercado Pago
            </h3>
          </div>
          <p className="text-xs text-zinc-400">
            Credenciais oficiais para geração instantânea de chave PIX e QR Code dinâmico.
          </p>

          <div className="space-y-3.5 text-xs">
            <div className="space-y-1">
              <label className="text-zinc-300 font-medium">Access Token (Produção ou Teste) *</label>
              <input
                type="password"
                required
                value={settings.mercadoPagoAccessToken}
                onChange={(e) =>
                  setSettings({ ...settings, mercadoPagoAccessToken: e.target.value })
                }
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono text-xs focus:border-zinc-600 focus:outline-none"
                placeholder="APP_USR-xxxxxx..."
              />
              <span className="text-[11px] text-zinc-500">
                Obtenha em Mercado Pago Developers &gt; Minhas Aplicações &gt; Credenciais.
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-zinc-300 font-medium">Public Key (Opcional)</label>
              <input
                type="text"
                value={settings.mercadoPagoPublicKey || ''}
                onChange={(e) =>
                  setSettings({ ...settings, mercadoPagoPublicKey: e.target.value })
                }
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono text-xs focus:border-zinc-600 focus:outline-none"
                placeholder="APP_USR-xxxxxx..."
              />
            </div>

            {/* Webhook Endpoint Box */}
            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-850 space-y-2">
              <label className="text-zinc-300 font-medium block text-xs">
                URL do Webhook Mercado Pago (Notificação IPN):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={webhookUrl}
                  className="flex-1 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-emerald-400 font-mono text-xs select-all"
                />
                <button
                  type="button"
                  onClick={handleCopyWebhook}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 border border-zinc-700 rounded-lg flex items-center gap-1.5 font-medium text-xs transition-colors"
                >
                  {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedWebhook ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
              <p className="text-[11px] text-zinc-400">
                Cadastre este endpoint no Mercado Pago para confirmação de pagamento instantânea e disparo da renovação sem intervenção manual.
              </p>
            </div>
          </div>
        </div>

        {/* Section: Anti-Inatividade & Auto-Login do Painel IPTV */}
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-zinc-200">
              <Shield className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-semibold text-zinc-100">
                Manutenção de Sessão & Vault Anti-Queda do Painel IPTV
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleKeepAliveNow}
                disabled={refreshingSession}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                title="Verifica a sessão ativa e atualiza o Vault sem recarregar o navegador ou perder login"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshingSession ? 'animate-spin' : ''}`} />
                <span>{refreshingSession ? 'Verificando...' : 'Verificar Sessão (Sem F5)'}</span>
              </button>

              <button
                type="button"
                onClick={handleSaveVault}
                disabled={savingVault}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                title="Grava o snapshot completo da sessão ativa e cookies no disco para persistência permanente"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingVault ? 'Gravando...' : 'Gravar no Vault'}</span>
              </button>

              <button
                type="button"
                onClick={handleAutoLoginNow}
                disabled={autoLoggingIn || !settings.iptvPanelUsername || !settings.iptvPanelPassword}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                title="Executa o login no painel IPTV com as credenciais salvas"
              >
                <LogIn className={`w-3.5 h-3.5 ${autoLoggingIn ? 'animate-pulse' : ''}`} />
                <span>{autoLoggingIn ? 'Autenticando...' : 'Testar Auto-Login'}</span>
              </button>
            </div>
          </div>

          <p className="text-xs text-zinc-400">
            Proteção contínua contra quedas: o robô mantém o navegador aberto permanentemente sem desligar, armazena a sessão autenticada em um <strong>Vault protegido</strong> (imunizando o painel contra perdas de login em recarregamentos/F5) e efetua login automático com preenchimento contínuo de credenciais.
          </p>

          {/* Status do Vault de Sessão */}
          <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-850 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className={`w-4 h-4 ${vaultStatus?.hasAuthToken ? 'text-emerald-400' : 'text-amber-400'}`} />
              <div>
                <span className="text-zinc-200 font-medium">Status do Vault de Sessão Permanente: </span>
                <span className={vaultStatus?.hasAuthToken ? 'text-emerald-400 font-semibold' : 'text-amber-400'}>
                  {vaultStatus?.hasAuthToken
                    ? 'Sessão Autenticada e Protegida contra F5'
                    : vaultStatus?.exists
                    ? 'Vault Gravado (Aguardando Conclusão do Login)'
                    : 'Aguardando Primeiro Login'}
                </span>
                {vaultStatus?.savedAt && (() => {
                  try {
                    const d = new Date(vaultStatus.savedAt);
                    return !isNaN(d.getTime()) ? (
                      <span className="text-[11px] text-zinc-500 block">
                        Última sincronização do Vault: {d.toLocaleString('pt-BR')} ({vaultStatus.storageKeyCount || 0} chaves, {vaultStatus.cookieCount || 0} cookies)
                      </span>
                    ) : null;
                  } catch {
                    return null;
                  }
                })()}
              </div>
            </div>
            <button
              type="button"
              onClick={handleSaveVault}
              disabled={savingVault}
              className="text-[11px] px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 font-medium"
            >
              Atualizar Snapshot
            </button>
          </div>

          <div className="space-y-3.5 text-xs">
            {/* Credenciais para Auto-Login */}
            <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-850 space-y-3">
              <div className="flex items-center gap-2 text-zinc-200 font-medium">
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                <span>Credenciais de Acesso do Painel IPTV (Captura e Preenchimento Automático)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-zinc-300 font-medium">Usuário / Login do Painel IPTV</label>
                  <input
                    type="text"
                    value={settings.iptvPanelUsername || ''}
                    onChange={(e) => setSettings({ ...settings, iptvPanelUsername: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 font-mono text-xs focus:border-zinc-600 focus:outline-none"
                    placeholder="Ex: admin / revenda"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-zinc-300 font-medium">Senha do Painel IPTV</label>
                  <input
                    type="password"
                    value={settings.iptvPanelPassword || ''}
                    onChange={(e) => setSettings({ ...settings, iptvPanelPassword: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 font-mono text-xs focus:border-zinc-600 focus:outline-none"
                    placeholder="••••••••••••"
                  />
                </div>
              </div>
            </div>

            {/* Checkboxes de Ativação */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="autoKeepAliveCheck"
                    checked={settings.iptvAutoKeepAlive !== false}
                    onChange={(e) =>
                      setSettings({ ...settings, iptvAutoKeepAlive: e.target.checked })
                    }
                    className="rounded border-zinc-800 bg-zinc-950 text-emerald-600 focus:ring-0"
                  />
                  <label htmlFor="autoKeepAliveCheck" className="text-zinc-200 font-medium cursor-pointer">
                    Manter Painel Ativo Permanentemente (Proteção Contínua)
                  </label>
                </div>
                <span className="text-[11px] text-zinc-400 block pl-5">
                  Verifica a sessão periodicamente sem recarregar a tela, evitando desconexões e mantendo o navegador sempre em execução.
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-zinc-300 font-medium flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Intervalo de Verificação da Sessão</span>
                </label>
                <select
                  value={settings.iptvKeepAliveIntervalMinutes || 3}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      iptvKeepAliveIntervalMinutes: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 text-xs focus:border-zinc-600 focus:outline-none"
                >
                  <option value={2}>A cada 2 minutos (Altamente recomendado)</option>
                  <option value={3}>A cada 3 minutos (Recomendado)</option>
                  <option value={5}>A cada 5 minutos</option>
                  <option value={10}>A cada 10 minutos</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="autoLoginEnabledCheck"
                checked={settings.iptvAutoLoginEnabled !== false}
                onChange={(e) =>
                  setSettings({ ...settings, iptvAutoLoginEnabled: e.target.checked })
                }
                className="rounded border-zinc-800 bg-zinc-950 text-emerald-600 focus:ring-0"
              />
              <label htmlFor="autoLoginEnabledCheck" className="text-zinc-200 font-medium cursor-pointer">
                Preencher Credenciais Automaticamente e Manter Janela Aberta para Captcha
              </label>
            </div>

            {/* Status do último Keep-Alive */}
            {(settings.lastIptvKeepAliveAt || settings.lastIptvKeepAliveResult) && (
              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-850 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-zinc-300">
                    Último Keep-Alive:{' '}
                    <strong className="text-zinc-100">
                    {(() => {
                      try {
                        const d = settings.lastIptvKeepAliveAt ? new Date(settings.lastIptvKeepAliveAt) : null;
                        return d && !isNaN(d.getTime()) ? d.toLocaleString('pt-BR') : 'Nenhum ainda';
                      } catch {
                        return 'Nenhum ainda';
                      }
                    })()}
                    </strong>
                  </span>
                </div>
                {settings.lastIptvKeepAliveResult && (
                  <span className="text-zinc-400 font-mono text-[10px] bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                    {settings.lastIptvKeepAliveResult}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Painel IPTV & Playwright Navigation */}
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-4">
          <div className="flex items-center gap-2 text-zinc-200">
            <Bot className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-semibold text-zinc-100">
              Automação Playwright & Navegador
            </h3>
          </div>

          <div className="space-y-3.5 text-xs">
            <div className="space-y-1">
              <label className="text-zinc-300 font-medium">URL do Painel IPTV *</label>
              <input
                type="text"
                required
                value={settings.iptvPanelUrl}
                onChange={(e) => setSettings({ ...settings, iptvPanelUrl: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-blue-400 font-mono text-xs focus:border-zinc-600 focus:outline-none"
                placeholder="https://searchdefense.top/#/users-iptv"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-zinc-300 font-medium">Diretório de Perfil do Navegador</label>
                <input
                  type="text"
                  value={settings.iptvProfileDir}
                  onChange={(e) => setSettings({ ...settings, iptvProfileDir: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-300 font-mono text-xs focus:border-zinc-600 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-zinc-300 font-medium">Dias Antes para Alerta</label>
                <input
                  type="number"
                  value={settings.renewalDaysBefore}
                  onChange={(e) =>
                    setSettings({ ...settings, renewalDaysBefore: parseInt(e.target.value, 10) })
                  }
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-300 font-mono text-xs focus:border-zinc-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="autoRenewalCheck"
                checked={settings.autoRenewalEnabled}
                onChange={(e) =>
                  setSettings({ ...settings, autoRenewalEnabled: e.target.checked })
                }
                className="rounded border-zinc-800 bg-zinc-950 text-blue-600 focus:ring-0"
              />
              <label htmlFor="autoRenewalCheck" className="text-zinc-300 font-medium cursor-pointer">
                Habilitar Execução Automática da Fila de Renovação Playwright
              </label>
            </div>
          </div>
        </div>

        {/* Section 3: Links do Servidor, DNS & Aplicativos */}
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-4">
          <div className="flex items-center gap-2 text-zinc-200">
            <Server className="w-4 h-4 text-purple-400" />
            <h3 className="text-xs font-semibold text-zinc-100">
              Servidor IPTV, DNS e Links de Entrega
            </h3>
          </div>
          <p className="text-xs text-zinc-400">
            Configurações de hosts, reprodutores e URLs encurtadas fornecidas aos clientes nos testes e renovações.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="space-y-1">
              <label className="text-zinc-300 font-medium">Servidor Host Padrão</label>
              <input
                type="text"
                value={settings.defaultServerHost || ''}
                onChange={(e) => setSettings({ ...settings, defaultServerHost: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono text-xs focus:border-zinc-600 focus:outline-none"
                placeholder="http://anverif.top"
              />
            </div>

            <div className="space-y-1">
              <label className="text-zinc-300 font-medium">DNS Host Padrão</label>
              <input
                type="text"
                value={settings.defaultDnsHost || ''}
                onChange={(e) => setSettings({ ...settings, defaultDnsHost: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono text-xs focus:border-zinc-600 focus:outline-none"
                placeholder="http://blushes.top"
              />
            </div>

            <div className="space-y-1">
              <label className="text-zinc-300 font-medium">Web Player URL</label>
              <input
                type="text"
                value={settings.webPlayerUrl || ''}
                onChange={(e) => setSettings({ ...settings, webPlayerUrl: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono text-xs focus:border-zinc-600 focus:outline-none"
                placeholder="http://navegauni.top/"
              />
            </div>

            <div className="space-y-1">
              <label className="text-zinc-300 font-medium">Portal do Cliente URL</label>
              <input
                type="text"
                value={settings.clientPortalUrl || ''}
                onChange={(e) => setSettings({ ...settings, clientPortalUrl: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono text-xs focus:border-zinc-600 focus:outline-none"
                placeholder="https://portaltop.net"
              />
            </div>

            <div className="space-y-1">
              <label className="text-zinc-300 font-medium">URL Guia EPG</label>
              <input
                type="text"
                value={settings.epgUrl || ''}
                onChange={(e) => setSettings({ ...settings, epgUrl: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono text-xs focus:border-zinc-600 focus:outline-none"
                placeholder="https://tinyurl.com/uniepg"
              />
            </div>

            <div className="space-y-1">
              <label className="text-zinc-300 font-medium">Link M3U/MPEGTS Encurtado</label>
              <input
                type="text"
                value={settings.shortenedMpegtsUrl || ''}
                onChange={(e) => setSettings({ ...settings, shortenedMpegtsUrl: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono text-xs focus:border-zinc-600 focus:outline-none"
                placeholder="https://tinyurl.com/2yug8eoe"
              />
            </div>
          </div>

          {/* Diagnóstico da Porta 80 & Rede */}
          <div className="pt-3 border-t border-zinc-800/80">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-zinc-950 rounded-xl border border-zinc-800">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-sky-400" />
                  <span className="text-xs font-semibold text-zinc-100">Diagnóstico de Rede & Porta 80</span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Verifique se a porta 80 HTTP está livre ou se está bloqueada por outros serviços (IIS, Apache, Nginx) ou falta de permissão root/admin.
                </p>
              </div>
              <button
                type="button"
                onClick={handleTestPort80}
                disabled={testingPort}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium rounded-lg transition-colors shrink-0 disabled:opacity-50"
              >
                {testingPort ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                <span>{testingPort ? 'Testando...' : 'Diagnosticar Porta 80'}</span>
              </button>
            </div>

            {portDiagResult && (
              <div className={`mt-3 p-3 rounded-xl border text-xs space-y-2 ${
                portDiagResult.diagnostic?.canBind
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold flex items-center gap-1.5">
                    {portDiagResult.diagnostic?.canBind ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Shield className="w-4 h-4 text-rose-400" />
                    )}
                    <span>
                      {portDiagResult.diagnostic?.canBind
                        ? '✅ Porta 80 liberada para vinculação direta (Bind OK)'
                        : '❌ Conflito ou Bloqueio na Porta 80'}
                    </span>
                  </span>
                  <span className="font-mono text-[10px] bg-zinc-900 px-2 py-0.5 rounded text-zinc-300">
                    Porta: {portDiagResult.diagnostic?.port || 80}
                  </span>
                </div>

                {portDiagResult.diagnostic?.occupantProcess && (
                  <p className="text-[11px] text-zinc-300">
                    <strong>Processo Ocupante:</strong> {portDiagResult.diagnostic.occupantProcess}
                  </p>
                )}

                {portDiagResult.diagnostic?.error && (
                  <p className="text-[11px] text-zinc-300 font-mono bg-zinc-950/80 p-2 rounded">
                    {portDiagResult.diagnostic.error}
                  </p>
                )}

                {portDiagResult.diagnostic?.recommendations?.length > 0 && (
                  <div className="space-y-1 pt-1 text-[11px] text-zinc-300">
                    <strong className="text-zinc-100">Orientações:</strong>
                    <ul className="list-disc pl-4 space-y-0.5 text-zinc-400">
                      {portDiagResult.diagnostic.recommendations.map((rec: string, idx: number) => (
                        <li key={idx}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Section 4: WhatsApp Notification Templates */}
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-4">
          <div className="flex items-center gap-2 text-zinc-200">
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-semibold text-zinc-100">
              Modelo de Mensagem de Cobrança WhatsApp
            </h3>
          </div>

          <div className="space-y-2 text-xs">
            <label className="text-zinc-300 font-medium">Texto Padrão de Alerta</label>
            <textarea
              rows={3}
              value={settings.whatsappTemplate}
              onChange={(e) => setSettings({ ...settings, whatsappTemplate: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 focus:border-zinc-600 focus:outline-none leading-relaxed"
            />
            <div className="flex flex-wrap gap-2 text-[11px] text-zinc-400 pt-1">
              <span>Variáveis:</span>
              <code className="text-blue-400 font-mono bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800">
                &#123;nome&#125;
              </code>
              <code className="text-blue-400 font-mono bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800">
                &#123;vencimento&#125;
              </code>
              <code className="text-blue-400 font-mono bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800">
                &#123;dias&#125;
              </code>
              <code className="text-blue-400 font-mono bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800">
                &#123;link&#125;
              </code>
            </div>
          </div>
        </div>

        {/* Section 5: Configurações de E-mail (SMTP) & Notificações Automáticas de Vencimento */}
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-zinc-200">
              <Mail className="w-4 h-4 text-indigo-400" />
              <h3 className="text-xs font-semibold text-zinc-100">
                Servidor de E-mail (SMTP) & Lembretes Automáticos
              </h3>
            </div>
            <button
              type="button"
              onClick={handleTriggerExpirationCheck}
              disabled={triggeringEmails}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-lg text-xs font-medium transition-all disabled:opacity-50 self-start sm:self-auto"
            >
              <Bell className={`w-3.5 h-3.5 ${triggeringEmails ? 'animate-bounce' : ''}`} />
              <span>{triggeringEmails ? 'Verificando Vencimentos...' : 'Disparar Lembretes Agora'}</span>
            </button>
          </div>
          <p className="text-xs text-zinc-400">
            Envia automaticamente as credenciais de teste para o e-mail cadastrado e dispara notificações de vencimento faltando 7 dias, 3 dias e no dia do vencimento com o link de login e pagamento direto (<strong className="text-zinc-300">http://paineltv.ddns.net/</strong>).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <div className="space-y-1">
              <label className="text-zinc-300 font-medium">Servidor SMTP (Host)</label>
              <input
                type="text"
                value={settings.smtpHost || ''}
                onChange={(e) => setSettings({ ...settings, smtpHost: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono text-xs focus:border-zinc-600 focus:outline-none"
                placeholder="smtp.gmail.com"
              />
            </div>

            <div className="space-y-1">
              <label className="text-zinc-300 font-medium">Porta SMTP</label>
              <input
                type="number"
                value={settings.smtpPort || 587}
                onChange={(e) => setSettings({ ...settings, smtpPort: Number(e.target.value) || 587 })}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono text-xs focus:border-zinc-600 focus:outline-none"
                placeholder="587 ou 465"
              />
            </div>

            <div className="space-y-1">
              <label className="text-zinc-300 font-medium">Usuário / E-mail SMTP</label>
              <input
                type="text"
                value={settings.smtpUser || ''}
                onChange={(e) => setSettings({ ...settings, smtpUser: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono text-xs focus:border-zinc-600 focus:outline-none"
                placeholder="seu-email@gmail.com"
              />
            </div>

            <div className="space-y-1">
              <label className="text-zinc-300 font-medium">Senha SMTP / Senha de App</label>
              <input
                type="password"
                value={settings.smtpPass || ''}
                onChange={(e) => setSettings({ ...settings, smtpPass: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono text-xs focus:border-zinc-600 focus:outline-none"
                placeholder="••••••••••••••••"
              />
            </div>

            <div className="space-y-1">
              <label className="text-zinc-300 font-medium">E-mail Remetente (From)</label>
              <input
                type="text"
                value={settings.smtpFrom || ''}
                onChange={(e) => setSettings({ ...settings, smtpFrom: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono text-xs focus:border-zinc-600 focus:outline-none"
                placeholder='"Painel TV" <suporte@paineltv.ddns.net>'
              />
            </div>

            <div className="space-y-1 flex flex-col justify-end pb-1.5">
              <label className="flex items-center gap-2 cursor-pointer text-zinc-300 font-medium">
                <input
                  type="checkbox"
                  checked={settings.smtpSecure === true}
                  onChange={(e) => setSettings({ ...settings, smtpSecure: e.target.checked })}
                  className="rounded bg-zinc-950 border-zinc-800 text-indigo-600 focus:ring-0 focus:ring-offset-0"
                />
                <span>Usar SSL/TLS Seguro (Porta 465)</span>
              </label>
            </div>
          </div>

          {/* Notification Triggers Checkboxes */}
          <div className="pt-2 border-t border-zinc-800/80 space-y-2">
            <div className="text-xs font-semibold text-zinc-300">Regras de Disparo Automático por E-mail:</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <label className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.emailNotifyWelcomeAccount !== false}
                  onChange={(e) => setSettings({ ...settings, emailNotifyWelcomeAccount: e.target.checked })}
                  className="rounded bg-zinc-900 border-zinc-700 text-indigo-600"
                />
                <span className="text-zinc-300">🎉 Boas-vindas ao Criar Login</span>
              </label>

              <label className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.emailNotifyTestCreated !== false}
                  onChange={(e) => setSettings({ ...settings, emailNotifyTestCreated: e.target.checked })}
                  className="rounded bg-zinc-900 border-zinc-700 text-indigo-600"
                />
                <span className="text-zinc-300">📺 Dados do Teste IPTV + Link</span>
              </label>

              <label className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.emailNotify7Days !== false}
                  onChange={(e) => setSettings({ ...settings, emailNotify7Days: e.target.checked })}
                  className="rounded bg-zinc-900 border-zinc-700 text-indigo-600"
                />
                <span className="text-zinc-300">⚠️ Faltando 7 dias</span>
              </label>

              <label className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.emailNotify3Days !== false}
                  onChange={(e) => setSettings({ ...settings, emailNotify3Days: e.target.checked })}
                  className="rounded bg-zinc-900 border-zinc-700 text-indigo-600"
                />
                <span className="text-zinc-300">🚨 Faltando 3 dias</span>
              </label>

              <label className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.emailNotify0Days !== false}
                  onChange={(e) => setSettings({ ...settings, emailNotify0Days: e.target.checked })}
                  className="rounded bg-zinc-900 border-zinc-700 text-indigo-600"
                />
                <span className="text-zinc-300">🔴 Vence Hoje (Dia 0)</span>
              </label>

              <label className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.emailNotifyPaymentApproved !== false}
                  onChange={(e) => setSettings({ ...settings, emailNotifyPaymentApproved: e.target.checked })}
                  className="rounded bg-zinc-900 border-zinc-700 text-indigo-600"
                />
                <span className="text-zinc-300">✅ Confirmação de Renovação / PIX</span>
              </label>
            </div>
          </div>

          {/* Test SMTP Connection Box */}
          <div className="pt-2 border-t border-zinc-800/80 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <input
              type="email"
              value={testEmailAddress}
              onChange={(e) => setTestEmailAddress(e.target.value)}
              placeholder="Digite seu e-mail para testar o envio..."
              className="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 text-xs focus:border-zinc-600 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleTestSmtp}
              disabled={testingSmtp}
              className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {testingSmtp ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>Testar Envio SMTP</span>
            </button>
          </div>

          {smtpTestResult && (
            <div
              className={`p-3 rounded-lg text-xs flex items-center gap-2 border ${
                smtpTestResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/10 border-red-500/20 text-red-400'
              }`}
            >
              {smtpTestResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <ShieldCheck className="w-4 h-4 shrink-0" />}
              <span>{smtpTestResult.message}</span>
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-white text-zinc-950 font-semibold rounded-lg shadow-sm transition-all disabled:opacity-50 text-xs"
          >
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>{saving ? 'Salvando...' : 'Salvar Alterações'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
