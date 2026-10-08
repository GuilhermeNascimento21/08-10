import React, { useState, useEffect, useRef } from 'react';
import {
  Zap,
  QrCode,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Clock,
  Tv,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { Customer, IptvAccess, Plan, Payment } from '../../types';
import { api } from '../../lib/api';
import { calculatePlanPrice, getPlanMultiplier } from '../../utils/pricing';
import { copyToClipboard } from '../../utils/clipboard';

interface ClientRenewalViewProps {
  customer: Customer;
  accesses: IptvAccess[];
  plans: Plan[];
  initialAccess?: IptvAccess | null;
  initialPayment?: Payment | null;
  onPaymentChange?: (payment: Payment | null) => void;
  onSuccessRenewal: () => void;
}

export const ClientRenewalView: React.FC<ClientRenewalViewProps> = ({
  customer,
  accesses,
  plans,
  initialAccess,
  initialPayment,
  onPaymentChange,
  onSuccessRenewal,
}) => {
  const [selectedAccessId, setSelectedAccessId] = useState<string>(
    initialAccess?.id || accesses[0]?.id || ''
  );
  const [selectedPlanId, setSelectedPlanId] = useState<string>(
    initialAccess?.planId || plans[0]?.id || 'plan-mensal'
  );

  const [generating, setGenerating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [loadingPending, setLoadingPending] = useState(false);
  const [payment, setPayment] = useState<Payment | null>(initialPayment || null);
  const [copiedPix, setCopiedPix] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pixInputRef = useRef<HTMLInputElement>(null);

  const currentAccess = accesses.find((a) => a.id === selectedAccessId) || accesses[0];
  const currentPlan = plans.find((p) => p.id === selectedPlanId) || plans[0];

  // Notificar pai quando pagamento mudar para persistir entre trocas de abas
  const updatePaymentState = (newPayment: Payment | null) => {
    setPayment(newPayment);
    if (onPaymentChange) {
      onPaymentChange(newPayment);
    }
  };

  // Ao entrar na tela ou mudar o acesso selecionado, carregar cobrança pendente existente se houver
  useEffect(() => {
    let isMounted = true;

    // Se já tivermos um pagamento aberto para este mesmo acesso, mantê-lo
    if (payment && payment.status === 'PENDING' && payment.iptvAccessId === selectedAccessId) {
      return;
    }

    const checkPendingPayment = async () => {
      if (!selectedAccessId) return;
      try {
        setLoadingPending(true);
        const pending = await api.getClientPendingPayment(selectedAccessId);
        if (isMounted && pending && pending.status === 'PENDING') {
          updatePaymentState(pending);
          if (pending.planId) {
            setSelectedPlanId(pending.planId);
          }
        }
      } catch (err) {
        console.warn('Erro ao consultar cobrança pendente:', err);
      } finally {
        if (isMounted) setLoadingPending(false);
      }
    };

    checkPendingPayment();

    return () => {
      isMounted = false;
    };
  }, [selectedAccessId]);

  // Valor acordado mensal (caso configurado para o acesso ou cliente)
  const customMonthlyPrice = currentAccess?.customPrice ?? customer.customPrice;

  // Cálculo do valor final de acordo com o plano selecionado e valor acordado
  const effectivePrice = currentPlan
    ? calculatePlanPrice(currentPlan, customMonthlyPrice)
    : 35.0;

  // Garantir que cobrança exibida condiz com o plano e valor acordado atual
  useEffect(() => {
    if (payment && payment.status === 'PENDING') {
      if (Math.abs(payment.amount - effectivePrice) > 0.01 || (payment.planId && payment.planId !== selectedPlanId)) {
        updatePaymentState(null);
      }
    }
  }, [effectivePrice, selectedPlanId, payment?.amount]);

  const generatingRef = useRef(false);

  // Gerar PIX Real no Mercado Pago (reutiliza pendente existente se houver)
  const handleGeneratePix = async () => {
    if (!currentPlan || !currentAccess || generatingRef.current) return;
    generatingRef.current = true;
    setGenerating(true);
    setErrorMsg(null);
    try {
      const res = await api.createClientPixPayment(currentPlan.id, currentAccess.id);
      updatePaymentState(res.payment);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg || 'Erro ao gerar cobrança PIX');
    } finally {
      setGenerating(false);
      generatingRef.current = false;
    }
  };

  // Cancelar cobrança pendente atual para poder escolher outro plano/valor
  const handleCancelPending = async () => {
    if (!payment) return;
    setCancelling(true);
    try {
      await api.cancelClientPayment(payment.id);
      updatePaymentState(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg || 'Erro ao cancelar cobrança anterior.');
    } finally {
      setCancelling(false);
    }
  };

  // Copiar código PIX Copia e Cola (com fallback para iframes e seleção visual)
  const handleCopyPix = async () => {
    if (!payment?.pixCopyPaste) return;

    if (pixInputRef.current) {
      try {
        pixInputRef.current.focus();
        pixInputRef.current.select();
      } catch {
        // Silencioso
      }
    }

    const success = await copyToClipboard(payment.pixCopyPaste);
    if (success) {
      setCopiedPix(true);
      setTimeout(() => setCopiedPix(false), 3000);
    }
  };

  // Polling automático ativo: consulta o status no servidor e no Mercado Pago
  useEffect(() => {
    if (!payment || payment.status === 'RENEWED' || payment.status === 'APPROVED') return;

    const interval = setInterval(async () => {
      try {
        const updated = await api.getClientPaymentStatus(payment.id);
        if (updated.status === 'RENEWED' || updated.status === 'APPROVED') {
          updatePaymentState(updated);
          onSuccessRenewal();
        } else if (updated.status === 'FAILED' || updated.status === 'CANCELLED') {
          updatePaymentState(updated);
          setErrorMsg(updated.errorMessage || 'O pagamento foi cancelado ou expirou.');
        }
      } catch {
        // Silencioso em caso de oscilação momentânea de rede
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [payment?.id, payment?.status, onSuccessRenewal]);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-zinc-100 tracking-tight flex items-center gap-2">
          <Zap className="w-5 h-5 text-indigo-500" />
          Renovação Instantânea via PIX
        </h2>
        <p className="text-xs text-zinc-400">
          Escolha o aparelho/ponto que deseja renovar e pague com liberação automática 24 horas por dia via Mercado Pago.
        </p>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Grid: Selector & Checkout Box */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left Column: Form Configuration */}
        <div className="md:col-span-6 space-y-4">
          {/* Step 1: Select Screen / Point */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3.5 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                1. Selecione o Ponto IPTV
              </span>
              <span className="text-[10px] text-zinc-500">Renovação Individual</span>
            </div>

            <div className="space-y-2">
              {(accesses || []).map((acc) => {
                const isSelected = acc.id === (currentAccess?.id || selectedAccessId);
                const itemPrice = acc.customPrice ?? customer.customPrice ?? acc.planPrice ?? 35.0;
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => {
                      setSelectedAccessId(acc.id);
                      setPayment(null);
                    }}
                    className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                      isSelected
                        ? 'bg-indigo-600/15 border-indigo-500/50 shadow-sm'
                        : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-lg ${
                          isSelected ? 'bg-indigo-600 text-white' : 'bg-zinc-900 text-zinc-400'
                        }`}
                      >
                        <Tv className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                          {acc.name}
                          {acc.customPrice !== undefined && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-medium">
                              Especial
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono">
                          User: {acc.iptvUsername} • Vence: {acc.expirationDate?.split(' ')[0]}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-bold text-zinc-100">
                        R$ {itemPrice.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-emerald-400 font-medium">30 dias</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Select Plan */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3.5 shadow-lg">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 block">
              2. Selecione o Período
            </span>

            <div className="grid grid-cols-2 gap-2.5">
              {(plans || []).map((p) => {
                const isSelected = p.id === (currentPlan?.id || selectedPlanId);
                const pPrice = calculatePlanPrice(p, customMonthlyPrice);
                const multiplier = getPlanMultiplier(p);

                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={payment?.status === 'PENDING'}
                    onClick={() => {
                      setSelectedPlanId(p.id);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'bg-indigo-600/15 border-indigo-500/50 shadow-sm'
                        : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                    } ${payment?.status === 'PENDING' ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-zinc-100">{p.name}</div>
                      {customMonthlyPrice !== undefined && customMonthlyPrice !== null && multiplier > 1 && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                          {multiplier}x
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-extrabold text-indigo-400 mt-1">
                      R$ {pPrice.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">
                      {p.days} dias de acesso
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Generate Button or Active Pending Notice */}
          {!payment || payment.status !== 'PENDING' ? (
            <button
              onClick={handleGeneratePix}
              disabled={generating || loadingPending}
              className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/25 cursor-pointer"
            >
              {generating || loadingPending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verificando e gerando PIX...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Gerar Pagamento PIX (R$ {effectivePrice.toFixed(2)})</span>
                </>
              )}
            </button>
          ) : (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
                <span>Cobrança aberta para este acesso. Aguardando pagamento.</span>
              </div>
              <button
                type="button"
                onClick={handleCancelPending}
                disabled={cancelling}
                className="text-[11px] font-semibold text-amber-200 hover:text-white underline cursor-pointer shrink-0"
              >
                {cancelling ? 'Cancelando...' : 'Cancelar e trocar'}
              </button>
            </div>
          )}
        </div>

        {/* Right Column: PIX QR Code and Payment Status */}
        <div className="md:col-span-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5 shadow-xl h-full flex flex-col justify-between">
            {!payment ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-600">
                  <QrCode className="w-8 h-8" />
                </div>
                <div className="space-y-1 max-w-xs">
                  <h4 className="text-sm font-bold text-zinc-200">Pronto para Gerar o PIX</h4>
                  <p className="text-xs text-zinc-400">
                    Selecione o ponto e o período ao lado, em seguida clique em &quot;Gerar Pagamento PIX&quot;.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>Liberação e renovação automática 24h via Mercado Pago.</span>
                </div>
              </div>
            ) : payment.status === 'RENEWED' || payment.status === 'APPROVED' ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-4 animate-in fade-in zoom-in-95">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-zinc-100 flex items-center justify-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    Pagamento Aprovado com Sucesso!
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Seu acesso foi renovado automaticamente no painel.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-left w-full space-y-2 font-mono">
                  <div className="text-zinc-400">
                    Ponto: <strong className="text-zinc-200">{payment.accessName || currentAccess?.name}</strong>
                  </div>
                  <div className="text-zinc-400">
                    Usuário IPTV: <strong className="text-zinc-200">{payment.iptvUsername || currentAccess?.iptvUsername}</strong>
                  </div>
                  <div className="text-zinc-400">
                    Valor Pago: <strong className="text-emerald-400">R$ {payment.amount?.toFixed(2)}</strong>
                  </div>
                  {payment.mercadoPagoPaymentId && (
                    <div className="text-zinc-500 text-[10px]">
                      Comprovante MP: {payment.mercadoPagoPaymentId}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => updatePaymentState(null)}
                  className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Concluir e Voltar
                </button>
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <div>
                    <div className="text-xs font-bold text-zinc-100">Pagamento PIX Gerado</div>
                    <div className="text-[10px] text-zinc-400">
                      Ponto: {payment.accessName || currentAccess?.name} ({payment.iptvUsername || currentAccess?.iptvUsername})
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-extrabold text-emerald-400">
                      R$ {payment.amount?.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-amber-400 flex items-center gap-1 font-semibold">
                      <Clock className="w-3 h-3 animate-pulse" />
                      <span>Aguardando pagamento</span>
                    </div>
                  </div>
                </div>

                {/* QR Code Container */}
                <div className="p-4 bg-white rounded-xl mx-auto w-52 h-52 flex items-center justify-center shadow-lg">
                  {payment.pixQrCodeBase64 ? (
                    <img
                      src={`data:image/png;base64,${payment.pixQrCodeBase64}`}
                      alt="PIX QR Code Mercado Pago"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                        payment.pixCopyPaste || payment.pixQrCode || ''
                      )}`}
                      alt="PIX QR Code"
                      className="w-full h-full object-contain"
                    />
                  )}
                </div>

                {/* Copia e Cola Box */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-zinc-400 flex items-center justify-between">
                    <span>PIX Copia e Cola:</span>
                    <span className="text-[10px] text-zinc-500">Clique no botão para copiar</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      ref={pixInputRef}
                      type="text"
                      readOnly
                      value={payment.pixCopyPaste || ''}
                      onClick={() => pixInputRef.current?.select()}
                      className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-300 text-xs font-mono select-all truncate cursor-text"
                    />
                    <button
                      type="button"
                      onClick={handleCopyPix}
                      className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer shadow-sm"
                    >
                      {copiedPix ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedPix ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>
                </div>

                {/* Actions: Cancel or Refresh */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={handleCancelPending}
                    disabled={cancelling}
                    className="text-xs text-zinc-400 hover:text-red-400 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>{cancelling ? 'Cancelando...' : 'Cancelar este PIX e gerar outro'}</span>
                  </button>
                  <span className="text-[10px] text-zinc-500">
                    Válido por 30 minutos
                  </span>
                </div>

                {/* Instructions Box */}
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-400 space-y-1">
                  <div className="font-semibold text-zinc-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Como pagar:</span>
                  </div>
                  <p>
                    1. Abra o app do seu banco e escolha a opção <strong>PIX</strong>.
                  </p>
                  <p>
                    2. Escaneie o QR Code ou utilize o código <strong>Copia e Cola</strong>.
                  </p>
                  <p className="text-emerald-400 font-medium">
                    3. Assim que o pagamento for concluído, a renovação será aplicada automaticamente.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
