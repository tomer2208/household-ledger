// T6: which cached screens a change to a table can make stale. A Realtime event (the partner's
// phone) or one of this phone's own writes refreshes only these, not every query. The keys are
// the second part of api/queries.ts' query keys ([HH, key, ...]).
//
// A key belongs here when its query reads the table, directly or through an RPC or an embedded
// select: month_overview reads transactions, budgets, income and the savings ledger; the
// expense lists embed the category's name and the installment rule. Merchants (P1-13) aren't
// sent by Realtime; their list counts expenses and names categories, so it follows those two.

export const TABLE_KEYS = {
  transactions: ['transactions', 'transaction', 'overview', 'pending', 'templates', 'suggest', 'capture_health', 'merchants'],
  categories: ['categories', 'overview', 'transactions', 'transaction', 'pending', 'recurring', 'templates', 'suggest', 'merchants'],
  category_budgets: ['overview'],
  household_income: ['overview'],
  recurring_rules: ['recurring', 'transactions', 'transaction'],
  // a month close writes the ledger, so the closed months move with it
  savings_ledger: ['savings', 'overview', 'closes'],
  device_tokens: ['devices', 'capture_health'],
  agent_proposals: ['proposals'],
  monthly_reports: ['report', 'closes'],
} as const satisfies Record<string, readonly string[]>;

export type SyncTable = keyof typeof TABLE_KEYS;
export const SYNC_TABLES = Object.keys(TABLE_KEYS) as SyncTable[];

// The keys to refresh after changes to `tables`, each once. Null means "everything": a table
// this map doesn't know, so nothing that might depend on it is left stale.
export function keysFor(tables: Iterable<string>): string[] | null {
  const out = new Set<string>();
  for (const table of tables) {
    const keys = (TABLE_KEYS as Record<string, readonly string[]>)[table];
    if (!keys) return null;
    keys.forEach((k) => out.add(k));
  }
  return [...out];
}

// A burst of changes (a month close writes several tables, an import many rows) becomes one
// refresh once it has been quiet for `ms`, covering every table that changed.
export function batchChanges(flush: (tables: SyncTable[]) => void, ms = 300) {
  const changed = new Set<SyncTable>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    add(table: SyncTable) {
      changed.add(table);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const tables = [...changed];
        changed.clear();
        flush(tables);
      }, ms);
    },
    cancel: () => clearTimeout(timer),
  };
}
