import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Layers, Clock, X, Package } from 'lucide-react';
import { Plan } from '../../types';
import { api } from '../../lib/api';

export const PlansView: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: 35.0,
    days: 30,
    active: true,
    displayOrder: 1,
  });

  const fetchPlans = async () => {
    try {
      const list = await api.getPlans();
      setPlans(list);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleOpenCreate = () => {
    setEditingPlan(null);
    setFormData({
      name: '',
      description: '',
      price: 35.0,
      days: 30,
      active: true,
      displayOrder: plans.length + 1,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (plan: Plan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      description: plan.description,
      price: plan.price,
      days: plan.days,
      active: plan.active,
      displayOrder: plan.displayOrder,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPlan) {
        await api.updatePlan(editingPlan.id, formData);
      } else {
        await api.createPlan(formData);
      }
      setIsModalOpen(false);
      fetchPlans();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Erro: ${msg}`);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Deseja excluir o plano "${name}"?`)) return;
    try {
      await api.deletePlan(id);
      fetchPlans();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Erro ao excluir: ${msg}`);
    }
  };

  const toggleActive = async (plan: Plan) => {
    try {
      await api.updatePlan(plan.id, { active: !plan.active });
      fetchPlans();
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <Package className="w-5 h-5 text-zinc-400" />
            <span>Planos de Assinatura & Ciclos</span>
          </h1>
          <p className="text-xs text-zinc-400">
            Configure os planos de renovação disponíveis no portal do cliente e a quantidade de ciclos +30 no Playwright.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold rounded-lg transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Plano</span>
        </button>
      </div>

      {/* Playwright Multi-cycle Explanation Card */}
      <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 flex items-start gap-3">
        <div className="p-2 rounded-lg bg-zinc-950 text-blue-400 shrink-0 border border-zinc-800">
          <Layers className="w-4 h-4" />
        </div>
        <div className="text-xs space-y-1">
          <h4 className="font-semibold text-zinc-200">
            Arquitetura de Ciclos Playwright (+30)
          </h4>
          <p className="text-zinc-400 leading-relaxed">
            Como o painel opera com o botão padrão <strong>+30</strong>, planos com períodos maiores
            executam múltiplos cliques verificando e validando a nova data em cada ciclo:
            <span className="text-zinc-300 font-mono text-[11px] ml-1">
              30d (1x +30) • 90d (3x +30) • 180d (6x +30) • 365d (12x +30)
            </span>.
          </p>
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {plans.map((plan) => {
          const cycles = Math.max(1, Math.round(plan.days / 30));

          return (
            <div
              key={plan.id}
              className={`p-4 rounded-xl bg-zinc-900 border transition-all flex flex-col justify-between ${
                plan.active ? 'border-zinc-800 hover:border-zinc-700' : 'border-zinc-800/40 opacity-60'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                      plan.active
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    }`}
                  >
                    {plan.active ? 'Ativo' : 'Desativado'}
                  </span>
                  <span className="text-[11px] font-mono text-zinc-500">
                    Ordem #{plan.displayOrder}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">{plan.name}</h3>
                  <p className="text-xs text-zinc-400 mt-1 min-h-[30px]">
                    {plan.description || 'Sem descrição'}
                  </p>
                </div>

                <div className="pt-2 border-t border-zinc-800 space-y-1">
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold text-zinc-100">
                      R$ {plan.price.toFixed(2)}
                    </span>
                    <span className="text-xs text-zinc-500">/ {plan.days} dias</span>
                  </div>

                  <div className="text-[11px] text-zinc-400 font-mono flex items-center gap-1">
                    <Clock className="w-3 h-3 text-blue-400" />
                    <span>Automação: {cycles} ciclo(s) +30</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-zinc-800 mt-4">
                <button
                  onClick={() => toggleActive(plan)}
                  className={`text-xs font-medium hover:underline ${
                    plan.active ? 'text-amber-400' : 'text-emerald-400'
                  }`}
                >
                  {plan.active ? 'Desativar' : 'Ativar'}
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEdit(plan)}
                    className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-750 text-zinc-300 border border-zinc-700 transition-colors"
                    title="Editar Plano"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(plan.id, plan.name)}
                    className="p-1.5 rounded bg-zinc-800 hover:bg-red-950/40 text-zinc-400 hover:text-red-400 border border-zinc-700 transition-colors"
                    title="Excluir Plano"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create / Edit Plan Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-semibold text-zinc-100">
                {editingPlan ? 'Editar Plano' : 'Novo Plano de Assinatura'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="text-zinc-300 font-medium">Nome do Plano *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 focus:border-zinc-600 focus:outline-none"
                  placeholder="Ex: Trimestral"
                />
              </div>

              <div className="space-y-1">
                <label className="text-zinc-300 font-medium">Descrição</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 focus:border-zinc-600 focus:outline-none"
                  placeholder="Ex: 3 meses de acesso completo para TV e celular..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-zinc-300 font-medium">Valor (R$) *</label>
                  <input
                    type="number"
                    step="0.50"
                    required
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 focus:border-zinc-600 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-zinc-300 font-medium">Duração (Dias) *</label>
                  <input
                    type="number"
                    required
                    value={formData.days}
                    onChange={(e) => setFormData({ ...formData, days: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 focus:border-zinc-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-zinc-300 font-medium">Ordem de Exibição</label>
                  <input
                    type="number"
                    value={formData.displayOrder}
                    onChange={(e) =>
                      setFormData({ ...formData, displayOrder: parseInt(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 focus:border-zinc-600 focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="planActiveCheck"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="rounded border-zinc-800 bg-zinc-950 text-blue-600 focus:ring-0"
                  />
                  <label htmlFor="planActiveCheck" className="text-zinc-300 font-medium cursor-pointer">
                    Plano Ativo
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 border border-zinc-700 font-medium rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-zinc-100 hover:bg-white text-zinc-950 font-semibold rounded-lg"
                >
                  {editingPlan ? 'Salvar Alterações' : 'Criar Plano'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
