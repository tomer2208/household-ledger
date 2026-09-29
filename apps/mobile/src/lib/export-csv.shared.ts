import { supabase } from './supabase';

// G10: every expense of the household as CSV, for the person's own records or to move
// elsewhere. Pages through all rows (the list screen only loads the latest 300).
export async function buildExpensesCsv(names: Map<string, string>): Promise<string> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('transactions')
      .select('occurred_at,title,raw_merchant,amount_minor,currency,amount_base_minor,status,source,note,created_by,categories(name)')
      .is('deleted_at', null)
      .order('occurred_at', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const header = ['date', 'type', 'title', 'as_charged', 'amount', 'currency', 'amount_in_base', 'category', 'status', 'source', 'added_by', 'note'];
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [
      r.occurred_at,
      (r.amount_minor as number) < 0 ? 'refund' : 'expense',
      r.title,
      r.raw_merchant,
      ((r.amount_minor as number) / 100).toFixed(2),
      r.currency,
      ((r.amount_base_minor as number) / 100).toFixed(2),
      (r.categories as { name?: string } | null)?.name,
      r.status,
      r.source,
      r.created_by ? (names.get(r.created_by as string) ?? '') : '',
      r.note,
    ]
      .map(cell)
      .join(','),
  );
  return [header.join(','), ...lines].join('\n');
}
