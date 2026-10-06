-- P1-14 (docs/PRODUCT_ROADMAP.md): a category's unused budget can roll over to next month.
--
-- A category with `rollover` on carries what's left of its budget at month close into the same
-- category next month, instead of into savings. An overspend carries too (next month's budget is
-- that much smaller), unless `rollover_overspend` is off; then the overspend is covered by
-- savings as before. Only a category that had a budget of its own that month carries anything,
-- and an archived one never does: what's left goes to savings.
--
-- The carry is written at close, into category_rollovers for the next month, and that month's
-- budget is the category's budget plus the carry (app.carry_for). Overview, the forecast, the
-- alerts and the report all use that. Closed months don't change; turning rollover off means
-- the next close sends what's left (carry included) to savings.
--
-- Money is never lost or counted twice: the month_close ledger entry is Σ budget − Σ spent −
-- what carried on, so over time savings + what's carried = income − spent, as before.
-- A change to an expense in a closed month still moves savings by the difference (US-B2); the
-- carry was fixed when the month closed.

alter table public.categories
  add column rollover boolean not null default false,
  add column rollover_overspend boolean not null default true;
grant update (rollover, rollover_overspend) on public.categories to authenticated;

create table public.category_rollovers (
  household_id uuid not null references public.households(id),
  category_id  uuid not null references public.categories(id),
  budget_month date not null check (budget_month = date_trunc('month', budget_month)::date),
  amount_minor bigint not null check (amount_minor <> 0),
  created_at   timestamptz not null default now(),
  primary key (category_id, budget_month)
);
create index category_rollovers_household on public.category_rollovers (household_id, budget_month);

alter table public.category_rollovers enable row level security;
create policy member_select on public.category_rollovers for select to authenticated using (app.is_member(household_id));
revoke all on public.category_rollovers from anon;
revoke insert, update, delete, truncate, references, trigger on public.category_rollovers from authenticated;
grant select on public.category_rollovers to authenticated;

create trigger audit after insert or update or delete on public.category_rollovers
  for each row execute function app.audit();

-- What a month close carried into this category for this month (0 if nothing).
create function app.carry_for(p_category uuid, p_month date) returns bigint
language sql stable set search_path = '' as $$
  select coalesce((select r.amount_minor from public.category_rollovers r
                   where r.category_id = p_category and r.budget_month = p_month), 0);
$$;

-- A month close also says how much carried on.
alter table public.month_closes add column carried_minor bigint not null default 0;

-- ───────── month close ─────────

create or replace function app.close_month(p_household uuid, p_month date) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_cats  jsonb;
  v_snapshot jsonb;
  v_base  bigint;
  v_cap   bigint;
  v_spent bigint;
  v_carry bigint;
  v_net   bigint;
  v_income bigint;
  v_inserted boolean;
begin
  with cats as (
    select c.id, c.name, c.rollover, c.rollover_overspend, c.archived_at,
           case when c.archived_at is not null and c.archived_at < p_month then 0
                else coalesce(app.cap_for(c.id, p_month), 0) end as base,
           app.carry_for(c.id, p_month) as carry_in,
           app.spent_for(c.id, p_month) as spent
    from public.categories c
    where c.household_id = p_household and c.kind = 'expense'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'category_id', id, 'name', name, 'base', base, 'carry_in', carry_in,
           'cap', base + carry_in, 'spent', spent,
           'carry_out', case when rollover and archived_at is null and base > 0
                              and (base + carry_in - spent >= 0 or rollover_overspend)
                             then base + carry_in - spent else 0 end)), '[]'::jsonb)
  into v_cats
  from cats;

  select coalesce(jsonb_agg(jsonb_build_object('category_id', x.category_id, 'name', x.name, 'cap', x.cap, 'spent', x.spent,
                                               'carry_in', x.carry_in, 'carry_out', x.carry_out)
                            order by x.name) filter (where x.cap <> 0 or x.spent <> 0 or x.carry_out <> 0), '[]'::jsonb),
         coalesce(sum(x.base), 0)::bigint, coalesce(sum(x.cap), 0)::bigint,
         coalesce(sum(x.spent), 0)::bigint, coalesce(sum(x.carry_out), 0)::bigint
  into v_snapshot, v_base, v_cap, v_spent, v_carry
  from jsonb_to_recordset(v_cats) as x(category_id uuid, name text, base bigint, carry_in bigint,
                                       cap bigint, spent bigint, carry_out bigint);

  -- what goes to savings: the budgets' remainder, less what carries on in its category
  v_net := v_cap - v_spent - v_carry;

  insert into public.month_closes (household_id, budget_month, total_cap_minor, total_spent_minor, net_minor, carried_minor, snapshot)
  values (p_household, p_month, v_cap, v_spent, v_net, v_carry, v_snapshot)
  on conflict do nothing
  returning true into v_inserted;

  if not coalesce(v_inserted, false) then
    return null;  -- already closed: idempotent
  end if;

  insert into public.category_rollovers (household_id, category_id, budget_month, amount_minor)
  select p_household, x.category_id, (p_month + interval '1 month')::date, x.carry_out
  from jsonb_to_recordset(v_cats) as x(category_id uuid, carry_out bigint)
  where x.carry_out <> 0;

  insert into public.savings_ledger (household_id, entry_type, budget_month, amount_minor, reason)
  values (p_household, 'month_close', p_month, v_net, 'Month close ' || to_char(p_month, 'YYYY-MM'));

  -- unassigned income is measured against the budgets that were set, not what carried in
  v_income := app.income_for(p_household, p_month);
  if v_income is not null and v_income <> v_base then
    insert into public.savings_ledger (household_id, entry_type, budget_month, amount_minor, reason)
    values (p_household, 'unassigned_income', p_month, v_income - v_base,
            'Unassigned income ' || to_char(p_month, 'YYYY-MM'));
  end if;

  return v_net;
end $$;

-- ───────── alerts ─────────

-- 90% and 100% of the budget including what carried in.
create or replace function app.check_budget(p_category uuid, p_month date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid;
  v_cap   bigint;
  v_spent bigint;
begin
  select c.household_id into v_household
  from public.categories c where c.id = p_category and c.kind = 'expense';
  if v_household is null then return; end if;

  -- H8: only the running month alerts
  if p_month <> app.local_month(v_household, now()) then return; end if;

  v_cap := coalesce(app.cap_for(p_category, p_month), 0) + app.carry_for(p_category, p_month);
  if v_cap <= 0 then return; end if;

  v_spent := app.spent_for(p_category, p_month);

  insert into public.budget_alerts (household_id, category_id, budget_month, threshold, spent_minor, cap_minor)
  select v_household, p_category, p_month, t, v_spent, v_cap
  from unnest(array[90, 100]) as t
  where v_spent * 100 >= v_cap * t
  on conflict do nothing;
end $$;

-- ───────── month_overview ─────────

-- Per category: cap is the month's budget including the carry, base_cap the budget that was set
-- (what the category screen edits), carry what came from last month. total_cap and net count the
-- carry; total_base_cap and unassigned don't (income is planned against the budgets set).
create or replace function public.month_overview(p_month date default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
  v_now_month date := app.local_month(v_household, now());
  v_month date := coalesce(date_trunc('month', p_month)::date, v_now_month);
  v_income bigint := app.income_for(v_household, v_month);
  v_base char(3) := (select h.base_currency from public.households h where h.id = v_household);
  v_current boolean := v_month = v_now_month;
  v_today date := app.local_today(v_household);
  v_day int := extract(day from v_today)::int;
  v_days int := extract(day from (v_month + interval '1 month - 1 day'))::int;
  -- weight of this month's own pace: 1 from day 5 on
  v_weight numeric := least(1, v_day / 5.0);
  v_result jsonb;
begin
  with spent as (
    select t.category_id,
           sum(t.amount_base_minor)::bigint as spent,
           coalesce(sum(t.amount_base_minor) filter (where t.recurring_rule_id is null), 0)::bigint as variable
    from public.transactions t
    where t.household_id = v_household and t.budget_month = v_month and t.deleted_at is null
    group by t.category_id
  ), history as (
    -- non-recurring spend a month, averaged over the three months before (current month only)
    select t.category_id, sum(t.amount_base_minor) / 3.0 as avg_variable
    from public.transactions t
    where v_current and t.household_id = v_household and t.deleted_at is null and t.recurring_rule_id is null
      and t.budget_month >= (v_month - interval '3 months')::date and t.budget_month < v_month
    group by t.category_id
  ), upcoming as (
    select r.category_id,
           sum(case when r.currency = v_base then r.amount_minor
                    else round(r.amount_minor * (select x.rate from public.fx_rates x
                                                 where x.base = v_base and x.quote = r.currency
                                                 order by x.rate_date desc limit 1)) end)::bigint as upcoming
    from public.recurring_rules r
    where v_current and r.household_id = v_household and r.deleted_at is null and not r.paused
      and r.next_run_date >= v_month and r.next_run_date < (v_month + interval '1 month')::date
      and (r.end_date is null or r.next_run_date <= r.end_date)
    group by r.category_id
  ), base as (
    select c.id, c.name, c.sf_symbol, c.sort_order, c.budget_acknowledged, c.rollover,
           b.cap_minor as base_cap, coalesce(ro.amount_minor, 0) as carry,
           coalesce(s.spent, 0) as spent,
           case when v_current then coalesce(u.upcoming, 0) end as upcoming,
           case when v_current then greatest(0, round(
             v_weight * (coalesce(s.variable, 0)::numeric / v_day * v_days)
             + (1 - v_weight) * greatest(coalesce(hi.avg_variable, 0), coalesce(s.variable, 0))
             - coalesce(s.variable, 0)))::bigint end as rest
    from public.categories c
    left join spent s on s.category_id = c.id
    left join history hi on hi.category_id = c.id
    left join upcoming u on u.category_id = c.id
    left join public.category_rollovers ro on ro.category_id = c.id and ro.budget_month = v_month
    -- the budget in force that month, as app.cap_for reads it
    left join lateral (
      select x.cap_minor from public.category_budgets x
      where x.category_id = c.id and x.effective_month <= v_month
      order by x.effective_month desc limit 1
    ) b on true
    where c.household_id = v_household and c.kind = 'expense'
      and (c.archived_at is null or coalesce(s.spent, 0) <> 0)
  ), cats as (
    select base.*,
           case when base_cap is null and carry = 0 then null else coalesce(base_cap, 0) + carry end as cap
    from base
  )
  select jsonb_build_object(
    'month', to_char(v_month, 'YYYY-MM-DD'),
    'closed', app.is_month_closed(v_household, v_month),
    'currency', v_base,
    'income', v_income,
    'unassigned', v_income - coalesce(sum(coalesce(base_cap, 0)), 0),
    'total_cap', coalesce(sum(coalesce(cap, 0)), 0),
    'total_base_cap', coalesce(sum(coalesce(base_cap, 0)), 0),
    'total_carry', coalesce(sum(carry), 0),
    'total_spent', coalesce(sum(spent), 0),
    'net', coalesce(sum(coalesce(cap, 0)), 0) - coalesce(sum(spent), 0),
    'savings_balance', app.savings_balance(v_household),
    'pending_review', (select count(*) from public.transactions t
                       where t.household_id = v_household and t.status = 'pending_review' and t.deleted_at is null),
    'forecast', case when v_current then jsonb_build_object(
        'day', v_day, 'days', v_days,
        'spent', coalesce(sum(spent), 0),
        'upcoming', coalesce(sum(upcoming), 0),
        'rest', coalesce(sum(rest), 0),
        'total', coalesce(sum(spent + upcoming + rest), 0)) end,
    'categories', coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'sf_symbol', sf_symbol,
        'cap', cap, 'base_cap', base_cap, 'carry', carry, 'rollover', rollover, 'spent', spent,
        'pct', case when coalesce(cap, 0) > 0 then round(spent * 100.0 / cap) end,
        'no_budget', base_cap is null and carry = 0 and not budget_acknowledged,
        'forecast', case when v_current then spent + upcoming + rest end
      ) order by sort_order, name), '[]'::jsonb)
  ) into v_result
  from cats;
  return v_result;
end $$;

-- ───────── report ─────────

-- The report compares spending with the month's budget including what carried in, as Overview
-- did all month, and says what carried on. Otherwise unchanged from migration 15.
create or replace function app.report_metrics(p_household uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cur    char(3);
  v_cats   jsonb;
  v_top    jsonb;
  v_trend  jsonb;
  v_sav    jsonb;
  v_alerts jsonb;
  v_anom   jsonb;
  v_cap    bigint;
  v_spent  bigint;
  v_prev   bigint;
  v_avg3   bigint;
  v_txn    bigint;
  v_fixed  bigint;
  v_est    bigint;
  m1 date := (p_month - interval '1 month')::date;
  m2 date := (p_month - interval '2 month')::date;
  m3 date := (p_month - interval '3 month')::date;
begin
  select h.base_currency into v_cur from public.households h where h.id = p_household;

  with c as (
    select cat.id, cat.name,
           case when cat.archived_at is not null and cat.archived_at < p_month then 0
                else coalesce(app.cap_for(cat.id, p_month), 0) + app.carry_for(cat.id, p_month) end as cap,
           app.spent_for(cat.id, p_month) as spent,
           app.spent_for(cat.id, m1) as prev_spent,
           coalesce((app.spent_for(cat.id, m1) + app.spent_for(cat.id, m2) + app.spent_for(cat.id, m3))
             / nullif((app.spent_for(cat.id, m1) <> 0)::int + (app.spent_for(cat.id, m2) <> 0)::int
                      + (app.spent_for(cat.id, m3) <> 0)::int, 0), 0) as avg3,
           (select count(*) from public.transactions t
            where t.category_id = cat.id and t.budget_month = p_month and t.deleted_at is null) as tx_count
    from public.categories cat
    where cat.household_id = p_household and cat.kind = 'expense'
  ),
  totals as (
    select coalesce(sum(cap), 0)::bigint cap, coalesce(sum(spent), 0)::bigint spent,
           coalesce(sum(prev_spent), 0)::bigint prev,
           -- months before the household had data would drag the average to zero
           coalesce((select avg(s.spent) from (
              select sum(t.amount_base_minor) spent from public.transactions t
              where t.household_id = p_household and t.deleted_at is null and t.budget_month between m3 and m1
              group by t.budget_month having sum(t.amount_base_minor) <> 0) s), 0)::bigint avg3,
           coalesce(sum(tx_count), 0)::bigint txn
    from c
  ),
  keyed as (
    select c.*, 'c' || row_number() over (order by spent desc, name) as key
    from c where cap <> 0 or spent <> 0 or prev_spent <> 0
  )
  select (select coalesce(jsonb_agg(jsonb_build_object(
            'key', key, 'id', id, 'name', name, 'cap', cap, 'spent', spent,
            'pct', case when cap > 0 then round(spent * 100.0 / cap)::int end,
            'prev_spent', prev_spent, 'avg3_spent', avg3, 'tx_count', tx_count) order by spent desc, name), '[]'::jsonb)
          from keyed),
         t.cap, t.spent, t.prev, t.avg3, t.txn
  into v_cats, v_cap, v_spent, v_prev, v_avg3, v_txn
  from totals t;

  select coalesce(jsonb_agg(jsonb_build_object('key', 'm' || rn, 'merchant_id', merchant_id, 'name', name,
                                               'spent', spent, 'tx_count', n) order by rn), '[]'::jsonb)
  into v_top
  from (
    select row_number() over (order by sum(t.amount_base_minor) desc) rn,
           (array_agg(t.merchant_id))[1] merchant_id,
           coalesce(max(m.display_name), max(t.title)) name,
           sum(t.amount_base_minor)::bigint spent, count(*) n
    from public.transactions t left join public.merchants m on m.id = t.merchant_id
    where t.household_id = p_household and t.budget_month = p_month and t.deleted_at is null and t.amount_base_minor > 0
    group by coalesce(t.merchant_id::text, lower(t.title))
    order by sum(t.amount_base_minor) desc
    limit 5
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('month', to_char(g.m, 'YYYY-MM'), 'spent', coalesce(s.spent, 0)) order by g.m), '[]'::jsonb)
  into v_trend
  from generate_series((p_month - interval '5 month')::date, p_month, interval '1 month') as g(m)
  left join (
    select t.budget_month, sum(t.amount_base_minor)::bigint spent from public.transactions t
    where t.household_id = p_household and t.deleted_at is null group by t.budget_month
  ) s on s.budget_month = g.m::date;

  select coalesce(jsonb_agg(jsonb_build_object('month', to_char(g.m, 'YYYY-MM'),
           'balance', (select coalesce(sum(l.amount_minor), 0) from public.savings_ledger l
                       where l.household_id = p_household and l.budget_month <= g.m::date)) order by g.m), '[]'::jsonb)
  into v_sav
  from generate_series((p_month - interval '5 month')::date, p_month, interval '1 month') as g(m);

  select coalesce(jsonb_agg(jsonb_build_object(
           'category_key', (select e->>'key' from jsonb_array_elements(v_cats) e where e->>'id' = a.category_id::text),
           'threshold', a.threshold)), '[]'::jsonb)
  into v_alerts
  from public.budget_alerts a where a.household_id = p_household and a.budget_month = p_month;

  -- A purchase is an anomaly when it is at least twice its category's usual ticket and ₪200+.
  select coalesce(jsonb_agg(jsonb_build_object('key', 'a' || rn, 'title', title, 'amount', amount,
           'category_key', (select e->>'key' from jsonb_array_elements(v_cats) e where e->>'id' = category_id::text),
           'date', to_char(d, 'YYYY-MM-DD')) order by rn), '[]'::jsonb)
  into v_anom
  from (
    select row_number() over (order by t.amount_base_minor desc) rn, t.title, t.amount_base_minor amount,
           t.category_id, (t.occurred_at)::date d
    from public.transactions t
    where t.household_id = p_household and t.budget_month = p_month and t.deleted_at is null
      -- twice the category's usual ticket and ₪200+, or ₪1,000+ when there is no history yet
      and t.amount_base_minor >= coalesce(greatest(20000, 2 * (
            select avg(p.amount_base_minor) from public.transactions p
            where p.category_id = t.category_id and p.deleted_at is null and p.amount_base_minor > 0
              and p.budget_month between m3 and m1)), 100000)
    order by t.amount_base_minor desc
    limit 3
  ) x;

  select coalesce(sum(t.amount_base_minor) filter (where t.status = 'confirmed'), 0)::bigint,
         coalesce(sum(t.amount_base_minor) filter (where t.status = 'estimated'), 0)::bigint
  into v_fixed, v_est
  from public.transactions t
  where t.household_id = p_household and t.budget_month = p_month and t.deleted_at is null and t.source = 'recurring';

  return jsonb_build_object(
    'month', to_char(p_month, 'YYYY-MM'),
    'currency', v_cur,
    'totals', jsonb_build_object(
      'cap', v_cap, 'spent', v_spent, 'net', v_cap - v_spent, 'overrun', greatest(v_spent - v_cap, 0),
      'prev_spent', v_prev, 'avg3_spent', v_avg3, 'tx_count', v_txn,
      -- P1-14: how much of the budgets' remainder carried on to next month instead of savings
      'carried', coalesce((select mc.carried_minor from public.month_closes mc
                           where mc.household_id = p_household and mc.budget_month = p_month), 0),
      'days_in_month', extract(day from (p_month + interval '1 month - 1 day'))::int,
      'savings_balance', (select coalesce(sum(l.amount_minor), 0) from public.savings_ledger l
                          where l.household_id = p_household and l.budget_month <= p_month)),
    'categories', v_cats,
    'top_merchants', v_top,
    'recurring', jsonb_build_object('fixed_total', v_fixed, 'estimated_total', v_est),
    'trend', v_trend,
    'savings_trend', v_sav,
    'alerts_fired', v_alerts,
    'anomalies', v_anom
  );
end $$;

-- ───────── account deletion ─────────

create or replace function app.purge_household(p_household uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.savings_goal_moves where household_id = p_household;
  delete from public.savings_goals      where household_id = p_household;
  delete from public.savings_ledger     where household_id = p_household;
  delete from public.budget_alerts      where household_id = p_household;
  delete from public.month_closes       where household_id = p_household; -- unlocks category_budgets, household_income
  delete from public.category_rollovers where household_id = p_household;
  delete from public.monthly_reports    where household_id = p_household;
  delete from public.agent_proposals    where household_id = p_household;
  delete from public.agent_runs         where household_id = p_household;
  delete from app.advisor_dismissals    where household_id = p_household;
  delete from public.transactions       where household_id = p_household;
  delete from public.recurring_rules    where household_id = p_household;
  delete from public.merchant_aliases   where household_id = p_household;
  delete from public.merchants          where household_id = p_household;
  delete from public.category_budgets   where household_id = p_household;
  delete from public.household_income   where household_id = p_household;
  delete from public.categories         where household_id = p_household;
  delete from public.device_tokens      where household_id = p_household;
  delete from public.household_invites  where household_id = p_household;
  delete from public.household_members  where household_id = p_household;
  delete from public.households         where id = p_household;
  -- Last, because every delete above wrote an audit row.
  delete from public.audit_log          where household_id = p_household;
end $$;
revoke execute on function app.purge_household(uuid) from public, anon, authenticated;

-- app.* is for the functions above, not for callers.
revoke execute on function app.carry_for(uuid, date) from public, anon, authenticated;
