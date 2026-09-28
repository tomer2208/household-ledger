// Shapes the app reads. Mirrors supabase/migrations; regenerate from
// `supabase gen types` once the CLI is set up (BLUEPRINT §3.2).

export type Household = {
  id: string;
  name: string;
  base_currency: string;
  timezone: string;
  ai_consent_at: string | null;
};

export type Member = { user_id: string; display_name: string; joined_at: string };

export type Category = {
  id: string;
  name: string;
  sf_symbol: string;
  kind: 'expense' | 'savings';
  sort_order: number;
  archived_at: string | null;
  budget_acknowledged: boolean;
  created_via: 'seed' | 'app' | 'shortcut';
};

export type TxStatus = 'confirmed' | 'pending_review' | 'estimated';
export type TxSource = 'apple_pay' | 'manual' | 'recurring';

export type Transaction = {
  id: string;
  title: string;
  raw_merchant: string | null;
  amount_minor: number;
  currency: string;
  amount_base_minor: number;
  fx_rate: number;
  fx_source: 'identity' | 'daily' | 'manual';
  occurred_at: string;
  budget_month: string;
  status: TxStatus;
  source: TxSource;
  category_id: string;
  note: string | null;
  card_label: string | null;
  created_by: string | null;
  recurring_rule_id: string | null;
  classification: { method?: string; confidence?: number } | null;
  categories: { name: string; sf_symbol: string } | null;
};

export type OverviewCategory = {
  id: string;
  name: string;
  sf_symbol: string;
  cap: number | null;
  spent: number;
  pct: number | null;
  no_budget: boolean;
};

export type Overview = {
  month: string;
  closed: boolean;
  currency: string;
  // Combined monthly income, null until set. unassigned = income − total_cap (null without income).
  income: number | null;
  unassigned: number | null;
  total_cap: number;
  total_spent: number;
  net: number;
  savings_balance: number;
  pending_review: number;
  categories: OverviewCategory[];
};

export type RecurringRule = {
  id: string;
  title: string;
  category_id: string;
  amount_minor: number;
  currency: string;
  amount_kind: 'fixed' | 'estimated';
  interval_months: number;
  day_of_month: number;
  start_date: string;
  end_date: string | null;
  next_run_date: string | null;
  paused: boolean;
  categories: { name: string; sf_symbol: string } | null;
};

export type Device = {
  id: string;
  user_id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type SavingsEntry = {
  id: string;
  entry_type: 'month_close' | 'late_adjustment' | 'manual' | 'unassigned_income';
  budget_month: string;
  amount_minor: number;
  reason: string;
  created_at: string;
};

export type MonthClose = {
  budget_month: string;
  total_cap_minor: number;
  total_spent_minor: number;
  net_minor: number;
  snapshot: { category_id: string; name: string; cap: number; spent: number }[];
  closed_at: string;
};

export type Proposal = {
  id: string;
  kind: 'create_recurring' | 'update_estimate' | 'adjust_budget' | 'recategorize_merchant' | 'flag_duplicate';
  payload: Record<string, unknown>;
  rationale: { text: string; evidence: Record<string, unknown>; priority?: number };
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'failed';
  created_at: string;
};

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

export type MonthlyReport = {
  id: string;
  budget_month: string;
  metrics: ReportMetrics;
  narrative: Narrative | null;
  status: 'pending' | 'generating' | 'ready' | 'fallback' | 'failed';
  updated_at: string;
};

export type AgentRun = {
  id: string;
  agent: 'classifier' | 'monthly_report' | 'advisor';
  model: string;
  status: 'ok' | 'timeout' | 'error' | 'invalid_output' | 'fallback';
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  error: string | null;
  created_at: string;
};
