import { keepPreviousData, type QueryClient, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useEffect } from 'react';

import { useSession } from './session';
import type {
  AgentRun,
  CaptureHealth,
  Category,
  MonthlyReport,
  Proposal,
  Device,
  Household,
  Member,
  MonthClose,
  Overview,
  RecurringRule,
  SavingsEntry,
  Transaction,
} from './types';
import { batchChanges, keysFor, SYNC_TABLES, type SyncTable } from '@/lib/cache-sync';
import { monthOfInstant } from '@/lib/dates';
import { lang, type Lang } from '@/lib/i18n';
import { applyTxChange, findTx, holdTxCaches, restoreTxCaches, type Snapshot } from '@/lib/optimistic';
import type { ServerFilter } from '@/lib/search-filter';
import { rpc, supabase } from '@/lib/supabase';

// Every household query key starts with 'hh'. A write, local or the partner's via Realtime,
// refreshes the keys that read the tables it changed (lib/cache-sync), or all of them.
const HH = 'hh';

function refresh(qc: QueryClient, tables?: Iterable<string>) {
  const keys = tables ? keysFor(tables) : null;
  if (!keys) return qc.invalidateQueries({ queryKey: [HH] });
  return Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [HH, k] })));
}

// A Postgres argument can always be null, but the generated types only say so for arguments with
// a default (as optional). This passes null to one without a default, where the function expects it.
const SQL_NULL = null as unknown as string;

// The error keeps its code (SQLSTATE or PostgREST's PGRSTxxx), which decides a retry (lib/errors).
async function must<T>(p: PromiseLike<{ data: T; error: { message: string; code?: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
}

// One literal (not joined with +), so the typed client can read which columns come back.
const TX_COLUMNS =
  'id,title,raw_merchant,amount_minor,currency,amount_base_minor,fx_rate,fx_source,occurred_at,budget_month,status,source,category_id,note,card_label,created_by,recurring_rule_id,classification,categories(name,sf_symbol),recurring_period,recurring_rules(installment_count,installment_first)';

// ───────── reads ─────────

export function useHousehold() {
  const { session } = useSession();
  return useQuery({
    queryKey: [HH, 'household', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const members = await must(
        supabase.from('household_members').select('household_id,user_id,display_name,joined_at,language').is('removed_at', null),
      );
      const mine = (members as (Member & { household_id: string })[]).find((m) => m.user_id === session!.user.id);
      if (!mine) return { household: null, members: [] as Member[], me: null };
      const household = await must(
        supabase.from('households').select('id,name,base_currency,timezone,ai_consent_at,created_at').eq('id', mine.household_id).single(),
      );
      return {
        household: household as Household,
        members: members as Member[],
        me: mine as Member,
      };
    },
  });
}

export function useOverview(month?: string) {
  return useQuery({
    queryKey: [HH, 'overview', month ?? 'current'],
    // Stepping between months keeps the last one on screen until the next arrives.
    placeholderData: keepPreviousData,
    queryFn: async () => (await must(rpc('month_overview', month ? { p_month: month } : {}))) as Overview,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: [HH, 'categories'],
    queryFn: async () =>
      (await must(
        supabase
          .from('categories')
          .select('id,name,sf_symbol,kind,sort_order,archived_at,budget_acknowledged,created_via')
          .eq('kind', 'expense')
          .order('sort_order')
          .order('name'),
      )) as Category[],
  });
}

// G5: who added an expense, once there is more than one person to tell apart.
// Returns null for a one-person household so rows stay uncluttered.
export function useMemberNames() {
  const members = useHousehold().data?.members ?? [];
  if (members.length < 2) return null;
  return new Map(members.map((m) => [m.user_id, m.display_name]));
}

export const TX_PAGE = 50;
type TxCursor = { at: string; id: string } | null;

// R7: every expense, a page at a time, searched and filtered on the server. The next page
// starts after the last row of the previous one, and a refetch (Realtime, Undo) recomputes each
// cursor from fresh data, so rows are never repeated or skipped.
// P1-9: `filter` is lib/search-filter's serverFilter (find_transactions, migration 36).
export function useTransactionPages(filter: ServerFilter) {
  const filtered = Object.keys(filter).length > 0;
  return useInfiniteQuery({
    queryKey: [HH, 'transactions', filter],
    initialPageParam: null as TxCursor,
    queryFn: async ({ pageParam }) =>
      (await must(
        rpc('find_transactions', {
          p_filter: filter,
          // left out on the first page: both default to null
          p_before_at: pageParam?.at,
          p_before_id: pageParam?.id,
          p_limit: TX_PAGE,
        }),
      )) as Transaction[],
    getNextPageParam: (last): TxCursor | undefined =>
      last.length < TX_PAGE ? undefined : { at: last[last.length - 1].occurred_at, id: last[last.length - 1].id },
    // While a new search loads, keep showing the previous results rather than an empty list.
    placeholderData: keepPreviousData,
    // Only the plain list is worth keeping offline for a week; searches are short-lived.
    gcTime: filtered ? 5 * 60_000 : undefined,
  });
}

export type TxSummary = { count: number; total_minor: number; spent_minor: number; refunded_minor: number };

// P1-9: what every match adds up to, not just the pages loaded, in the base currency.
export function useTransactionSummary(filter: ServerFilter, enabled = true) {
  return useQuery({
    queryKey: [HH, 'transactions', 'summary', filter],
    enabled,
    queryFn: async () => (await must(rpc('summarize_transactions', { p_filter: filter }))) as TxSummary,
    placeholderData: keepPreviousData,
    gcTime: 5 * 60_000,
  });
}

export function useTransaction(id: string) {
  return useQuery({
    queryKey: [HH, 'transaction', id],
    queryFn: async () =>
      (await must(supabase.from('transactions').select(TX_COLUMNS).eq('id', id).single())) as Transaction,
  });
}

export function usePendingReview() {
  return useQuery({
    queryKey: [HH, 'pending'],
    queryFn: async () =>
      (await must(
        supabase
          .from('transactions')
          .select(TX_COLUMNS)
          .eq('status', 'pending_review')
          .is('deleted_at', null)
          .order('occurred_at', { ascending: false }),
      )) as Transaction[],
  });
}

export function useRecurring() {
  return useQuery({
    queryKey: [HH, 'recurring'],
    queryFn: async () =>
      (await must(
        supabase
          .from('recurring_rules')
          .select(
            'id,title,category_id,amount_minor,currency,amount_kind,interval_months,day_of_month,start_date,end_date,next_run_date,paused,categories(name,sf_symbol),installment_count,installment_first',
          )
          .is('deleted_at', null)
          .order('next_run_date'),
      )) as RecurringRule[],
  });
}

export function useDevices() {
  return useQuery({
    queryKey: [HH, 'devices'],
    queryFn: async () =>
      (await must(
        supabase
          .from('device_tokens')
          .select('id,user_id,label,created_at,last_used_at,revoked_at')
          .order('created_at', { ascending: false }),
      )) as Device[],
  });
}

// R9: which Shortcuts have gone quiet. Refreshed with everything else (Realtime on
// transactions and device_tokens), and every hour while the app stays open.
export function useCaptureHealth() {
  return useQuery({
    queryKey: [HH, 'capture_health'],
    queryFn: async () => (await must(rpc('capture_health'))) as CaptureHealth[],
    refetchInterval: 3_600_000,
  });
}

export function useSavingsLedger() {
  return useQuery({
    queryKey: [HH, 'savings'],
    queryFn: async () =>
      (await must(
        supabase
          .from('savings_ledger')
          .select('id,entry_type,budget_month,amount_minor,reason,created_at')
          .order('created_at', { ascending: false }),
      )) as SavingsEntry[],
  });
}

export function useMonthCloses() {
  return useQuery({
    queryKey: [HH, 'closes'],
    queryFn: async () =>
      (await must(
        supabase
          .from('month_closes')
          .select('budget_month,total_cap_minor,total_spent_minor,net_minor,snapshot,closed_at')
          .order('budget_month', { ascending: false }),
      )) as MonthClose[],
  });
}

// ───────── realtime ─────────

// Silent background sync (Batch 2 §4): a change by the partner refreshes this device. T6: only
// the screens that read the changed tables, and a burst of changes (a month close, an import)
// in one refresh after it settles.
export function useRealtimeSync(householdId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!householdId) return;
    const filter = `household_id=eq.${householdId}`;
    const channel = supabase.channel(`hh:${householdId}`);
    const batch = batchChanges((tables) => refresh(qc, tables));
    for (const table of SYNC_TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, () => batch.add(table));
    }
    channel.subscribe();
    return () => {
      batch.cancel();
      supabase.removeChannel(channel);
    };
  }, [householdId, qc]);
}

// ───────── writes ─────────

// `tables`: what the write changes, so only what reads them is refreshed. Left out, everything is.
function useHHMutation<V, R = unknown>(fn: (v: V) => Promise<R>, tables?: SyncTable[]) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => refresh(qc, tables) });
}

// T7: an expense write that shows at once. `change` says what the expense was and will be; the
// caches move there before the request, go back if it fails, and are refreshed when it settles.
// The requests go out one after another, so an Undo tapped before its delete reached the server
// lands after it; the screen changes at once either way. While another expense write is still
// out, the refresh waits for the last one, so a row never blinks back to an in-between state.
let txQueue: Promise<unknown> = Promise.resolve();
const TX_WRITE = ['tx-write'];

function useTxMutation<V, R = unknown>(
  fn: (v: V) => Promise<R>,
  change: (v: V, qc: QueryClient) => { before: Transaction | null; after: Transaction | null } | null,
) {
  const qc = useQueryClient();
  return useMutation<R, Error, V, { snapshot: Snapshot }>({
    mutationKey: TX_WRITE,
    mutationFn: (v) => {
      const run = txQueue.catch(() => undefined).then(() => fn(v));
      txQueue = run;
      return run;
    },
    onMutate: async (v) => {
      const snapshot = await holdTxCaches(qc);
      const c = change(v, qc);
      if (c) applyTxChange(qc, c.before, c.after);
      return { snapshot };
    },
    onError: (_e, _v, ctx) => restoreTxCaches(qc, ctx?.snapshot),
    onSettled: () => (qc.isMutating({ mutationKey: TX_WRITE }) > 1 ? undefined : refresh(qc, ['transactions'])),
  });
}

// What a deleted expense was, for an Undo that puts it straight back.
const recentlyDeleted = new Map<string, Transaction>();

export const useCreateHousehold = () =>
  useHHMutation((v: { name: string; currency: string; displayName: string; aiConsent: boolean; language: Lang }) =>
    must(
      rpc('create_household', {
        p_name: v.name,
        p_base_currency: v.currency,
        p_display_name: v.displayName,
        p_language: v.language,
      }),
    ).then(
      async (id) => {
        if (v.aiConsent) {
          await must(supabase.from('households').update({ ai_consent_at: new Date().toISOString() }).eq('id', id as string));
        }
        return id;
      },
    ),
  );

// P1-6: the server writes push alerts, Shortcut replies and reports in each member's language,
// so it learns this phone's language whenever it differs from what it has.
export function useLanguageSync(me: Member | null | undefined) {
  const current = lang();
  const meId = me?.user_id;
  const stored = me?.language;
  useEffect(() => {
    if (!meId || stored === current) return;
    rpc('set_my_language', { p_language: current }).then(({ error }) => {
      if (error) console.warn('Language sync failed', error.message);
    });
  }, [meId, stored, current]);
}

export const useJoinHousehold = () =>
  useHHMutation((v: { code: string; displayName: string }) =>
    // A wrong code comes back as null (migration 35 counts it toward the attempt limit).
    must(rpc('join_household', { p_code: v.code, p_display_name: v.displayName })).then((id) => {
      if (!id) throw new Error('invalid or expired invite code');
      return id;
    }),
  );

export const useSetAiConsent = () =>
  useHHMutation((v: { householdId: string; on: boolean }) =>
    must(
      supabase
        .from('households')
        .update({ ai_consent_at: v.on ? new Date().toISOString() : null })
        .eq('id', v.householdId),
    ),
  );

// G4: equal rights, so any member can remove another; the server revokes their Shortcut.
export const useRemoveMember = () =>
  useHHMutation((userId: string) => must(rpc('remove_member', { p_user_id: userId })));

// The last member leaving deletes the household ('deleted'); otherwise 'left'.
export const useLeaveHousehold = () =>
  useHHMutation(() => must(rpc('leave_household')) as Promise<'left' | 'deleted'>);

export const useCreateInvite = () => useHHMutation(() => must(rpc('create_invite')) as Promise<string>);

export type NewTransaction = {
  householdId: string;
  userId: string;
  title: string;
  amountMinor: number;
  currency: string;
  categoryId: string;
  occurredAt?: string;
  note?: string | null;
  rawMerchant?: string | null;
  // Made on the phone, so the row shown before the server answers is the row it saves.
  id?: string;
};

export const newTransactionId = () => Crypto.randomUUID();

// The row as the server will return it, for showing at once. Only in the base currency: another
// currency's converted amount is the server's to work out, so that expense waits for it.
function draftRow(v: NewTransaction & { id: string; occurredAt: string }, qc: QueryClient): Transaction | null {
  const hh = qc.getQueriesData<{ household: Household | null }>({ queryKey: [HH, 'household'] })[0]?.[1];
  const base = hh?.household?.base_currency;
  const cat = qc.getQueryData<Category[]>([HH, 'categories'])?.find((x) => x.id === v.categoryId);
  if (!base || v.currency !== base || !cat) return null;
  return {
    id: v.id, title: v.title, raw_merchant: v.rawMerchant ?? null, amount_minor: v.amountMinor, currency: v.currency,
    amount_base_minor: v.amountMinor, fx_rate: 1, fx_source: 'identity', occurred_at: v.occurredAt,
    budget_month: monthOfInstant(new Date(v.occurredAt)), status: 'confirmed', source: 'manual', category_id: v.categoryId,
    note: v.note ?? null, card_label: null, created_by: v.userId, recurring_rule_id: null, classification: null,
    categories: { name: cat.name, sf_symbol: cat.sf_symbol }, installment: null,
  } as Transaction;
}

// Resolves to the new expense's id, so it can be split into installments right after.
export const useAddTransaction = () =>
  useTxMutation(
    (v: NewTransaction) =>
      must(
        supabase.from('transactions').insert({
          id: v.id,
          household_id: v.householdId,
          created_by: v.userId,
          source: 'manual',
          title: v.title,
          amount_minor: v.amountMinor,
          currency: v.currency,
          category_id: v.categoryId,
          occurred_at: v.occurredAt ?? new Date().toISOString(),
          note: v.note ?? null,
          raw_merchant: v.rawMerchant ?? null,
        }).select('id').single(),
      ).then((row) => (row as { id: string }).id),
    (v, qc) => {
      if (!v.id) return null;
      const after = draftRow({ ...v, id: v.id, occurredAt: v.occurredAt ?? new Date().toISOString() }, qc);
      return after ? { before: null, after } : null;
    },
  );

// P1-2: split an expense into monthly installments (migration 33). All or nothing.
export const useCreateInstallments = () =>
  useHHMutation(
    (v: { transactionId: string; count: number }) =>
      must(rpc('create_installments', { p_transaction_id: v.transactionId, p_count: v.count })),
    ['transactions', 'recurring_rules'],
  );

type TxPatch = Partial<Pick<Transaction, 'title' | 'amount_minor' | 'category_id' | 'note' | 'status' | 'occurred_at'>>;

export const useUpdateTransaction = () =>
  useTxMutation(
    (v: { id: string; patch: TxPatch }) => must(supabase.from('transactions').update(v.patch).eq('id', v.id)),
    (v, qc) => {
      const before = findTx(qc, v.id);
      if (!before) return null;
      const after: Transaction = { ...before, ...v.patch };
      if (v.patch.occurred_at) after.budget_month = monthOfInstant(new Date(v.patch.occurred_at));
      if (v.patch.category_id && v.patch.category_id !== before.category_id) {
        const cat = qc.getQueryData<Category[]>([HH, 'categories'])?.find((x) => x.id === v.patch.category_id);
        if (cat) after.categories = { name: cat.name, sf_symbol: cat.sf_symbol };
      }
      if (v.patch.amount_minor != null) {
        // the server keeps the rate captured when it was added (1 in the base currency)
        after.amount_base_minor = Math.round(v.patch.amount_minor * before.fx_rate);
      }
      return { before, after };
    },
  );

export const useDeleteTransaction = () =>
  useTxMutation(
    (id: string) => must(supabase.from('transactions').update({ deleted_at: new Date().toISOString() }).eq('id', id)),
    (id, qc) => {
      const before = findTx(qc, id);
      if (!before) return null;
      recentlyDeleted.set(id, before);
      return { before, after: null };
    },
  );

export const useRestoreTransaction = () =>
  useTxMutation(
    (id: string) => must(supabase.from('transactions').update({ deleted_at: null }).eq('id', id)),
    (id) => {
      const after = recentlyDeleted.get(id);
      recentlyDeleted.delete(id);
      return after ? { before: null, after } : null;
    },
  );

export const useReviewTransaction = () =>
  useHHMutation((v: { id: string; categoryName?: string; newCategoryName?: string; title: string }) =>
    must(
      rpc('review_transaction', {
        p_transaction_id: v.id,
        p_category_name: v.categoryName ?? SQL_NULL,
        p_new_category_name: v.newCategoryName ?? SQL_NULL,
        p_title: v.title,
      }),
    ),
  );

export const useSetBudget = () =>
  useHHMutation(
    (v: { categoryId: string; capMinor: number }) =>
      must(rpc('set_category_budget', { p_category_id: v.categoryId, p_cap_minor: v.capMinor })),
    ['category_budgets', 'categories'],
  );

// P1-7: the setup wizard's budgets and income in one all-or-nothing call (migration 30).
export const useSetBudgetsBulk = () =>
  useHHMutation((v: { budgets: { categoryId: string; capMinor: number }[]; income: number | null }) =>
    must(
      rpc('set_budgets_bulk', {
        p_budgets: v.budgets.map((b) => ({ category_id: b.categoryId, cap_minor: b.capMinor })),
        p_income: v.income ?? undefined, // left out (its default, null) keeps the income as it is
      }),
    ),
  );

// P1-8: the household's most repeated manual expenses (migration 31), offered on Add.
export type ExpenseTemplate = { title: string; category_id: string; amount_minor: number; currency: string; uses: number };
export function useExpenseTemplates() {
  return useQuery({
    queryKey: [HH, 'templates'],
    queryFn: async () => (await must(rpc('recent_expense_templates'))) as ExpenseTemplate[],
  });
}

// P1-8: the category a typed title most likely belongs to, from what the household taught
// the app (learned merchants, past titles), or null. Short-lived: it changes as people type.
export function useSuggestedCategory(title: string) {
  const t = title.trim();
  return useQuery({
    queryKey: [HH, 'suggest', t.toLowerCase()],
    enabled: t.length >= 2,
    staleTime: 60_000,
    gcTime: 60_000,
    queryFn: async () =>
      (await must(rpc('suggest_category', { p_title: t }))) as { category_id: string; source: string } | null,
  });
}

// 0 clears the income. Applies from the current month on, like a budget change.
export const useSetIncome = () =>
  useHHMutation((amountMinor: number) => must(rpc('set_monthly_income', { p_amount_minor: amountMinor })), [
    'household_income',
  ]);

export type DeleteCategoryResult = { action: 'delete' | 'archive' | 'blocked'; transactions: number; recurring: number };

// Swipe → Delete (migration 22). The server decides: a never-used category is deleted, one
// with history is archived, active recurring rules block it. `preview` asks without changing
// anything; `hide` drops it from the cached lists while the Undo toast is up.
export function useCategoryDelete() {
  const qc = useQueryClient();
  const call = (id: string, dryRun: boolean) =>
    must(rpc('delete_category', { p_category_id: id, p_dry_run: dryRun })) as Promise<DeleteCategoryResult>;
  return {
    preview: (id: string) => call(id, true),
    commit: async (id: string) => {
      try {
        return await call(id, false);
      } finally {
        await qc.invalidateQueries({ queryKey: [HH] });
      }
    },
    hide: (id: string) => {
      qc.setQueryData<Category[]>([HH, 'categories'], (old) => old?.filter((x) => x.id !== id));
      qc.setQueryData<Overview>([HH, 'overview', 'current'], (old) =>
        old ? { ...old, categories: old.categories.filter((x) => x.id !== id) } : old,
      );
    },
    restore: () => qc.invalidateQueries({ queryKey: [HH] }),
  };
}

export const useSaveCategory = () =>
  useHHMutation(
    (v: { id?: string; householdId: string; name: string; sfSymbol: string; archived?: boolean; acknowledge?: boolean }) =>
      v.id
        ? must(
            supabase
              .from('categories')
              .update({
                name: v.name,
                sf_symbol: v.sfSymbol,
                ...(v.archived !== undefined ? { archived_at: v.archived ? new Date().toISOString() : null } : {}),
                ...(v.acknowledge ? { budget_acknowledged: true } : {}),
              })
              .eq('id', v.id),
          )
        : must(
            supabase
              .from('categories')
              .insert({ household_id: v.householdId, name: v.name, sf_symbol: v.sfSymbol, sort_order: 50 }),
          ),
  );

export type RecurringInput = {
  id?: string;
  householdId: string;
  title: string;
  categoryId: string;
  amountMinor: number;
  currency: string;
  amountKind: 'fixed' | 'estimated';
  intervalMonths: number;
  dayOfMonth: number;
  startDate: string;
  paused?: boolean;
};

export const useSaveRecurring = () =>
  useHHMutation((v: RecurringInput) => {
    const row = {
      title: v.title,
      category_id: v.categoryId,
      amount_minor: v.amountMinor,
      currency: v.currency,
      amount_kind: v.amountKind,
      interval_months: v.intervalMonths,
      day_of_month: v.dayOfMonth,
      start_date: v.startDate,
      paused: v.paused ?? false,
    };
    return v.id
      ? must(supabase.from('recurring_rules').update(row).eq('id', v.id))
      : must(supabase.from('recurring_rules').insert({ ...row, household_id: v.householdId }));
  });

export const useDeleteRecurring = () =>
  useHHMutation(
    (id: string) => must(supabase.from('recurring_rules').update({ deleted_at: new Date().toISOString() }).eq('id', id)),
    ['recurring_rules'],
  );

export const useCreateDeviceToken = () =>
  useHHMutation(async (label: string) => {
    const rows = (await must(rpc('create_device_token', { p_label: label }))) as { id: string; token: string }[];
    return rows[0];
  });

export const useRevokeDevice = () =>
  useHHMutation((id: string) => must(rpc('revoke_device_token', { p_id: id })), ['device_tokens']);

export const useAddSavingsEntry = () =>
  useHHMutation(
    (v: { amountMinor: number; reason: string }) =>
      must(rpc('add_savings_entry', { p_amount_minor: v.amountMinor, p_reason: v.reason })),
    ['savings_ledger'],
  );

// ───────── AI (Phase 4) ─────────

export function useProposals() {
  return useQuery({
    queryKey: [HH, 'proposals'],
    queryFn: async () =>
      (await must(
        supabase
          .from('agent_proposals')
          .select('id,kind,payload,rationale,status,created_at')
          .eq('status', 'pending')
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false }),
      )) as Proposal[],
  });
}

export const useDecideProposal = () =>
  useHHMutation((v: { id: string; approve: boolean }) =>
    must(rpc('decide_proposal', { p_id: v.id, p_approve: v.approve })) as Promise<{ status: string; reason?: string }>,
  );

export function useMonthlyReport(month: string) {
  return useQuery({
    queryKey: [HH, 'report', month],
    queryFn: async () =>
      (await must(
        supabase
          .from('monthly_reports')
          .select('id,budget_month,metrics,narrative,narratives,status,updated_at')
          .eq('budget_month', month)
          .maybeSingle(),
      )) as MonthlyReport | null,
    // A report being written refreshes itself until it lands.
    refetchInterval: (q) => (q.state.data && ['pending', 'generating'].includes(q.state.data.status) ? 4000 : false),
  });
}

export const useRequestReport = () =>
  useHHMutation((month: string) => must(rpc('request_monthly_report', { p_month: month })));

// G6: this month's estimated AI cost against the household's cap (USD).
export function useAiUsage() {
  return useQuery({
    queryKey: [HH, 'ai_usage'],
    queryFn: async () => (await must(rpc('my_ai_usage'))) as { cost_usd: number; cap_usd: number },
  });
}

export function useAgentRuns() {
  return useQuery({
    queryKey: [HH, 'agent_runs'],
    queryFn: async () =>
      (await must(
        supabase
          .from('agent_runs')
          .select('id,agent,model,status,input_tokens,output_tokens,latency_ms,error,created_at')
          .order('created_at', { ascending: false })
          .limit(50),
      )) as AgentRun[],
  });
}
