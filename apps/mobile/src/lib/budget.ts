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
// rounded down to ₪50, so the total never exceeds the shares. Keyed by the default categories'
// icons (create_household), which are the same in Hebrew and English households; any other
// category starts empty. People edit everything before saving.
export const SUGGESTED_SHARE_PCT: Record<string, number> = {
  house: 30, // Housing
  cart: 12, // Groceries
  'figure.and.child.holdinghands': 6, // Kids
  bolt: 5, // Utilities
  car: 4, // Transport
  fuelpump: 4, // Fuel
  'fork.knife': 4, // Dining
  bag: 4, // Shopping
  'cross.case': 3, // Health
  popcorn: 2, // Entertainment
  airplane: 2, // Travel
  'arrow.triangle.2.circlepath': 1, // Subscriptions
  gift: 1, // Gifts
  graduationcap: 1, // Education
  'ellipsis.circle': 1, // Other
};
const STEP = 5000; // ₪50 in minor units

// By icon (sf_symbol): the suggested budget for each default category that has one.
export function suggestBudgets(income: number | null | undefined, symbols: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (income == null || income <= 0) return out;
  for (const symbol of symbols) {
    const pct = SUGGESTED_SHARE_PCT[symbol];
    if (pct) out[symbol] = Math.floor((income * pct) / 100 / STEP) * STEP;
  }
  return out;
}

// P1-17: what the month-end forecast says, for the line on Overview. With budgets it is how far
// over or under the total budget the month is heading; without, just where spending is heading.
export type ForecastSummary =
  | { kind: 'over' | 'under'; amount: number; total: number }
  | { kind: 'spend'; total: number }
  | null;

export function forecastSummary(
  f: { total: number; spent: number; upcoming: number } | null | undefined,
  totalCap: number,
): ForecastSummary {
  // Nothing spent and nothing due: no basis for a forecast yet.
  if (!f || (f.spent === 0 && f.upcoming === 0)) return null;
  if (totalCap <= 0) return { kind: 'spend', total: f.total };
  const diff = f.total - totalCap;
  return { kind: diff > 0 ? 'over' : 'under', amount: Math.abs(diff), total: f.total };
}

// P1-11: a category's months on its screen: this month against the average of the months before
// it (null change when there is nothing before to compare with).
export type TrendMonth = { month: string; spent: number; cap: number | null };

export function trendSummary(months: TrendMonth[]) {
  const now = months[months.length - 1]?.spent ?? 0;
  const before = months.slice(0, -1);
  const avg = before.length ? Math.round(before.reduce((a, x) => a + x.spent, 0) / before.length) : 0;
  return { now, avg, pct: avg > 0 ? Math.round(((now - avg) * 100) / avg) : null };
}

// P1-14: what this month's close is on its way to move into savings: what the budgets don't use
// plus income never put in a budget, less what rolls over into next month instead. A category
// with rollover carries its remainder if it had a budget of its own; an overspend carries too,
// unless the category says otherwise (then savings cover it), as app.close_month does.
type ToSavingsCategory = { id: string; cap: number | null; base_cap: number | null; spent: number; rollover: boolean };

export function headingToSavings(
  o: { net: number; unassigned: number | null; categories: ToSavingsCategory[] },
  rollsOverspend: (categoryId: string) => boolean,
) {
  let carried = 0;
  for (const c of o.categories) {
    if (!c.rollover || !(c.base_cap && c.base_cap > 0)) continue;
    const left = (c.cap ?? 0) - c.spent;
    if (left >= 0 || rollsOverspend(c.id)) carried += left;
  }
  return o.net + (o.unassigned ?? 0) - carried;
}
