-- Silent partner sync (US-S1): the app listens to these tables through Realtime.
-- Realtime applies each table's RLS select policy, so a device only hears its household.
alter publication supabase_realtime add table
  public.transactions, public.categories, public.category_budgets,
  public.recurring_rules, public.savings_ledger, public.device_tokens;
