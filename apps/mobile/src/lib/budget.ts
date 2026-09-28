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

// Days still to spend in, today included: on the 28th of a 30-day month that's 3.
export function daysToGo(now = new Date()) {
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return last - now.getDate() + 1;
}

// Even split of what's left over the remaining days, rounded down to whole units so the
// suggestion never adds up to more than the budget.
export function perDay(left: number, days = daysToGo()) {
  return Math.floor(left / Math.max(1, days) / 100) * 100;
}
