import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { lang, type Lang } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

// Every household query key starts with 'hh', so one invalidation refreshes the app
// after any write, local or from the partner via Realtime.
const HH = 'hh';

// The error keeps its code (SQLSTATE or PostgREST's PGRSTxxx), which decides a retry (lib/errors).
async function must<T>(p: PromiseLike<{ data: T; error: { message: string; code?: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
}

const TX_COLUMNS =
  'id,title,raw_merchant,amount_minor,currency,amount_base_minor,fx_rate,fx_source,occurred_at,budget_month,' +
  'status,source,category_id,note,card_label,created_by,recurring_rule_id,classification,categories(name,sf_symbol),' +
  'recurring_period,recurring_rules(installment_count,installment_first)';

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
    queryFn: async () => (await must(supabase.rpc('month_overview', month ? { p_month: month } : {}))) as Overview,
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

// R7: every expense, a page at a time, searched and filtered on the server
// (search_transactions, migrations 26-28). The next page starts after the last row of the
// previous one, and a refetch (Realtime, Undo) recomputes each cursor from fresh data, so
// rows are never repeated or skipped.
// P1-5: `month` ('YYYY-MM-01') limits it to one budget month, e.g. from a past month on Overview.
export function useTransactionPages(query: string, categoryId: string | null, month: string | null = null) {
  return useInfiniteQuery({
    queryKey: [HH, 'transactions', query, categoryId, month],
    initialPageParam: null as TxCursor,
    queryFn: async ({ pageParam }) =>
      (await must(
        supabase.rpc('search_transactions', {
          p_query: query || null,
          p_category: categoryId,
          p_before_at: pageParam?.at ?? null,
          p_before_id: pageParam?.id ?? null,
          p_limit: TX_PAGE,
          p_month: month,
        }),
      )) as Transaction[],
    getNextPageParam: (last): TxCursor | undefined =>
      last.length < TX_PAGE ? undefined : { at: last[last.length - 1].occurred_at, id: last[last.length - 1].id },
    // While a new search loads, keep showing the previous results rather than an empty list.
    placeholderData: keepPreviousData,
    // Only the plain list is worth keeping offline for a week; searches are short-lived.
    gcTime: query || categoryId || month ? 5 * 60_000 : undefined,
  });
}

export function useTransaction(id: string) {
  return useQuery({
    queryKey: [HH, 'transaction', id],
    queryFn: async () =>
      (await must(supabase.from('transactions').select(TX_COLUMNS).eq('id', id).single())) as unknown as Transaction,
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
      )) as unknown as Transaction[],
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
      )) as unknown as RecurringRule[],
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
    queryFn: async () => (await must(supabase.rpc('capture_health'))) as CaptureHealth[],
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

// Silent background sync (Batch 2 §4): any change by the partner refreshes this device.
export function useRealtimeSync(householdId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!householdId) return;
    const filter = `household_id=eq.${householdId}`;
    const channel = supabase.channel(`hh:${householdId}`);
    for (const table of ['transactions', 'categories', 'category_budgets', 'household_income', 'recurring_rules', 'savings_ledger', 'device_tokens', 'agent_proposals', 'monthly_reports']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, () =>
        qc.invalidateQueries({ queryKey: [HH] }),
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [householdId, qc]);
}

// ───────── writes ─────────

function useHHMutation<V, R = unknown>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: [HH] }) });
}

export const useCreateHousehold = () =>
  useHHMutation((v: { name: string; currency: string; displayName: string; aiConsent: boolean; language: Lang }) =>
    must(
      supabase.rpc('create_household', {
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
    supabase.rpc('set_my_language', { p_language: current }).then(({ error }) => {
      if (error) console.warn('Language sync failed', error.message);
    });
  }, [meId, stored, current]);
}

export const useJoinHousehold = () =>
  useHHMutation((v: { code: string; displayName: string }) =>
    // A wrong code comes back as null (migration 35 counts it toward the attempt limit).
    must(supabase.rpc('join_household', { p_code: v.code, p_display_name: v.displayName })).then((id) => {
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
  useHHMutation((userId: string) => must(supabase.rpc('remove_member', { p_user_id: userId })));

// The last member leaving deletes the household ('deleted'); otherwise 'left'.
export const useLeaveHousehold = () =>
  useHHMutation(() => must(supabase.rpc('leave_household')) as Promise<'left' | 'deleted'>);

export const useCreateInvite = () => useHHMutation(() => must(supabase.rpc('create_invite')) as Promise<string>);

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
};

// Resolves to the new expense's id, so it can be split into installments right after.
export const useAddTransaction = () =>
  useHHMutation((v: NewTransaction) =>
    must(
      supabase.from('transactions').insert({
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
  );

// P1-2: split an expense into monthly installments (migration 33). All or nothing.
export const useCreateInstallments = () =>
  useHHMutation((v: { transactionId: string; count: number }) =>
    must(supabase.rpc('create_installments', { p_transaction_id: v.transactionId, p_count: v.count })),
  );

export const useUpdateTransaction = () =>
  useHHMutation((v: { id: string; patch: Partial<Pick<Transaction, 'title' | 'amount_minor' | 'category_id' | 'note' | 'status' | 'occurred_at'>> }) =>
    must(supabase.from('transactions').update(v.patch).eq('id', v.id)),
  );

export const useDeleteTransaction = () =>
  useHHMutation((id: string) =>
    must(supabase.from('transactions').update({ deleted_at: new Date().toISOString() }).eq('id', id)),
  );

export const useRestoreTransaction = () =>
  useHHMutation((id: string) => must(supabase.from('transactions').update({ deleted_at: null }).eq('id', id)));

export const useReviewTransaction = () =>
  useHHMutation((v: { id: string; categoryName?: string; newCategoryName?: string; title: string }) =>
    must(
      supabase.rpc('review_transaction', {
        p_transaction_id: v.id,
        p_category_name: v.categoryName ?? null,
        p_new_category_name: v.newCategoryName ?? null,
        p_title: v.title,
      }),
    ),
  );

export const useSetBudget = () =>
  useHHMutation((v: { categoryId: string; capMinor: number }) =>
    must(supabase.rpc('set_category_budget', { p_category_id: v.categoryId, p_cap_minor: v.capMinor })),
  );

// P1-7: the setup wizard's budgets and income in one all-or-nothing call (migration 30).
export const useSetBudgetsBulk = () =>
  useHHMutation((v: { budgets: { categoryId: string; capMinor: number }[]; income: number | null }) =>
    must(
      supabase.rpc('set_budgets_bulk', {
        p_budgets: v.budgets.map((b) => ({ category_id: b.categoryId, cap_minor: b.capMinor })),
        p_income: v.income,
      }),
    ),
  );

// P1-8: the household's most repeated manual expenses (migration 31), offered on Add.
export type ExpenseTemplate = { title: string; category_id: string; amount_minor: number; currency: string; uses: number };
export function useExpenseTemplates() {
  return useQuery({
    queryKey: [HH, 'templates'],
    queryFn: async () => (await must(supabase.rpc('recent_expense_templates'))) as ExpenseTemplate[],
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
      (await must(supabase.rpc('suggest_category', { p_title: t }))) as { category_id: string; source: string } | null,
  });
}

// 0 clears the income. Applies from the current month on, like a budget change.
export const useSetIncome = () =>
  useHHMutation((amountMinor: number) => must(supabase.rpc('set_monthly_income', { p_amount_minor: amountMinor })));

export type DeleteCategoryResult = { action: 'delete' | 'archive' | 'blocked'; transactions: number; recurring: number };

// Swipe → Delete (migration 22). The server decides: a never-used category is deleted, one
// with history is archived, active recurring rules block it. `preview` asks without changing
// anything; `hide` drops it from the cached lists while the Undo toast is up.
export function useCategoryDelete() {
  const qc = useQueryClient();
  const call = (id: string, dryRun: boolean) =>
    must(supabase.rpc('delete_category', { p_category_id: id, p_dry_run: dryRun })) as Promise<DeleteCategoryResult>;
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
  useHHMutation((id: string) =>
    must(supabase.from('recurring_rules').update({ deleted_at: new Date().toISOString() }).eq('id', id)),
  );

export const useCreateDeviceToken = () =>
  useHHMutation(async (label: string) => {
    const rows = (await must(supabase.rpc('create_device_token', { p_label: label }))) as { id: string; token: string }[];
    return rows[0];
  });

export const useRevokeDevice = () =>
  useHHMutation((id: string) => must(supabase.rpc('revoke_device_token', { p_id: id })));

export const useAddSavingsEntry = () =>
  useHHMutation((v: { amountMinor: number; reason: string }) =>
    must(supabase.rpc('add_savings_entry', { p_amount_minor: v.amountMinor, p_reason: v.reason })),
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
    must(supabase.rpc('decide_proposal', { p_id: v.id, p_approve: v.approve })) as Promise<{ status: string; reason?: string }>,
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
  useHHMutation((month: string) => must(supabase.rpc('request_monthly_report', { p_month: month })));

// G6: this month's estimated AI cost against the household's cap (USD).
export function useAiUsage() {
  return useQuery({
    queryKey: [HH, 'ai_usage'],
    queryFn: async () => (await must(supabase.rpc('my_ai_usage'))) as { cost_usd: number; cap_usd: number },
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
