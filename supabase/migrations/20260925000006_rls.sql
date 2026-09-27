-- Row Level Security (BLUEPRINT §3.5). Default deny; only what's listed here is open.
-- Deletion is a soft delete (update deleted_at), so users get no DELETE anywhere but push_tokens.

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

revoke all on all tables in schema public from anon;
revoke delete, truncate, references, trigger on all tables in schema public from authenticated;

-- Server-written tables: read-only for users.
revoke insert, update on public.budget_alerts, public.month_closes, public.savings_ledger,
  public.monthly_reports, public.agent_runs, public.agent_proposals, public.audit_log,
  public.fx_rates, public.household_invites, public.households, public.household_members,
  public.device_tokens
from authenticated;

-- Column-level write limits: what a user may change on shared rows.
grant update (name, settings, ai_consent_at, base_currency, timezone) on public.households to authenticated;
grant update (display_name) on public.household_members to authenticated;

revoke update on public.categories from authenticated;
grant update (name, sf_symbol, sort_order, archived_at, budget_acknowledged) on public.categories to authenticated;

revoke update on public.transactions from authenticated;
grant update (title, category_id, merchant_id, amount_minor, currency, fx_rate, fx_source,
              occurred_at, status, note, deleted_at) on public.transactions to authenticated;

-- Hashes are never readable by clients.
revoke select on public.device_tokens from authenticated;
grant select (id, household_id, user_id, label, created_at, last_used_at, revoked_at)
  on public.device_tokens to authenticated;
revoke select on public.household_invites from authenticated;
grant select (id, household_id, created_by, expires_at, used_by, used_at)
  on public.household_invites to authenticated;

grant delete on public.push_tokens to authenticated;

-- ───────── policies ─────────

create policy member_select on public.households for select to authenticated
  using (app.is_member(id));
create policy member_update on public.households for update to authenticated
  using (app.is_member(id)) with check (app.is_member(id));

create policy member_select on public.household_members for select to authenticated
  using (app.is_member(household_id));
create policy self_update on public.household_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy member_select on public.household_invites for select to authenticated
  using (app.is_member(household_id));

-- Shared, fully editable household data (equal rights, Batch 1 §3).
do $$
declare t text;
begin
  foreach t in array array['categories','merchants','merchant_aliases','recurring_rules','category_budgets'] loop
    execute format('create policy member_select on public.%I for select to authenticated
                    using (app.is_member(household_id))', t);
    execute format('create policy member_update on public.%I for update to authenticated
                    using (app.is_member(household_id)) with check (app.is_member(household_id))', t);
  end loop;
end $$;

create policy member_insert on public.categories for insert to authenticated
  with check (app.is_member(household_id) and kind = 'expense');
create policy member_insert on public.merchants for insert to authenticated
  with check (app.is_member(household_id));
create policy member_insert on public.merchant_aliases for insert to authenticated
  with check (app.is_member(household_id));
create policy member_insert on public.recurring_rules for insert to authenticated
  with check (app.is_member(household_id));
create policy member_insert on public.category_budgets for insert to authenticated
  with check (app.is_member(household_id)
              and effective_month >= app.local_month(household_id, now()));

create policy member_select on public.transactions for select to authenticated
  using (app.is_member(household_id));
create policy member_update on public.transactions for update to authenticated
  using (app.is_member(household_id)) with check (app.is_member(household_id));
-- Apple Pay and recurring rows are written by the server; the app only adds manual ones.
create policy member_insert_manual on public.transactions for insert to authenticated
  with check (app.is_member(household_id) and source = 'manual' and created_by = (select auth.uid()));

create policy member_select on public.device_tokens for select to authenticated
  using (app.is_member(household_id));

create policy self_all on public.push_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['budget_alerts','month_closes','savings_ledger','monthly_reports',
                           'agent_runs','agent_proposals','audit_log'] loop
    execute format('create policy member_select on public.%I for select to authenticated
                    using (app.is_member(household_id))', t);
  end loop;
end $$;

create policy authenticated_select on public.fx_rates for select to authenticated using (true);
