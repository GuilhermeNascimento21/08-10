import { Plan } from '../types';

/**
 * Retorna o multiplicador de meses de um plano baseado na duração / nome / ID.
 * - Mensal (30 dias) -> 1
 * - Trimestral (90 dias) -> 3
 * - Semestral (180 dias) -> 6
 * - Anual / Anual VIP (365 dias) -> 12
 */
export function getPlanMultiplier(plan: { days?: number; id?: string; name?: string }): number {
  const id = (plan.id || '').toLowerCase();
  const name = (plan.name || '').toLowerCase();
  const days = plan.days || 30;

  if (id.includes('anual') || name.includes('anual') || days >= 300) {
    return 12;
  }
  if (id.includes('semestral') || name.includes('semestral') || (days >= 150 && days <= 210)) {
    return 6;
  }
  if (id.includes('trimestral') || name.includes('trimestral') || (days >= 75 && days <= 110)) {
    return 3;
  }
  if (id.includes('bimestral') || name.includes('bimestral') || (days >= 45 && days <= 70)) {
    return 2;
  }
  if (id.includes('mensal') || name.includes('mensal') || days <= 35) {
    return 1;
  }

  // Fallback baseado no arredondamento por blocos de 30 dias
  return Math.max(1, Math.round(days / 30));
}

/**
 * Calcula o valor final do plano considerando o valor acordado / personalizado mensal.
 * Se houver valor personalizado (customPrice mensal):
 * - Trimestral = customPrice * 3
 * - Semestral  = customPrice * 6
 * - Anual VIP  = customPrice * 12
 * - Mensal     = customPrice * 1
 * Se não houver valor personalizado, retorna o preço original do plano (plan.price).
 */
export function calculatePlanPrice(
  plan: Plan,
  customMonthlyPrice?: number | null
): number {
  if (customMonthlyPrice !== undefined && customMonthlyPrice !== null && customMonthlyPrice > 0) {
    const multiplier = getPlanMultiplier(plan);
    return customMonthlyPrice * multiplier;
  }
  return plan.price;
}
