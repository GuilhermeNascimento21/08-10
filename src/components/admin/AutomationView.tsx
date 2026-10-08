import React, { useState, useEffect } from 'react';
import {
  Terminal,
  Play,
  RotateCcw,
  Layers,
  Code2,
  RefreshCw,
  Zap,
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Link,
  LogIn,
  Bot,
  ShieldCheck,
} from 'lucide-react';
import { AutomationJob, AutomationLog, Customer, AutomationDiagnostic, SyncResult } from '../../types';
import { api } from '../../lib/api';

export const AutomationView: React.FC = () => {
  const [connectionStatus, setConnectionStatus] = useState<{
    status: string;
    panelUrl: string;
    profileDir: string;
    lastError: string | null;
  }>({
    status: 'DESCONECTADO',
    panelUrl: 'https://searchdefense.top/#/users-iptv',
    profileDir: './backend/data/iptv-browser-profile',
    lastError: null,
  });

  const [diagnostic, setDiagnostic] = useState<AutomationDiagnostic>({
    browserRunning: false,
    contextReady: false,
    pageReady: false,
    pageClosed: true,
    currentUrl: 'N/A',
    title: 'N/A',
    usersFound: 0,
    rowsFound: 0,
    connectionStatus: 'DESCONECTADO',
    profileDirectory: './backend/data/iptv-browser-profile',
    lastError: null,
  });

  const [jobs, setJobs] = useState<AutomationJob[]>([]);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [refreshingSession, setRefreshingSession] = useState(false);
  const [autoLoggingIn, setAutoLoggingIn] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [selectedCustomerForTest, setSelectedCustomerForTest] = useState<string>('');
  const [testDays, setTestDays] = useState<number>(30);
  const [testRunning, setTestRunning] = useState(false);
  const [logFilter, setLogFilter] = useState<string>('ALL');
  const [logSearch, setLogSearch] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null);

  const [savingVault, setSavingVault] = useState(false);
  const [vaultStatus, setVaultStatus] = useState<any>(null);

  const showToast = (text: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 6000);
  };

  const handleKeepAliveNow = async () => {
    try {
      setRefreshingSession(true);
      showToast('Verificando sessão ativa e sincronizando Vault...', 'info');
      const res = await api.keepAliveNow();
      if (res.success) {
        showToast(res.message || 'Sessão do painel IPTV mantida ativa sem deslogar!', 'success');
      } else {
        showToast(`Aviso: ${res.message}`, 'error');
      }
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Erro ao verificar sessão: ${msg}`, 'error');
    } finally {
      setRefreshingSession(false);
    }
  };

  const handleSaveVaultNow = async () => {
    try {
      setSavingVault(true);
      const res = await api.saveVaultNow();
      showToast(res.message || 'Sessão gravada no Vault permanente!', 'success');
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Erro ao gravar Vault: ${msg}`, 'error');
    } finally {
      setSavingVault(false);
    }
  };

  const handleAutoLoginNow = async () => {
    try {
      setAutoLoggingIn(true);
      showToast('Executando tentativa de auto-login no painel IPTV...', 'info');
      const res = await api.autoLoginNow();
      if (res.success) {
        showToast(res.message || 'Auto-login efetuado com sucesso!', 'success');
      } else {
        showToast(`Aviso: ${res.message}`, 'error');
      }
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Erro no auto-login: ${msg}`, 'error');
    } finally {
      setAutoLoggingIn(false);
    }
  };

  const fetchData = async () => {
    try {
      const [status, diag, jobList, logList, custList, vStatus] = await Promise.all([
        api.getAutomationStatus().catch(() => connectionStatus),
        api.getAutomationDiagnostic().catch(() => diagnostic),
        api.getAutomationJobs().catch(() => []),
        api.getAutomationLogs(150).catch(() => []),
        api.getCustomers().catch(() => []),
        api.getVaultStatus().catch(() => null),
      ]);

      if (status) setConnectionStatus(status);
      if (diag) setDiagnostic(diag);
      if (jobList) setJobs(jobList);
      if (logList) setLogs(logList);
      if (vStatus) setVaultStatus(vStatus);
      if (custList) {
        setCustomers(custList);
        if (!selectedCustomerForTest && custList.length > 0) {
          setSelectedCustomerForTest(custList[0].id);
        }
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleConnect = async () => {
    try {
      setConnecting(true);
      showToast('Iniciando navegador persistente Playwright no Windows 11 (headless: false)...', 'info');
      const res = await api.connectAutomation();
      showToast(res.message || 'Navegador persistente conectado com sucesso!', 'success');
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Erro ao conectar ao painel: ${msg}`, 'error');
      alert(`Erro ao conectar ao painel IPTV:\n\n${msg}`);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await api.disconnectAutomation();
      showToast('Sessão desconectada.', 'info');
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Erro ao desconectar: ${msg}`);
    }
  };

  const handleSyncCustomers = async () => {
    try {
      setSyncing(true);
      setSyncError(null);
      showToast('Sincronizando clientes diretamente do DOM da SPA...', 'info');
      const res = await api.syncIptv();
      setSyncResult(res);
      showToast(
        `Sincronização concluída: ${res.found || res.totalFound || 0} encontrados (${res.created || res.importedCount || 0} novos, ${res.updated || res.updatedCount || 0} atualizados)!`,
        'success'
      );
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSyncError(msg);
      showToast(`Erro na sincronização: ${msg}`, 'error');
      alert(`Erro ao sincronizar clientes IPTV:\n\n${msg}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleRetryJob = async (jobId: string) => {
    try {
      await api.retryJob(jobId);
      showToast(`Job reenfileirado para processamento.`, 'info');
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Erro: ${msg}`);
    }
  };

  const handleRunTestRenewal = async () => {
    if (!selectedCustomerForTest) return;
    try {
      setTestRunning(true);
      showToast(`Enviando ordem de renovação (+${testDays} dias) para a fila do Playwright...`, 'info');
      await api.renewCustomerManual(selectedCustomerForTest, testDays);
      showToast(`Renovação adicionada à fila! Acompanhe o progresso nos logs.`, 'success');
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Erro: ${msg}`);
    } finally {
      setTestRunning(false);
    }
  };

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    if (logFilter !== 'ALL' && log.level !== logFilter) return false;
    if (logSearch && !log.message.toLowerCase().includes(logSearch.toLowerCase())) return false;
    return true;
  });

  const isConnected = diagnostic.connectionStatus === 'CONECTADO' || diagnostic.connectionStatus === 'CONNECTED';
  const isAwaitingLogin = diagnostic.connectionStatus === 'AGUARDANDO_LOGIN' || diagnostic.connectionStatus === 'WAITING_LOGIN';
  const isConnecting = diagnostic.connectionStatus === 'CONECTANDO' || diagnostic.connectionStatus === 'CONNECTING';
  const isError = diagnostic.connectionStatus === 'ERRO' || diagnostic.connectionStatus === 'ERROR';

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`p-3 text-zinc-100 text-xs font-medium rounded-xl shadow-xl flex items-center justify-between animate-in fade-in ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 border border-emerald-500/40 text-emerald-200'
              : toastMessage.type === 'error'
              ? 'bg-red-950/90 border border-red-500/40 text-red-200'
              : 'bg-zinc-900 border border-zinc-700'
          }`}
        >
          <span>{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="text-zinc-400 hover:text-zinc-100 ml-3">
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
              <Bot className="w-5 h-5 text-zinc-400" />
              <span>Automação Playwright IPTV</span>
            </h1>
            {/* Real Status Badge */}
            {isConnected ? (
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                CONECTADO & AUTENTICADO
              </span>
            ) : isAwaitingLogin ? (
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
                <LogIn className="w-3 h-3" />
                AGUARDANDO LOGIN NO NAVEGADOR
              </span>
            ) : isConnecting ? (
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/30 flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3 animate-spin" />
                CONECTANDO...
              </span>
            ) : isError ? (
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/30 flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3" />
                ERRO DE CONEXÃO
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
                DESCONECTADO
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400">
            Sessão persistente do Chromium (Windows 11 / Headless: false), perfil isolado e sincronização DOM real.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {diagnostic.browserRunning && (
            <>
              <button
                onClick={handleKeepAliveNow}
                disabled={refreshingSession}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                title="Verifica a sessão ativa continuamente e protege a autenticação sem recarregar o navegador ou perder login"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshingSession ? 'animate-spin' : ''}`} />
                <span>{refreshingSession ? 'Verificando...' : 'Verificar Sessão (Sem F5)'}</span>
              </button>

              <button
                onClick={handleSaveVaultNow}
                disabled={savingVault}
                className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                title="Salva o snapshot completo da sessão ativa e tokens no Vault permanente"
              >
                <span>{savingVault ? 'Gravando...' : 'Gravar no Vault'}</span>
              </button>

              <button
                onClick={handleAutoLoginNow}
                disabled={autoLoggingIn}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                title="Preenche as credenciais salvas no formulário de login"
              >
                <LogIn className={`w-3.5 h-3.5 ${autoLoggingIn ? 'animate-pulse' : ''}`} />
                <span>{autoLoggingIn ? 'Autenticando...' : 'Auto-Login'}</span>
              </button>
            </>
          )}

          <button
            onClick={handleSyncCustomers}
            disabled={syncing}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-900 hover:bg-zinc-850 text-zinc-300 text-xs font-medium rounded-lg border border-zinc-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-blue-400' : 'text-zinc-400'}`} />
            <span>{syncing ? 'Sincronizando DOM...' : 'Sincronizar Clientes'}</span>
          </button>

          {diagnostic.browserRunning ? (
            <button
              onClick={handleDisconnect}
              className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-850 text-zinc-300 text-xs font-medium rounded-lg border border-zinc-800 transition-colors"
            >
              Desconectar Sessão
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold rounded-lg shadow-sm transition-all disabled:opacity-50"
            >
              <Link className={`w-3.5 h-3.5 ${connecting ? 'animate-spin' : ''}`} />
              <span>{connecting ? 'Iniciando Navegador...' : 'Conectar ao Painel IPTV'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Login Warning Banner if waiting for login */}
      {isAwaitingLogin && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-start gap-3">
            <LogIn className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="block text-amber-300 font-semibold text-xs">
                Ação Necessária: Sessão desconectada ou aguardando autenticação no Painel IPTV
              </strong>
              <p className="text-zinc-300 text-[11px] leading-relaxed">
                Você pode clicar no botão <strong>"Executar Auto-Login"</strong> para autenticar com suas credenciais salvas, ou entrar manualmente na janela do navegador.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAutoLoginNow}
            disabled={autoLoggingIn}
            className="shrink-0 px-3.5 py-1.5 bg-amber-500 text-zinc-950 font-semibold text-xs rounded-lg hover:bg-amber-400 transition-all flex items-center gap-1.5"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>{autoLoggingIn ? 'Autenticando...' : 'Executar Auto-Login Agora'}</span>
          </button>
        </div>
      )}

      {/* Sync Error Alert Banner */}
      {syncError && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs space-y-2 animate-in fade-in">
          <div className="flex items-center justify-between font-semibold">
            <span className="flex items-center gap-2 text-red-400">
              <XCircle className="w-4 h-4 text-red-400" />
              Erro ao sincronizar clientes IPTV:
            </span>
            <button onClick={() => setSyncError(null)} className="text-red-400 hover:underline text-[11px]">
              Fechar
            </button>
          </div>
          <p className="text-zinc-300 text-[11px] font-mono whitespace-pre-wrap bg-zinc-950 p-2.5 rounded border border-red-500/20">
            {syncError}
          </p>
        </div>
      )}

      {/* Sync Result Alert Banner if just synced */}
      {syncResult && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs space-y-2 animate-in fade-in">
          <div className="flex items-center justify-between font-semibold">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Resultado da Sincronização com o Painel IPTV:
            </span>
            <button onClick={() => setSyncResult(null)} className="text-emerald-400 hover:underline text-[11px]">
              Fechar
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
            <div className="p-2 rounded bg-zinc-950 border border-emerald-500/20">
              <span className="text-zinc-400 block text-[10px]">Total Encontrados:</span>
              <strong className="text-zinc-100 text-sm">{syncResult.found || syncResult.totalFound || 0}</strong>
            </div>
            <div className="p-2 rounded bg-zinc-950 border border-emerald-500/20">
              <span className="text-zinc-400 block text-[10px]">Novos Criados:</span>
              <strong className="text-emerald-400 text-sm">{syncResult.created || syncResult.importedCount || 0}</strong>
            </div>
            <div className="p-2 rounded bg-zinc-950 border border-emerald-500/20">
              <span className="text-zinc-400 block text-[10px]">Atualizados:</span>
              <strong className="text-blue-400 text-sm">{syncResult.updated || syncResult.updatedCount || 0}</strong>
            </div>
            <div className="p-2 rounded bg-zinc-950 border border-emerald-500/20">
              <span className="text-zinc-400 block text-[10px]">Erros:</span>
              <strong className="text-red-400 text-sm">{syncResult.errors?.length || syncResult.errorCount || 0}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Vault Permanente & Proteção Anti-F5 Card */}
      <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className={`w-5 h-5 ${vaultStatus?.hasAuthToken ? 'text-emerald-400' : 'text-amber-400'} shrink-0`} />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-200 font-semibold">Vault de Sessão Permanente & Proteção Anti-F5:</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                  vaultStatus?.hasAuthToken
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : vaultStatus?.exists
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}
              >
                {vaultStatus?.hasAuthToken
                  ? 'Sessão Autenticada e Protegida Contra Recarregamentos'
                  : vaultStatus?.exists
                  ? 'Vault Ativo (Aguardando Conclusão do Login)'
                  : 'Aguardando Primeiro Login'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Imunidade a perdas de login em recarregamentos (F5), proteção contra interceptor de logout e recuperação contínua 24/7.
              {vaultStatus?.savedAt && (() => {
                try {
                  const d = new Date(vaultStatus.savedAt);
                  return !isNaN(d.getTime()) ? (
                    <span className="text-zinc-500 block text-[10px] mt-0.5">
                      Última sincronização do Vault: {d.toLocaleString('pt-BR')} ({vaultStatus.storageKeyCount || 0} chaves gravadas, {vaultStatus.cookieCount || 0} cookies)
                    </span>
                  ) : null;
                } catch {
                  return null;
                }
              })()}
            </p>
          </div>
        </div>
        <button
          onClick={handleSaveVaultNow}
          disabled={savingVault}
          className="shrink-0 text-xs px-3 py-1.5 bg-zinc-850 hover:bg-zinc-800 text-zinc-200 border border-zinc-750 rounded-lg font-medium transition-all disabled:opacity-50"
        >
          {savingVault ? 'Gravando Snapshot...' : 'Atualizar Snapshot do Vault'}
        </button>
      </div>

      {/* Live Diagnostic Card & Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Diagnostic Detailed Card */}
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              <h4 className="text-xs font-semibold text-zinc-100">Diagnóstico Real Playwright</h4>
            </div>
            <div className="flex items-center gap-1.5 font-medium text-xs">
              {diagnostic.browserRunning ? (
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Navegador Aberto
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700 flex items-center gap-1">
                  Inativo
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
              <span className="text-zinc-400">Status de Conexão:</span>
              <span
                className={`font-semibold ${
                  isConnected
                    ? 'text-emerald-400'
                    : isAwaitingLogin
                    ? 'text-amber-400'
                    : isError
                    ? 'text-red-400'
                    : 'text-zinc-400'
                }`}
              >
                {diagnostic.connectionStatus}
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
              <span className="text-zinc-400">Contexto & Janela:</span>
              <span className={diagnostic.browserRunning ? 'text-emerald-400 font-semibold' : 'text-zinc-400'}>
                {diagnostic.browserRunning ? 'ATIVO' : 'FECHADO'}
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
              <span className="text-zinc-400">Elementos .iptv-username:</span>
              <span className="text-blue-400 font-semibold">{diagnostic.usersFound}</span>
            </div>

            <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
              <span className="text-zinc-400">Linhas tr na tabela:</span>
              <span className="text-zinc-300 font-semibold">{diagnostic.rowsFound}</span>
            </div>

            <div className="space-y-1 pt-1">
              <span className="text-zinc-500 text-[10px] block">URL Atual:</span>
              <p
                className="text-[11px] text-zinc-300 truncate bg-zinc-950 p-1.5 rounded border border-zinc-800"
                title={diagnostic.currentUrl}
              >
                {diagnostic.currentUrl}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-zinc-500 text-[10px] block">Título da Página:</span>
              <p className="text-[11px] text-zinc-300 truncate bg-zinc-950 p-1.5 rounded border border-zinc-800">
                {diagnostic.title || 'N/A'}
              </p>
            </div>

            {diagnostic.lastError && (
              <div className="space-y-1 pt-1">
                <span className="text-red-400 text-[10px] block font-semibold">Último Aviso / Erro:</span>
                <p className="text-[10px] text-red-300 bg-red-950/40 p-2 rounded border border-red-800/50 break-words font-mono">
                  {diagnostic.lastError}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Playwright Real Selectors & Rules */}
        <div className="lg:col-span-2 p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-blue-400" />
              <h4 className="text-xs font-semibold text-zinc-100">Seletores DOM Confirmados e Regras</h4>
            </div>
            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-mono">
              Windows 11 / Headless: false
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
              <span className="text-zinc-500 block text-[10px] uppercase font-medium">Usuário IPTV</span>
              <span className="font-mono text-blue-400 font-medium">.iptv-username</span>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
              <span className="text-zinc-500 block text-[10px] uppercase font-medium">Senha</span>
              <span className="font-mono text-zinc-300 font-medium">.iptv-col-password</span>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
              <span className="text-zinc-500 block text-[10px] uppercase font-medium">Status Badge</span>
              <span className="font-mono text-emerald-400 font-medium">.iptv-status-badge</span>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
              <span className="text-zinc-500 block text-[10px] uppercase font-medium">Notas / Nome</span>
              <span className="font-mono text-zinc-300 font-medium">.iptv-col-notes</span>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
              <span className="text-zinc-500 block text-[10px] uppercase font-medium">Vencimento</span>
              <span className="font-mono text-zinc-300 font-medium">.iptv-col-expiry b</span>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
              <span className="text-zinc-500 block text-[10px] uppercase font-medium">Botão +30</span>
              <span className="font-mono text-amber-400 font-medium">locator.filter(&#123; hasText: '+30' &#125;)</span>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-400 space-y-1">
            <span className="text-zinc-300 font-medium block text-[11px]">Perfil Isolado & Independente</span>
            <p className="text-[11px] leading-relaxed">
              O diretório <code className="text-zinc-200 font-mono">backend/data/iptv-browser-profile</code> é utilizado exclusivamente pela automação, sem bloquear ou interferir nas outras instâncias do Google Chrome abertas no seu Windows.
            </p>
          </div>
        </div>
      </div>

      {/* Simulator / Test Renewal Box */}
      <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-semibold text-zinc-100">
              Simulador de Renovação (+30 Dias)
            </h3>
          </div>
          <span className="text-xs text-zinc-500">
            Envia ordem para a fila assíncrona do Playwright
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="flex-1 w-full">
            <select
              value={selectedCustomerForTest}
              onChange={(e) => setSelectedCustomerForTest(e.target.value)}
              className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:border-zinc-600 focus:outline-none"
            >
              {(customers || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (Usuário: {c.iptvUsername} - Vencimento: {c.expirationDate})
                </option>
              ))}
            </select>
          </div>

          <div className="w-full sm:w-44">
            <select
              value={testDays}
              onChange={(e) => setTestDays(Number(e.target.value))}
              className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:border-zinc-600 focus:outline-none"
            >
              <option value={30}>+30 dias (1 ciclo)</option>
              <option value={90}>+90 dias (3 ciclos)</option>
              <option value={180}>+180 dias (6 ciclos)</option>
              <option value={365}>+365 dias (12 ciclos)</option>
            </select>
          </div>

          <button
            onClick={handleRunTestRenewal}
            disabled={testRunning || customers.length === 0}
            className="w-full sm:w-auto px-3.5 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50"
          >
            {testRunning ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            <span>{testRunning ? 'Enfileirando...' : 'Renovar Cliente'}</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Queue on Left, Live Logs on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Jobs Queue */}
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400" />
              <h3 className="text-xs font-semibold text-zinc-100">Fila de Execução (Queue)</h3>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-950 text-zinc-400 border border-zinc-800">
              {jobs.length} tarefas
            </span>
          </div>

          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {jobs.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-500">
                Nenhuma tarefa na fila no momento.
              </div>
            ) : (
              (jobs || []).map((job) => (
                <div
                  key={job.id}
                  className={`p-3 rounded-lg border transition-all text-xs space-y-2 ${
                    job.status === 'PROCESSING'
                      ? 'bg-amber-500/10 border-amber-500/30 animate-pulse'
                      : job.status === 'SUCCESS'
                      ? 'bg-zinc-950 border-emerald-500/20'
                      : job.status === 'FAILED'
                      ? 'bg-red-500/10 border-red-500/30'
                      : 'bg-zinc-950 border-zinc-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] font-medium text-zinc-300">
                      Job #{job.id.slice(-6)}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                        job.status === 'SUCCESS'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : job.status === 'PROCESSING'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : job.status === 'FAILED'
                          ? 'bg-red-500/10 text-red-400 border-red-500/20'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                      }`}
                    >
                      {job.status}
                    </span>
                  </div>

                  <div>
                    <span className="font-medium text-zinc-200">{job.customerName}</span>
                    <span className="block text-[11px] font-mono text-zinc-400">
                      IPTV: {job.iptvUsername} •{' '}
                      {job.action === 'DELETE_IPTV_USER'
                        ? 'Exclusão de Acesso'
                        : job.action === 'GENERATE_TEST'
                        ? 'Teste Grátis'
                        : `+${job.days} dias`}
                    </span>
                  </div>

                  {job.errorMessage && (
                    <p className="text-[11px] text-red-400 bg-red-500/10 p-1.5 rounded border border-red-500/20">
                      {job.errorMessage}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-1 text-[10px] text-zinc-500">
                    <span>
                      Tentativas: {job.attempts}/{job.maxAttempts}
                    </span>
                    {job.status === 'FAILED' && (
                      <button
                        onClick={() => handleRetryJob(job.id)}
                        className="text-blue-400 hover:underline font-medium flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Retentar</span>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Live Logs Terminal */}
        <div className="lg:col-span-2 p-4 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col justify-between space-y-3">
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-semibold text-zinc-100 font-mono">
                  [IPTV] Logs de Execução em Tempo Real
                </h3>
              </div>

              {/* Log filter pills */}
              <div className="flex items-center gap-1">
                {['ALL', 'INFO', 'SUCCESS', 'WARN', 'ERROR'].map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setLogFilter(lvl)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                      logFilter === lvl
                        ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            {/* Search within logs */}
            <input
              type="text"
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              placeholder="Filtrar logs por texto..."
              className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-300 focus:outline-none focus:border-zinc-600"
            />

            {/* Terminal Window */}
            <div className="h-[340px] overflow-y-auto bg-zinc-950 p-3 rounded-lg border border-zinc-850 font-mono text-xs space-y-1.5">
              {filteredLogs.length === 0 ? (
                <div className="text-zinc-600 py-6 text-center">Nenhum log registrado no momento.</div>
              ) : (
                (filteredLogs || []).map((l) => {
                  const time = new Date(l.timestamp).toLocaleTimeString('pt-BR');
                  let color = 'text-zinc-300';
                  if (l.level === 'SUCCESS') color = 'text-emerald-400';
                  if (l.level === 'WARN') color = 'text-amber-400';
                  if (l.level === 'ERROR') color = 'text-red-400';

                  return (
                    <div key={l.id} className="leading-relaxed flex items-start gap-2">
                      <span className="text-zinc-600 text-[10px] shrink-0">[{time}]</span>
                      <span
                        className={`text-[10px] font-medium px-1 rounded uppercase shrink-0 ${
                          l.level === 'SUCCESS'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : l.level === 'ERROR'
                            ? 'bg-red-500/20 text-red-300'
                            : l.level === 'WARN'
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-zinc-800 text-zinc-300'
                        }`}
                      >
                        {l.level}
                      </span>
                      <span className={`text-[11px] ${color}`}>{l.message}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-2 border-t border-zinc-800">
            <span>Mostrando {filteredLogs.length} logs</span>
            <span className="font-mono text-zinc-500">Auto-Refresh Ativo (3s)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
