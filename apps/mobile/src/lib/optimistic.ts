// T7: an expense added, edited or deleted shows at once, before the server answers. These edit
// the cached copies the screens read; the mutation (api/queries.ts) snapshots them first, puts
// them back if the server refuses, and refreshes them from the server once it answers.

import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';

import type { Overview, Transaction } from '@/api/types';

type Pages = InfiniteData<Transaction[], unknown>;

const newerFirst = (a: Transaction, b: Transaction) =>
  a.occurred_at === b.occurred_at ? (a.id < b.id ? 1 : -1) : a.occurred_at < b.occurred_at ? 1 : -1;

export function removeFromPages(data: Pages, id: string): Pages {
  if (!data.pages.some((p) => p.some((x) => x.id === id))) return data;
  return { ...data, pages: data.pages.map((p) => p.filter((x) => x.id !== id)) };
}

// In the page where its date puts it. Older than everything loaded while more pages exist: it
// is left for paging to bring, so the list never shows a row out of order.
export function insertIntoPages(data: Pages, tx: Transaction, hasMore: boolean): Pages {
  const pages = data.pages.map((p) => p.filter((x) => x.id !== tx.id));
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const last = page[page.length - 1];
    const isLast = i === pages.length - 1;
    if (!last || newerFirst(tx, last) < 0 || (isLast && !hasMore)) {
      pages[i] = [...page, tx].sort(newerFirst);
      return { ...data, pages };
    }
  }
  return { ...data, pages };
}

export function patchInPages(data: Pages, tx: Transaction): Pages {
  if (!data.pages.some((p) => p.some((x) => x.id === tx.id))) return data;
  return { ...data, pages: data.pages.map((p) => p.map((x) => (x.id === tx.id ? tx : x)).sort(newerFirst)) };
}

// What an expense adds to a month's Overview, in the base currency.
export type Spend = { month: string; categoryId: string; amount: number; pending: boolean };

export function spendOf(tx: Transaction | null | undefined): Spend | null {
  return tx ? { month: tx.budget_month, categoryId: tx.category_id, amount: tx.amount_base_minor, pending: tx.status === 'pending_review' } : null;
}

// Takes `before` out of the month and puts `after` in; the bars, totals and review count follow.
export function adjustOverview(o: Overview, before: Spend | null, after: Spend | null): Overview {
  let next = o;
  for (const [s, sign] of [[before, -1], [after, 1]] as const) {
    if (!s || s.month !== next.month) continue;
    const delta = sign * s.amount;
    const known = next.categories.some((c) => c.id === s.categoryId);
    next = {
      ...next,
      total_spent: next.total_spent + (known ? delta : 0),
      net: next.net - (known ? delta : 0),
      pending_review: Math.max(0, next.pending_review + (s.pending ? sign : 0)),
      categories: next.categories.map((c) => {
        if (c.id !== s.categoryId) return c;
        const spent = c.spent + delta;
        return { ...c, spent, pct: c.cap && c.cap > 0 ? Math.round((spent * 100) / c.cap) : c.pct };
      }),
    };
  }
  return next;
}

const HH = 'hh';
// The caches an expense appears in; snapshot, cancel and restore all of them together.
export const TX_CACHES: QueryKey[] = [[HH, 'transactions'], [HH, 'transaction'], [HH, 'overview'], [HH, 'pending']];

export function findTx(qc: QueryClient, id: string): Transaction | null {
  const detail = qc.getQueryData<Transaction>([HH, 'transaction', id]);
  if (detail) return detail;
  for (const [key, data] of qc.getQueriesData<Pages | Transaction[]>({ queryKey: [HH, 'transactions'] })) {
    if (key[2] === 'summary' || !data) continue;
    const rows = 'pages' in data ? data.pages.flat() : data;
    const hit = rows.find((x) => x.id === id);
    if (hit) return hit;
  }
  return qc.getQueryData<Transaction[]>([HH, 'pending'])?.find((x) => x.id === id) ?? null;
}

// Moves one expense from `before` to `after` in every cache (null: it didn't / no longer exists).
// The plain list (no filter) gets new rows; a filtered list only drops or updates the rows it
// has, since only the server knows what a filter matches. The refresh afterwards settles both.
export function applyTxChange(qc: QueryClient, before: Transaction | null, after: Transaction | null) {
  const id = (after ?? before)?.id;
  if (!id) return;
  for (const [key, data] of qc.getQueriesData<Pages>({ queryKey: [HH, 'transactions'] })) {
    if (key[2] === 'summary' || !data?.pages) continue;
    const plain = !key[2] || Object.keys(key[2] as object).length === 0;
    // a full last page (TX_PAGE, 50) means the server may have more
    const hasMore = (data.pages[data.pages.length - 1]?.length ?? 0) >= 50;
    let next = data;
    if (!after) next = removeFromPages(data, id);
    else if (!before) next = plain ? insertIntoPages(data, after, hasMore) : data;
    else next = patchInPages(data, after);
    if (next !== data) qc.setQueryData(key, next);
  }
  // Its details stay as they were on delete: that screen is closing, and Undo brings it back.
  if (after && qc.getQueryData([HH, 'transaction', id])) qc.setQueryData([HH, 'transaction', id], after);
  for (const [key, data] of qc.getQueriesData<Overview>({ queryKey: [HH, 'overview'] })) {
    if (data) qc.setQueryData(key, adjustOverview(data, spendOf(before), spendOf(after)));
  }
  qc.setQueryData<Transaction[]>([HH, 'pending'], (old) =>
    old && (!after || after.status !== 'pending_review') ? old.filter((x) => x.id !== id) : old,
  );
}

export type Snapshot = [QueryKey, unknown][];

export async function holdTxCaches(qc: QueryClient): Promise<Snapshot> {
  await Promise.all(TX_CACHES.map((queryKey) => qc.cancelQueries({ queryKey })));
  return TX_CACHES.flatMap((queryKey) => qc.getQueriesData({ queryKey }));
}

export function restoreTxCaches(qc: QueryClient, snapshot: Snapshot | undefined) {
  snapshot?.forEach(([key, data]) => qc.setQueryData(key, data));
}
