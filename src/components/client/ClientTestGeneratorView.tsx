import React, { useState } from 'react';
import {
  Gift,
  Clock,
  CheckCircle2,
  Copy,
  Check,
  Sparkles,
  Share2,
  Tv,
  Smartphone,
  ExternalLink,
  RefreshCw,
  X,
  FileText,
  AlertCircle,
  ShieldAlert,
  Zap,
  Mail,
  Phone,
  User,
  Key,
  Eye,
  EyeOff,
  Bell,
  ShieldCheck,
  Send,
} from 'lucide-react';
import { IptvTestResult, IptvAccess, Customer } from '../../types';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { copyToClipboard as safeCopy } from '../../utils/clipboard';

interface ClientTestGeneratorViewProps {
  onTestGenerated?: (result: IptvTestResult | IptvAccess) => void;
  onNavigateToRenew?: () => void;
  onSuccessRegistered?: (customer: Customer, access: IptvAccess) => void;
}

export const ClientTestGeneratorView: React.FC<ClientTestGeneratorViewProps> = ({
  onTestGenerated,
  onNavigateToRenew,
  onSuccessRegistered,
}) => {
  const { currentCustomer, refreshCustomer, loginCustomer } = useAuth();
  const [generating, setGenerating] = useState(false);
  const [trialResult, setTrialResult] = useState<IptvAccess | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form Fields for Mandatory Registration
  const [name, setName] = useState(currentCustomer?.name || '');
  const [email, setEmail] = useState(currentCustomer?.email || '');
  const [phone, setPhone] = useState(currentCustomer?.phone || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const copyToClipboard = async (text: string, key: string) => {
    await safeCopy(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleRegisterAndGenerateTrial = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    // Validações no frontend
    if (!name.trim() || name.trim().length < 2) {
      setErrorMsg('Por favor, informe seu nome completo.');
      setGenerating(false);
      return;
    }
    if (!email.trim() || !email.includes('@') || !email.includes('.')) {
      setErrorMsg('Por favor, informe um endereço de e-mail válido para receber os dados de acesso e lembretes.');
      setGenerating(false);
      return;
    }
    const cleanPhone = phone.replace(/\D/g, '');
    if (!phone.trim() || cleanPhone.length < 8) {
      setErrorMsg('Por favor, informe um número de WhatsApp válido com DDD.');
      setGenerating(false);
      return;
    }
    if (!password.trim() || password.trim().length < 4) {
      setErrorMsg('Por favor, crie uma senha com pelo menos 4 caracteres.');
      setGenerating(false);
      return;
    }

    try {
      const res = await api.clientRegisterTrial({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        password: password.trim(),
      });

      setTrialResult(res.access);
      setRegisteredEmail(res.customer.email);
      setSuccessMsg(
        `Cadastro realizado com sucesso! Enviamos seus dados de acesso para o e-mail: ${res.customer.email}`
      );

      // Logar o cliente automaticamente na sessão
      if (res.token && res.customer) {
        loginCustomer(res.customer, res.token);
      }

      onTestGenerated?.(res.access);
      onSuccessRegistered?.(res.customer, res.access);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg || 'Não foi possível concluir seu cadastro de teste.');
    } finally {
      setGenerating(false);
    }
  };

  const handleLoggedCustomerTrial = async () => {
    setGenerating(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.requestClientTrial();
      setTrialResult(res.access);
      setSuccessMsg(res.message || 'Teste de 1 hora gerado com sucesso!');
      await refreshCustomer();
      onTestGenerated?.(res.access);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg || 'Não foi possível gerar o teste gratuito.');
    } finally {
      setGenerating(false);
    }
  };

  const alreadyUsed = currentCustomer?.trialUsed;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Top Banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 relative overflow-hidden shadow-xl">
        <div className="absolute -right-8 -top-8 w-44 h-44 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="space-y-2 relative z-10">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Teste Gratuito & Acesso Completo</span>
          </div>
          <h2 className="text-xl font-bold text-zinc-100 tracking-tight">
            Cadastro para Liberação de Teste Gratuito
          </h2>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Cadastre seu e-mail e WhatsApp para receber imediatamente seus dados de acesso (usuário e senha) no e-mail, além de notificações de vencimento com link direto para login e renovação.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-start gap-3">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold">{successMsg}</div>
            <div className="text-[11px] text-emerald-300/80">
              Você também receberá lembretes por e-mail 7 dias antes, 3 dias antes e no dia do vencimento.
            </div>
          </div>
        </div>
      )}

      {/* Trial Already Used Notice (for already logged-in customer) */}
      {alreadyUsed && !trialResult && currentCustomer && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 shadow-xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h3 className="text-base font-bold text-zinc-100">Teste Já Utilizado em sua Conta</h3>
            <p className="text-xs text-zinc-400">
              Você já usou seu teste gratuito de 1 hora. Para ativar seu plano com liberação imediata via PIX, acesse a aba de renovação.
            </p>
          </div>
          {onNavigateToRenew && (
            <div className="pt-2">
              <button
                onClick={onNavigateToRenew}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold inline-flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all"
              >
                <Zap className="w-4 h-4" />
                <span>Ver Planos & Ativar via PIX</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mandatory Registration Form (When not generated yet and (not logged in OR not used)) */}
      {!trialResult && (!currentCustomer || (!alreadyUsed && !currentCustomer)) && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex items-center gap-2.5 border-b border-zinc-800 pb-3">
            <div className="p-2 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-100">Preencha seus dados obrigatórios</h3>
              <p className="text-[11px] text-zinc-400">Todos os campos abaixo são obrigatórios para emissão do teste</p>
            </div>
          </div>

          <form onSubmit={handleRegisterAndGenerateTrial} className="space-y-4 text-xs">
            {/* Nome Completo */}
            <div className="space-y-1.5">
              <label className="text-zinc-300 font-medium flex items-center justify-between">
                <span>Nome Completo *</span>
                <span className="text-[10px] text-zinc-500">Obrigatório</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-xs font-medium focus:border-indigo-500 focus:outline-none placeholder-zinc-600 transition-colors"
                  placeholder="Seu nome completo"
                />
              </div>
            </div>

            {/* E-mail */}
            <div className="space-y-1.5">
              <label className="text-zinc-300 font-medium flex items-center justify-between">
                <span>Endereço de E-mail *</span>
                <span className="text-[10px] text-indigo-400 font-medium">Receberá os dados de acesso aqui</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-xs font-medium focus:border-indigo-500 focus:outline-none placeholder-zinc-600 transition-colors"
                  placeholder="seu.email@exemplo.com"
                />
              </div>
            </div>

            {/* WhatsApp / Telefone */}
            <div className="space-y-1.5">
              <label className="text-zinc-300 font-medium flex items-center justify-between">
                <span>WhatsApp com DDD *</span>
                <span className="text-[10px] text-zinc-500">Ex: 11999998888</span>
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-xs font-medium focus:border-indigo-500 focus:outline-none placeholder-zinc-600 transition-colors"
                  placeholder="(11) 99999-9999"
                />
              </div>
            </div>

            {/* Criar Senha */}
            <div className="space-y-1.5">
              <label className="text-zinc-300 font-medium flex items-center justify-between">
                <span>Criar uma Senha de Acesso *</span>
                <span className="text-[10px] text-zinc-500">Mínimo 4 dígitos</span>
              </label>
              <div className="relative">
                <Key className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-xs font-medium focus:border-indigo-500 focus:outline-none placeholder-zinc-600 transition-colors"
                  placeholder="Crie sua senha de acesso ao portal"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Feature Highlights */}
            <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-2 text-[11px] text-zinc-400">
              <div className="flex items-center gap-2 text-indigo-300 font-semibold">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>O que acontece após o cadastro?</span>
              </div>
              <ul className="space-y-1.5 pl-6 list-disc">
                <li>Seus dados de acesso (usuário e senha) são gerados na hora e enviados ao seu e-mail.</li>
                <li>Você receberá notificações automáticas faltando 7 dias, 3 dias e no dia de vencimento.</li>
                <li>Todos os e-mails incluem o link direto (<strong className="text-zinc-300">http://paineltv.ddns.net/</strong>) para login e renovação com PIX.</li>
              </ul>
            </div>

            <button
              type="submit"
              disabled={generating}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/25"
            >
              {generating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Cadastrando e Gerando Teste...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Concluir Cadastro & Gerar Teste Grátis</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Trial Result Box */}
      {trialResult && (
        <div className="bg-zinc-900 border border-emerald-500/30 rounded-2xl p-6 space-y-5 shadow-2xl animate-in fade-in">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                  Teste Gratuito Gerado com Sucesso!
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                    ATIVO
                  </span>
                </h3>
                <p className="text-xs text-zinc-400">
                  Enviamos também as instruções para seu e-mail: <strong className="text-zinc-200">{registeredEmail || email || currentCustomer?.email}</strong>
                </p>
              </div>
            </div>
          </div>

          {/* Credentials Display */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800">
              <div className="text-[10px] text-zinc-500 font-medium">USUÁRIO IPTV</div>
              <div className="text-sm font-mono font-bold text-zinc-100 flex items-center justify-between mt-1">
                <span>{trialResult.iptvUsername}</span>
                <button
                  onClick={() => copyToClipboard(trialResult.iptvUsername, 'user')}
                  className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                  title="Copiar Usuário"
                >
                  {copiedKey === 'user' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800">
              <div className="text-[10px] text-zinc-500 font-medium">SENHA DE ACESSO</div>
              <div className="text-sm font-mono font-bold text-zinc-100 flex items-center justify-between mt-1">
                <span>{trialResult.iptvPassword}</span>
                <button
                  onClick={() => copyToClipboard(trialResult.iptvPassword || '', 'pass')}
                  className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                  title="Copiar Senha"
                >
                  {copiedKey === 'pass' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800">
              <div className="text-[10px] text-zinc-500 font-medium">VÁLIDO ATÉ</div>
              <div className="text-xs font-mono font-bold text-amber-400 flex items-center gap-1 mt-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>{trialResult.expirationDate}</span>
              </div>
            </div>
          </div>

          {/* DNS Server */}
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-zinc-500 font-medium">SERVIDOR / URL DNS</div>
              <div className="text-xs font-mono font-bold text-indigo-400 mt-0.5">
                {trialResult.iptvUrl || 'http://satq.top'}
              </div>
            </div>
            <button
              onClick={() => copyToClipboard(trialResult.iptvUrl || 'http://satq.top', 'dns')}
              className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-medium flex items-center gap-1.5 border border-zinc-800"
            >
              {copiedKey === 'dns' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>Copiar DNS</span>
            </button>
          </div>

          {/* Apps and Quick Guide */}
          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2.5 text-xs">
            <div className="text-zinc-300 font-semibold flex items-center gap-2">
              <Tv className="w-4 h-4 text-indigo-400" />
              <span>Como assistir agora mesmo:</span>
            </div>
            <ul className="space-y-2 text-zinc-400 text-[11px]">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                <span>
                  No aplicativo <strong>IPTV Smarters Pro / XCIPTV</strong>: selecione "Login com Xtream Codes API", insira o usuário e senha acima e a URL <strong className="text-zinc-200 font-mono">http://satq.top</strong>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                <span>
                  Na <strong>Smart TV Samsung ou LG</strong>: instale o aplicativo <strong>Pixel Player</strong>, <strong>Prime IPTV</strong> ou <strong>IBO Player</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                <span>
                  No computador via navegador Web Player: <a href="http://navegauni.top/" target="_blank" rel="noreferrer" className="text-indigo-400 underline font-medium">http://navegauni.top</a>
                </span>
              </li>
            </ul>
          </div>

          {onNavigateToRenew && (
            <div className="pt-2 flex justify-end">
              <button
                onClick={onNavigateToRenew}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold inline-flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition-all"
              >
                <Zap className="w-4 h-4" />
                <span>Gostou? Renovar Plano Definitivo via PIX</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
