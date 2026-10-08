import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  RefreshCw,
  Plus,
  Edit,
  Trash2,
  Calendar,
  Phone,
  Mail,
  Tv,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  Key,
  X,
  Shield,
  DollarSign,
} from 'lucide-react';
import { Customer, IptvAccess, Plan } from '../../types';
import { api } from '../../lib/api';

export const CustomersView: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    customPrice: '',
    portalPassword: '',
  });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [renewingId, setRenewingId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [custList, planList] = await Promise.all([api.getCustomers(), api.getPlans()]);
      setCustomers(custList);
      setPlans(planList);
    } catch (err: unknown) {
      console.error('Erro ao carregar clientes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleOpenEdit = (customer: Customer) => {
    setSelectedCustomer(customer);
    setEditForm({
      name: customer.name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      customPrice: customer.customPrice !== undefined ? String(customer.customPrice) : '',
      portalPassword: customer.portalPassword || '',
    });
    setIsEditing(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    try {
      await api.updateCustomer(selectedCustomer.id, {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone,
        customPrice: editForm.customPrice ? Number(editForm.customPrice) : undefined,
        portalPassword: editForm.portalPassword || undefined,
      });
      showToast(`Cliente "${editForm.name}" atualizado com sucesso!`);
      setIsEditing(false);
      setSelectedCustomer(null);
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Erro ao atualizar cliente: ${msg}`);
    }
  };

  const handleManualRenew = async (customer: Customer) => {
    try {
      setRenewingId(customer.id);
      await api.renewCustomerManual(customer.id, 30);
      showToast(`Renovação +30 dias solicitada para ${customer.name}`);
      setTimeout(() => fetchData(), 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Erro na renovação: ${msg}`);
    } finally {
      setRenewingId(null);
    }
  };

  const handleDelete = async (customer: Customer) => {
    if (!confirm(`Tem certeza que deseja excluir o cliente ${customer.name}?`)) return;
    try {
      await api.deleteCustomer(customer.id, true);
      showToast(`Cliente ${customer.name} excluído.`);
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Erro ao excluir: ${msg}`);
    }
  };

  const filteredCustomers = customers.filter((c) => {
    const term = searchTerm.toLowerCase();
    return (
      c.name?.toLowerCase().includes(term) ||
      c.email?.toLowerCase().includes(term) ||
      c.phone?.toLowerCase().includes(term) ||
      c.iptvUsername?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-xl bg-emerald-600 text-white shadow-2xl flex items-center gap-3 text-xs font-bold animate-bounce">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2.5 rounded-xl bg-indigo-600/15 border border-indigo-500/30 text-indigo-400">
              <Users className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-zinc-100">Gerenciamento de Clientes & Acessos</h1>
          </div>
          <p className="text-xs text-zinc-400">
            Consulte todos os assinantes cadastrados, ajuste valores acordados (custom price), senhas e realize renovações manuais.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold border border-zinc-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-lg">
        <Search className="w-4 h-4 text-zinc-500 ml-2" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Pesquisar por nome, e-mail, WhatsApp ou usuário IPTV..."
          className="w-full bg-transparent text-xs text-zinc-100 focus:outline-none placeholder-zinc-500"
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="text-xs text-zinc-500 hover:text-zinc-300 px-2">
            Limpar
          </button>
        )}
      </div>

      {/* Customers Table / List */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-300">
            Total de Clientes: <span className="text-indigo-400">{filteredCustomers.length}</span>
          </span>
        </div>

        {filteredCustomers.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <Users className="w-10 h-10 text-zinc-600 mx-auto" />
            <p className="text-sm font-semibold text-zinc-300">Nenhum cliente encontrado</p>
            <p className="text-xs text-zinc-500">Tente buscar por outro termo ou cadastre novos clientes.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 bg-zinc-950/50 font-semibold">
                  <th className="p-4">Cliente / Contato</th>
                  <th className="p-4">Usuário IPTV</th>
                  <th className="p-4">Vencimento</th>
                  <th className="p-4">Valor Acordado</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredCustomers.map((c) => {
                  const isExpiring = c.status === 'EXPIRING';
                  const isExpired = c.status === 'EXPIRED';
                  const isTest = c.status === 'TEST';

                  return (
                    <tr key={c.id} className="hover:bg-zinc-800/40 transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-zinc-100 text-sm">{c.name}</div>
                        <div className="text-zinc-400 text-[11px] flex items-center gap-2 mt-0.5">
                          <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {c.phone}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {c.email || 'Sem e-mail'}</span>
                        </div>
                      </td>
                      <td className="p-4 font-mono text-indigo-400 font-semibold">
                        {c.iptvUsername || 'N/A'}
                      </td>
                      <td className="p-4">
                        <span className={`font-mono font-medium ${isExpired ? 'text-red-400' : isExpiring ? 'text-amber-400' : 'text-zinc-300'}`}>
                          {c.expirationDate || 'N/A'}
                        </span>
                      </td>
                      <td className="p-4">
                        {c.customPrice !== undefined && c.customPrice !== null ? (
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold">
                            R$ {Number(c.customPrice).toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-zinc-500 text-[11px]">Padrão (Plano)</span>
                        )}
                      </td>
                      <td className="p-4">
                        {isExpired ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/30">Expirado</span>
                        ) : isExpiring ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">Vencendo</span>
                        ) : isTest ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30">Teste</span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">Ativo</span>
                        )}
                      </td>
                      <td className="p-4 text-right space-x-2">
                        <button
                          onClick={() => handleManualRenew(c)}
                          disabled={renewingId === c.id}
                          title="Renovar +30 dias"
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors disabled:opacity-50"
                        >
                          {renewingId === c.id ? 'Renovando...' : '+30 Dias'}
                        </button>
                        <button
                          onClick={() => handleOpenEdit(c)}
                          title="Editar Cliente & Valor Acordado"
                          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(c)}
                          title="Excluir Cliente"
                          className="p-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/30 text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Customer Modal */}
      {isEditing && selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
              <h2 className="text-base font-bold text-zinc-100">Editar Cliente & Preço Acordado</h2>
              <button
                onClick={() => setIsEditing(false)}
                className="p-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-zinc-300 font-medium">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-zinc-300 font-medium">WhatsApp / Telefone</label>
                  <input
                    type="text"
                    required
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-zinc-300 font-medium">E-mail</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-zinc-300 font-medium flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Valor Acordado Mensal (R$)</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ex: 30.00 (Deixe em branco para usar o preço do plano)"
                    value={editForm.customPrice}
                    onChange={(e) => setEditForm({ ...editForm, customPrice: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 focus:border-indigo-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-zinc-500">Este valor será aplicado ao gerar cobranças PIX para este cliente.</p>
                </div>
                <div className="space-y-1">
                  <label className="text-zinc-300 font-medium flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Senha do Portal</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Nova senha do assinante"
                    value={editForm.portalPassword}
                    onChange={(e) => setEditForm({ ...editForm, portalPassword: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 focus:border-indigo-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-600/30"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
