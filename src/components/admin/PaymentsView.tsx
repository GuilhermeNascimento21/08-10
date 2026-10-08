import React, { useState, useEffect } from 'react';
import {
  Search,
  RefreshCw,
  Eye,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCcw,
  X,
  Zap,
  CreditCard,
  Tv,
} from 'lucide-react';
import { Payment } from '../../types';
import { api } from '../../lib/api';

export const PaymentsView: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<string>('ALL');
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchPayments = async () => {
    try {
      const list = await api.getPayments();
      setPayments(list);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchPayments();
    const interval = setInterval(fetchPayments, 5000);
    return () => clearInterval(interval);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleSimulateApproval = async (payment: Payment) => {
    try {
      setActionLoading(payment.id);
      await api.simulatePaymentApproval(payment.id);
      showToast(`Pagamento #${payment.id.slice(-6)} aprovado! Disparando automação IPTV...`);
      fetchPayments();
      if (selectedPayment?.id === payment.id) {
        setSelectedPayment({ ...selectedPayment, status: 'APPROVED' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Erro: ${msg}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Filter payments
  const filteredPayments = payments.filter((p) => {
    const search = searchTerm.toLowerCase();
    const matchesSearch =
      (p.customerName || '').toLowerCase().includes(search) ||
      (p.iptvUsername || '').includes(search) ||
      (p.planName || '').toLowerCase().includes(search) ||
      (p.mercadoPagoPaymentId || '').toLowerCase().includes(search);

    if (!matchesSearch) return false;

    // Status filter
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'APPROVED' && p.status !== 'APPROVED') return false;
      if (statusFilter === 'PENDING' && p.status !== 'PENDING') return false;
      if (statusFilter === 'RENEWED' && p.status !== 'RENEWED') return false;
      if (statusFilter === 'FAILED' && p.status !== 'FAILED') return false;
    }

    // Date filter
    if (dateFilter !== 'ALL') {
      const pDate = new Date(p.createdAt);
      const now = new Date();
      const diffHours = (now.getTime() - pDate.getTime()) / (1000 * 3600);

      if (dateFilter === 'TODAY' && pDate.toDateString() !== now.toDateString()) return false;
      if (dateFilter === '7DAYS' && diffHours > 24 * 7) return false;
      if (dateFilter === '30DAYS' && diffHours > 24 * 30) return false;
    }

    return true;
  });

  const getStatusBadge = (status: Payment['status']) => {
    switch (status) {
      case 'RENEWED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Renovado</span>
          </span>
        );
      case 'APPROVED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 inline-flex items-center gap-1">
            <Zap className="w-3 h-3" />
            <span>Aprovado</span>
          </span>
        );
      case 'RENEWING':
      case 'PROCESSING':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 inline-flex items-center gap-1 animate-pulse">
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>Renovando</span>
          </span>
        );
      case 'PENDING':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>Pendente</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20 inline-flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            <span>Falha</span>
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
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
            <CreditCard className="w-5 h-5 text-zinc-400" />
            <span>Histórico de Pagamentos PIX</span>
          </h1>
          <p className="text-xs text-zinc-400">
            Monitore transações do Mercado Pago e disparos automáticos de renovação.
          </p>
        </div>

        <button
          onClick={fetchPayments}
          className="flex items-center gap-2 px-3 py-2 bg-zinc-900 hover:bg-zinc-850 text-zinc-300 text-xs font-medium rounded-lg border border-zinc-800 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Atualizar</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por cliente, ponto IPTV ou ID Mercado Pago..."
              className="w-full pl-9 pr-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
            />
          </div>

          {/* Date Quick Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-xs text-zinc-400 font-medium mr-1">Período:</span>
            {[
              { id: 'ALL', label: 'Todos' },
              { id: 'TODAY', label: 'Hoje' },
              { id: '7DAYS', label: '7 dias' },
              { id: '30DAYS', label: '30 dias' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setDateFilter(tab.id)}
                className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  dateFilter === tab.id
                    ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-1.5 pt-2 border-t border-zinc-800 overflow-x-auto">
          <span className="text-xs text-zinc-400 font-medium mr-1">Status:</span>
          {[
            { id: 'ALL', label: 'Todos' },
            { id: 'APPROVED', label: 'Aprovados' },
            { id: 'PENDING', label: 'Pendentes' },
            { id: 'RENEWED', label: 'Renovados' },
            { id: 'FAILED', label: 'Falhos' },
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => setStatusFilter(pill.id)}
              className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                statusFilter === pill.id
                  ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 text-[10px] uppercase font-medium">
              <tr>
                <th className="px-4 py-3">ID / Data</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Ponto / IPTV</th>
                <th className="px-4 py-3">Plano</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Método</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                    Nenhum pagamento registrado com esses critérios.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => {
                  const dateStr = new Date(p.createdAt).toLocaleString('pt-BR');

                  return (
                    <tr key={p.id} className="hover:bg-zinc-850/40 transition-colors">
                      <td className="px-4 py-3 font-mono text-zinc-400">
                        <span className="font-medium text-zinc-200">#{p.id.slice(-6)}</span>
                        <span className="block text-[10px] text-zinc-500">{dateStr}</span>
                      </td>
                      <td className="px-4 py-3 font-medium text-zinc-200">{p.customerName}</td>
                      <td className="px-4 py-3 font-mono text-zinc-300">
                        <div className="flex items-center gap-1">
                          <Tv className="w-3.5 h-3.5 text-blue-400" />
                          <span>{p.iptvUsername}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-300">{p.planName}</td>
                      <td className="px-4 py-3 font-semibold text-zinc-100">
                        R$ {p.amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-zinc-950 text-zinc-300 border border-zinc-800">
                          {p.paymentMethod}
                        </span>
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(p.status)}</td>
                      <td className="px-4 py-3 text-right space-x-1.5">
                        {/* Simulate / Approve Test Trigger */}
                        {p.status === 'PENDING' && (
                          <button
                            disabled={actionLoading === p.id}
                            onClick={() => handleSimulateApproval(p)}
                            className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-750 text-zinc-200 border border-zinc-700 text-xs font-medium transition-colors inline-flex items-center gap-1"
                            title="Simular confirmação de pagamento e disparar Playwright"
                          >
                            {actionLoading === p.id ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />
                            ) : (
                              <Zap className="w-3 h-3 text-blue-400" />
                            )}
                            <span>Aprovar Teste</span>
                          </button>
                        )}

                        {/* Retry Failed */}
                        {p.status === 'FAILED' && (
                          <button
                            onClick={() => handleSimulateApproval(p)}
                            className="px-2.5 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-medium transition-colors inline-flex items-center gap-1"
                            title="Tentar renovação novamente no painel IPTV"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Tentar Novamente</span>
                          </button>
                        )}

                        {/* Details Modal */}
                        <button
                          onClick={() => setSelectedPayment(p)}
                          className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-750 text-zinc-300 border border-zinc-700 transition-colors inline-flex items-center"
                          title="Ver Detalhes do Pagamento"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Details Modal */}
      {selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-semibold text-zinc-100">
                Detalhes do Pagamento #{selectedPayment.id.slice(-6)}
              </h3>
              <button
                onClick={() => setSelectedPayment(null)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-850">
                  <span className="text-zinc-500 text-[10px] uppercase font-medium">Cliente:</span>
                  <span className="block font-medium text-zinc-200 text-xs mt-0.5">
                    {selectedPayment.customerName}
                  </span>
                  <span className="text-[11px] font-mono text-zinc-400">
                    IPTV: {selectedPayment.iptvUsername}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-850">
                  <span className="text-zinc-500 text-[10px] uppercase font-medium">Valor / Plano:</span>
                  <span className="block font-semibold text-emerald-400 text-xs mt-0.5">
                    R$ {selectedPayment.amount.toFixed(2)}
                  </span>
                  <span className="text-[11px] text-zinc-400">{selectedPayment.planName}</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-850 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Status Mercado Pago:</span>
                  <div>{getStatusBadge(selectedPayment.status)}</div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">ID Mercado Pago:</span>
                  <span className="font-mono text-zinc-300">
                    {selectedPayment.mercadoPagoPaymentId || 'N/A'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Referência Externa:</span>
                  <span className="font-mono text-zinc-300">
                    {selectedPayment.externalReference || 'N/A'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Criado em:</span>
                  <span className="text-zinc-300 font-mono">
                    {new Date(selectedPayment.createdAt).toLocaleString('pt-BR')}
                  </span>
                </div>
              </div>

              {selectedPayment.errorMessage && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                  <span className="font-medium block mb-1">Erro Registrado:</span>
                  {selectedPayment.errorMessage}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
                {selectedPayment.status === 'PENDING' && (
                  <button
                    onClick={() => handleSimulateApproval(selectedPayment)}
                    className="px-4 py-2 bg-zinc-100 hover:bg-white text-zinc-950 font-semibold rounded-lg text-xs flex items-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Aprovar Pagamento Teste</span>
                  </button>
                )}
                {selectedPayment.status === 'FAILED' && (
                  <button
                    onClick={() => handleSimulateApproval(selectedPayment)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Tentar Novamente</span>
                  </button>
                )}
                <button
                  onClick={() => setSelectedPayment(null)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-zinc-300 font-medium rounded-lg text-xs"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
