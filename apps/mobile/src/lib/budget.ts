import { daysToGo } from './dates';

export { daysToGo };

// "What's left" is derived on the client from month_overview()'s cap and spent (integer
// minor units, so plain subtraction is exact). Kept in one place so every screen agrees.

export type BudgetStatus =
  | { kind: 'none'; spent: number }
  | { kind: 'left' | 'over'; spent: number; cap: number; amount: number; pct: number };

export function budgetStatus(cap: number | null | undefined, spent: number): BudgetStatus {
  if (cap == null || cap <= 0) return { kind: 'none', spent };
  const left = cap - spent;
  const pct = Math.round((spent * 100) / cap);
  return left >= 0 ? { kind: 'left', spent, cap, amount: left, pct } : { kind: 'over', spent, cap, amount: -left, pct };
}

// Even split of what's left over the remaining days, rounded down to whole units so the
// suggestion never adds up to more than the budget.
export function perDay(left: number, days = daysToGo()) {
  return Math.floor(left / Math.max(1, days) / 100) * 100;
}

// Zero-based plan: income is the pool, every budget is carved out of it, and what's left
// unassigned is planned savings. Rule of thumb (50/30/20): keep at least 20% for savings;
// under 10% is thin.
export const SAVINGS_TARGET_PCT = 20;
const SAVINGS_THIN_PCT = 10;

export type IncomePlan =
  | { kind: 'none'; budgeted: number }
  | {
      kind: 'unassigned' | 'balanced' | 'over';
      income: number;
      budgeted: number;
      // income − budgeted; negative when budgets promise more than comes in
      unassigned: number;
      budgetedPct: number;
      savingsPct: number;
      health: 'good' | 'thin' | 'over';
    };

export function incomePlan(income: number | null | undefined, budgeted: number): IncomePlan {
  if (income == null || income <= 0) return { kind: 'none', budgeted };
  const unassigned = income - budgeted;
  const budgetedPct = Math.round((budgeted * 100) / income);
  const savingsPct = Math.round((unassigned * 100) / income);
  return {
    kind: unassigned > 0 ? 'unassigned' : unassigned === 0 ? 'balanced' : 'over',
    income,
    budgeted,
    unassigned,
    budgetedPct,
    savingsPct,
    health: unassigned < 0 ? 'over' : savingsPct < SAVINGS_THIN_PCT ? 'thin' : 'good',
  };
}

// The amount that brings savings up to the target, for the "trim budgets by" hint.
export function shortOfTarget(p: IncomePlan) {
  if (p.kind === 'none') return 0;
  return Math.max(0, Math.ceil((p.income * SAVINGS_TARGET_PCT) / 100) - p.unassigned);
}

// P1-7: a starting budget for each default category, as a share of monthly income. The shares
// add up to 80%, so the 50/30/20 rule's 20% stays unassigned (planned savings). Each amount is
// rounded down to ₪50, so the total never exceeds the shares. Categories not listed (or
// renamed) start empty; people edit everything before saving.
export const SUGGESTED_SHARE_PCT: Record<string, number> = {
  Housing: 30, Groceries: 12, Kids: 6, Utilities: 5, Transport: 4, Fuel: 4, Dining: 4, Shopping: 4,
  Health: 3, Entertainment: 2, Travel: 2, Subscriptions: 1, Gifts: 1, Education: 1, Other: 1,
};
const STEP = 5000; // ₪50 in minor units

export function suggestBudgets(income: number | null | undefined, names: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (income == null || income <= 0) return out;
  for (const name of names) {
    const pct = SUGGESTED_SHARE_PCT[name];
    if (pct) out[name] = Math.floor((income * pct) / 100 / STEP) * STEP;
  }
  return out;
}
