// Shapes the app reads. T5: a table's row is picked from the generated schema types
// (database.types.ts, `supabase gen types`; CI fails when they are stale), so a renamed or
// dropped column breaks the build here instead of a screen. Text columns that a CHECK limits to
// a few values are narrowed to those values, which the generator can't see.
// What an RPC returns as JSON (Overview, report metrics, capture health) is described by hand,
// next to the function that builds it.

import type { Tables } from './database.types';

// `R` with the columns in `N` replaced by narrower types.
type Narrow<R, N extends Partial<Record<keyof R, unknown>>> = Omit<R, keyof N> & N;

export type Household = Pick<Tables<'households'>, 'id' | 'name' | 'base_currency' | 'timezone' | 'ai_consent_at' | 'created_at'>;

// language: what the server writes this member's alerts and reports in (P1-6).
// notify_reports: whether this member gets the "report is ready" notification (P1-19).
export type Member = Pick<Tables<'household_members'>, 'user_id' | 'display_name' | 'joined_at'> & {
  language?: 'en' | 'he';
  notify_reports?: boolean;
};

export type Category = Narrow<
  Pick<
    Tables<'categories'>,
    | 'id' | 'name' | 'sf_symbol' | 'kind' | 'sort_order' | 'archived_at' | 'budget_acknowledged' | 'created_via'
    | 'rollover' | 'rollover_overspend'
  >,
  { kind: 'expense' | 'savings'; created_via: 'seed' | 'app' | 'shortcut' }
>;

export type TxStatus = 'confirmed' | 'pending_review' | 'estimated';
export type TxSource = 'apple_pay' | 'manual' | 'recurring';

export type Transaction = Narrow<
  Pick<
    Tables<'transactions'>,
    | 'id' | 'title' | 'raw_merchant' | 'amount_minor' | 'currency' | 'amount_base_minor' | 'fx_rate' | 'fx_source'
    | 'occurred_at' | 'budget_month' | 'status' | 'source' | 'category_id' | 'note' | 'card_label' | 'created_by'
    | 'recurring_rule_id' | 'classification'
  >,
  {
    fx_source: 'identity' | 'daily' | 'manual';
    status: TxStatus;
    source: TxSource;
    classification: { method?: string; confidence?: number } | null;
  }
> & {
  categories: Pick<Tables<'categories'>, 'name' | 'sf_symbol'> | null;
  // P1-2: payment k of n for installments. Lists get it from find_transactions; details
  // compute it from the embedded rule.
  installment?: { no: number; count: number } | null;
  recurring_period?: Tables<'transactions'>['recurring_period'];
  recurring_rules?: Pick<Tables<'recurring_rules'>, 'installment_count' | 'installment_first'> | null;
};

export type OverviewCategory = {
  id: string;
  name: string;
  sf_symbol: string;
  // P1-14 (migration 44): cap is the month's budget including what carried in from last month
  // (carry, negative after an overspend); base_cap is the budget that was set, which the category
  // screen edits.
  cap: number | null;
  base_cap: number | null;
  carry: number;
  rollover: boolean;
  spent: number;
  pct: number | null;
  no_budget: boolean;
  // P1-17: where this category is heading by month end (current month only; null otherwise).
  forecast?: number | null;
};

// P1-17 (migration 38): spent so far + recurring payments still due + the rest of the month at
// this month's pace (blended with the months before in its first days). Current month only.
export type Forecast = { day: number; days: number; spent: number; upcoming: number; rest: number; total: number };

export type Overview = {
  month: string;
  closed: boolean;
  currency: string;
  // Combined monthly income, null until set. unassigned = income − total_base_cap (null without
  // income): income is planned against the budgets set, not what carried in.
  income: number | null;
  unassigned: number | null;
  // total_cap and net include what carried in (total_carry); total_base_cap doesn't.
  total_cap: number;
  total_base_cap: number;
  total_carry: number;
  total_spent: number;
  net: number;
  savings_balance: number;
  pending_review: number;
  forecast?: Forecast | null;
  categories: OverviewCategory[];
};

export type RecurringRule = Narrow<
  Pick<
    Tables<'recurring_rules'>,
    | 'id' | 'title' | 'category_id' | 'amount_minor' | 'currency' | 'amount_kind' | 'interval_months' | 'day_of_month'
    | 'start_date' | 'end_date' | 'next_run_date' | 'paused' | 'installment_count' | 'installment_first'
  >,
  { amount_kind: 'fixed' | 'estimated' }
> & { categories: Pick<Tables<'categories'>, 'name' | 'sf_symbol'> | null };

export type Device = Pick<Tables<'device_tokens'>, 'id' | 'user_id' | 'label' | 'created_at' | 'last_used_at' | 'revoked_at'>;

export type SavingsEntry = Narrow<
  Pick<Tables<'savings_ledger'>, 'id' | 'entry_type' | 'budget_month' | 'amount_minor' | 'reason' | 'created_at'>,
  { entry_type: 'month_close' | 'late_adjustment' | 'manual' | 'unassigned_income' }
>;

export type MonthClose = Narrow<
  Pick<Tables<'month_closes'>, 'budget_month' | 'total_cap_minor' | 'total_spent_minor' | 'net_minor' | 'carried_minor' | 'snapshot' | 'closed_at'>,
  // carry_in / carry_out: what came from the month before and went on to the next (P1-14);
  // closes before migration 44 don't have them.
  { snapshot: { category_id: string; name: string; cap: number; spent: number; carry_in?: number; carry_out?: number }[] }
>;

export type Proposal = Narrow<
  Pick<Tables<'agent_proposals'>, 'id' | 'kind' | 'payload' | 'rationale' | 'status' | 'created_at'>,
  {
    kind: 'create_recurring' | 'update_estimate' | 'adjust_budget' | 'recategorize_merchant' | 'flag_duplicate';
    payload: Record<string, unknown>;
    // texts: the same card per language (P1-6); text is the household's main language.
    rationale: { text: string; texts?: Partial<Record<'en' | 'he', string>>; evidence: Record<string, unknown>; priority?: number };
    status: 'pending' | 'approved' | 'rejected' | 'expired' | 'failed';
  }
>;

export type ReportMetrics = {
  month: string;
  currency: string;
  totals: Record<string, number>;
  categories: { key: string; id: string; name: string; cap: number; spent: number; pct: number | null; prev_spent: number }[];
  top_merchants: { key: string; name: string; spent: number; tx_count: number }[];
  trend: { month: string; spent: number }[];
  savings_trend: { month: string; balance: number }[];
  anomalies: { key: string; title: string; amount: number }[];
  [k: string]: unknown;
};

export type Narrative = {
  headline: string;
  summary: string;
  highlights: { tone: 'positive' | 'warning' | 'neutral'; text: string }[];
  category_notes: { category_key: string; text: string }[];
  recommendations: { text: string }[];
  extra?: Record<string, unknown>;
};

export type MonthlyReport = Narrow<
  Pick<Tables<'monthly_reports'>, 'id' | 'budget_month' | 'metrics' | 'narrative' | 'narratives' | 'status' | 'updated_at'>,
  {
    metrics: ReportMetrics;
    narrative: Narrative | null;
    // P1-6: the same report per member language; `narrative` is the household's main language.
    narratives?: Partial<Record<'en' | 'he', Narrative>> | null;
    status: 'pending' | 'generating' | 'ready' | 'fallback' | 'failed';
  }
>;

export type AgentRun = Narrow<
  Pick<Tables<'agent_runs'>, 'id' | 'agent' | 'model' | 'status' | 'input_tokens' | 'output_tokens' | 'latency_ms' | 'error' | 'created_at'>,
  { agent: 'classifier' | 'monthly_report' | 'advisor'; status: 'ok' | 'timeout' | 'error' | 'invalid_output' | 'fallback' }
>;

// P1-13: a learned merchant, as list_merchants() returns it (migration 39).
export type MerchantSummary = Pick<Tables<'merchants'>, 'id' | 'display_name' | 'default_category_id'> & {
  category: Pick<Tables<'categories'>, 'name' | 'sf_symbol'> | null;
  tx_count: number;
  last_at: string | null;
  aliases: { normalized: string; source: 'user' | 'fuzzy' | 'llm' }[];
};

// P1-15: list_goals() (migration 43). Goals earmark part of the savings balance; `free` is
// what no open goal holds, below zero after spending savings that goals were counting on.
export type Goal = {
  id: string;
  name: string;
  sf_symbol: string;
  target_minor: number;
  target_month: string | null;
  saved: number;
  done: boolean;
  months_left: number;
  monthly_needed: number | null;
  behind_by: number;
};
export type Goals = { balance: number; allocated: number; free: number; goals: Goal[] };

// R9: per active Shortcut device, whether it has gone quiet (public.capture_health()).
export type CaptureHealth = {
  device_id: string;
  label: string;
  user_id: string;
  created_at: string;
  last_capture_at: string | null;
  captures_30d: number;
  median_gap_hours: number | null;
  silent_hours: number | null;
  status: 'ok' | 'silent' | 'setup';
};
