-- T8 + T9 (docs/PRODUCT_ROADMAP.md): the database keeps up once there are many households.
--
-- 1. app.spent_for (a category's spend in a month) is called per category by Overview, month
--    close, the report metrics and the advisor. It filters by category and month only, and no
--    index started with the category, so every call read the transactions of every household.
--    tx_category_month serves it. It is not partial, so it also covers the foreign key: deleting
--    a category (a never-used one, or a whole household) no longer scans the table either.
-- 2. month_overview, the most opened screen, adds up a month in one grouped pass over the
--    household's transactions instead of two spent_for calls per category. Same result.
-- 3. Foreign keys that a delete has to check (a household, a category, a merchant, an AI run)
--    get an index, so a purge or a cleanup touches only the rows involved. Keys that point at a
--    person (created_by and the like) are checked only when an account is deleted, on small
--    tables, and are left as they are; transactions.created_by is indexed, as the Expenses
--    "added by" filter reads it.
-- 4. tx_recent duplicated the start of tx_keyset (same columns, same rows) and is dropped.

-- ───────── 1. spend per category ─────────

create index tx_category_month on public.transactions (category_id, budget_month);

-- ───────── 2. month_overview ─────────

create or replace function public.month_overview(p_month date default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
  v_month date := coalesce(date_trunc('month', p_month)::date, app.local_month(v_household, now()));
  v_income bigint := app.income_for(v_household, v_month);
  v_result jsonb;
begin
  with spent as (
    select t.category_id, sum(t.amount_base_minor)::bigint as spent
    from public.transactions t
    where t.household_id = v_household and t.budget_month = v_month and t.deleted_at is null
    group by t.category_id
  ), cats as (
    select c.id, c.name, c.sf_symbol, c.sort_order, c.budget_acknowledged,
           b.cap_minor as cap, coalesce(s.spent, 0) as spent
    from public.categories c
    left join spent s on s.category_id = c.id
    -- the budget in force that month, as app.cap_for reads it
    left join lateral (
      select x.cap_minor from public.category_budgets x
      where x.category_id = c.id and x.effective_month <= v_month
      order by x.effective_month desc limit 1
    ) b on true
    where c.household_id = v_household and c.kind = 'expense'
      and (c.archived_at is null or coalesce(s.spent, 0) <> 0)
  )
  select jsonb_build_object(
    'month', to_char(v_month, 'YYYY-MM-DD'),
    'closed', app.is_month_closed(v_household, v_month),
    'currency', (select h.base_currency from public.households h where h.id = v_household),
    'income', v_income,
    'unassigned', v_income - coalesce(sum(coalesce(cap, 0)), 0),
    'total_cap', coalesce(sum(coalesce(cap, 0)), 0),
    'total_spent', coalesce(sum(spent), 0),
    'net', coalesce(sum(coalesce(cap, 0)), 0) - coalesce(sum(spent), 0),
    'savings_balance', app.savings_balance(v_household),
    'pending_review', (select count(*) from public.transactions t
                       where t.household_id = v_household and t.status = 'pending_review' and t.deleted_at is null),
    'categories', coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'sf_symbol', sf_symbol,
        'cap', cap, 'spent', spent,
        'pct', case when coalesce(cap, 0) > 0 then round(spent * 100.0 / cap) end,
        'no_budget', cap is null and not budget_acknowledged
      ) order by sort_order, name), '[]'::jsonb)
  ) into v_result
  from cats;
  return v_result;
end $$;

-- ───────── 3. keys a delete has to check ─────────

-- transactions: merchants are checked on delete too, so their index can't skip deleted rows
drop index public.tx_merchant;
create index tx_merchant on public.transactions (merchant_id, occurred_at desc);
create index tx_created_by on public.transactions (created_by);

create index recurring_rules_household on public.recurring_rules (household_id, next_run_date);
create index recurring_rules_category on public.recurring_rules (category_id);
create index recurring_rules_merchant on public.recurring_rules (merchant_id) where merchant_id is not null;

create index merchants_household on public.merchants (household_id);
create index merchants_default_category on public.merchants (default_category_id) where default_category_id is not null;

create index category_budgets_household on public.category_budgets (household_id);
create index device_tokens_household on public.device_tokens (household_id);
create index device_tokens_user on public.device_tokens (user_id);
create index household_invites_household on public.household_invites (household_id);
create index savings_ledger_transaction on public.savings_ledger (transaction_id) where transaction_id is not null;
create index agent_proposals_run on public.agent_proposals (agent_run_id) where agent_run_id is not null;
create index monthly_reports_run on public.monthly_reports (agent_run_id) where agent_run_id is not null;

-- ───────── 4. a duplicate ─────────

drop index public.tx_recent;
