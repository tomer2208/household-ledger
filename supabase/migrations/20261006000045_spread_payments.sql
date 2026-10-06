-- P1-16 (docs/PRODUCT_ROADMAP.md): a recurring payment that comes every 2, 3, 6 or 12 months
-- (car insurance, arnona, holiday gifts) can be spread over its period, so the month it's paid
-- isn't the month that looks overspent.
--
-- A rule with `spread` on sets part of its category's budget aside every month until it's due,
-- in a fund of its own (recurring_reserves: + set aside at a month close, − released). The
-- month's share is what's still missing over the months left, the payment month included:
-- right after a ₪3,600 yearly payment that's ₪300 a month; a rule set up with three months to go
-- sets aside ₪1,200 twice. In the month it's paid (it's due, or the payment was posted) the fund
-- is released into the category's budget, so the payment costs about one share that month.
-- The category's budget in a month is: the budget set + what carried in (P1-14) + reserve,
-- where reserve is −share or +release (app.rule_reserves). Overview, the forecast, the alerts,
-- month close and the report all use it. Only a category with a budget sets money aside; a fund
-- whose rule is paused, deleted or no longer spread is released at the next close.
--
-- Money stays accounted for: savings + what's carried + what funds hold = income − spent.
-- The fund is measured in the base currency, at the latest rate for a rule in another one.

alter table public.recurring_rules
  add column spread boolean not null default false,
  add constraint spread_needs_period check (not spread or interval_months > 1);

create table public.recurring_reserves (
  household_id uuid not null references public.households(id),
  rule_id      uuid not null references public.recurring_rules(id),
  category_id  uuid not null references public.categories(id),
  budget_month date not null check (budget_month = date_trunc('month', budget_month)::date),
  amount_minor bigint not null check (amount_minor <> 0),
  created_at   timestamptz not null default now(),
  primary key (rule_id, budget_month)
);
create index recurring_reserves_household on public.recurring_reserves (household_id, budget_month);
create index recurring_reserves_category on public.recurring_reserves (category_id);

alter table public.recurring_reserves enable row level security;
create policy member_select on public.recurring_reserves for select to authenticated using (app.is_member(household_id));
revoke all on public.recurring_reserves from anon;
revoke insert, update, delete, truncate, references, trigger on public.recurring_reserves from authenticated;
grant select on public.recurring_reserves to authenticated;

create trigger audit after insert or update or delete on public.recurring_reserves
  for each row execute function app.audit();

-- A month close also says how much went into payment funds (negative: more was released).
alter table public.month_closes add column reserved_minor bigint not null default 0;

-- Each spread rule's effect on its category's budget in a month. reserve is −(the share set
-- aside) or +(the fund released); balance is what the fund held before the month. A closed
-- month reads what its close recorded; an open one is worked out from the rule as it is now.
create function app.rule_reserves(p_household uuid, p_month date)
returns table (rule_id uuid, category_id uuid, title text, target bigint, balance bigint, reserve bigint,
               due_month date, due_now boolean, active boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_base char(3) := (select h.base_currency from public.households h where h.id = p_household);
begin
  if app.is_month_closed(p_household, p_month) then
    return query
      select x.rule_id, x.category_id, r.title, null::bigint,
             coalesce((select sum(y.amount_minor) from public.recurring_reserves y
                       where y.rule_id = x.rule_id and y.budget_month < p_month), 0)::bigint,
             -x.amount_minor, null::date, null::boolean, false
      from public.recurring_reserves x join public.recurring_rules r on r.id = x.rule_id
      where x.household_id = p_household and x.budget_month = p_month;
    return;
  end if;

  return query
  with rules as (
    select r.id, r.category_id, r.title,
           case when r.currency = v_base then r.amount_minor
                else round(r.amount_minor * (select fx.rate from public.fx_rates fx
                                             where fx.base = v_base and fx.quote = r.currency
                                             order by fx.rate_date desc limit 1))::bigint end as target,
           coalesce((select sum(y.amount_minor) from public.recurring_reserves y
                     where y.rule_id = r.id and y.budget_month < p_month), 0)::bigint as balance,
           (r.spread and r.interval_months > 1 and r.deleted_at is null and not r.paused
            and r.next_run_date is not null and (r.end_date is null or r.next_run_date <= r.end_date)) as active,
           date_trunc('month', r.next_run_date)::date as due,
           exists (select 1 from public.transactions t
                   where t.recurring_rule_id = r.id and t.budget_month = p_month and t.deleted_at is null) as paid
    from public.recurring_rules r
    where r.household_id = p_household
      and (r.spread or exists (select 1 from public.recurring_reserves y where y.rule_id = r.id))
  )
  select q.id, q.category_id, q.title, q.target, q.balance,
         case
           -- paid this month, due, or no longer spread: the fund goes back into the budget
           when not q.active or q.paid or q.due <= p_month then q.balance
           when q.target is null or coalesce(app.cap_for(q.category_id, p_month), 0) <= 0 then 0
           else -round((q.target - q.balance)::numeric / (app.month_diff(p_month, q.due) + 1))::bigint
         end,
         case when q.active then q.due end,
         q.active and (q.paid or q.due <= p_month),
         q.active
  from rules q;
end $$;

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
  v_reserves jsonb;
  v_reserved bigint;
begin
  -- set aside for, or released to, periodic payments this month (before the month counts as closed)
  select coalesce(jsonb_agg(jsonb_build_object('rule_id', x.rule_id, 'category_id', x.category_id, 'reserve', x.reserve)), '[]'::jsonb)
  into v_reserves
  from app.rule_reserves(p_household, p_month) x where x.reserve <> 0;

  with res as (
    select (e->>'category_id')::uuid as category_id, sum((e->>'reserve')::bigint)::bigint as reserve
    from jsonb_array_elements(v_reserves) e group by 1
  ), cats as (
    select c.id, c.name, c.rollover, c.rollover_overspend, c.archived_at,
           case when c.archived_at is not null and c.archived_at < p_month then 0
                else coalesce(app.cap_for(c.id, p_month), 0) end as base,
           app.carry_for(c.id, p_month) as carry_in,
           coalesce(r.reserve, 0) as reserve,
           app.spent_for(c.id, p_month) as spent
    from public.categories c
    left join res r on r.category_id = c.id
    where c.household_id = p_household and c.kind = 'expense'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'category_id', id, 'name', name, 'base', base, 'carry_in', carry_in, 'reserve', reserve,
           'cap', base + carry_in + reserve, 'spent', spent,
           'carry_out', case when rollover and archived_at is null and base > 0
                              and (base + carry_in + reserve - spent >= 0 or rollover_overspend)
                             then base + carry_in + reserve - spent else 0 end)), '[]'::jsonb)
  into v_cats
  from cats;

  select coalesce(jsonb_agg(jsonb_build_object('category_id', x.category_id, 'name', x.name, 'cap', x.cap, 'spent', x.spent,
                                               'carry_in', x.carry_in, 'carry_out', x.carry_out, 'reserve', x.reserve)
                            order by x.name) filter (where x.cap <> 0 or x.spent <> 0 or x.carry_out <> 0 or x.reserve <> 0), '[]'::jsonb),
         coalesce(sum(x.base), 0)::bigint, coalesce(sum(x.cap), 0)::bigint,
         coalesce(sum(x.spent), 0)::bigint, coalesce(sum(x.carry_out), 0)::bigint, -coalesce(sum(x.reserve), 0)::bigint
  into v_snapshot, v_base, v_cap, v_spent, v_carry, v_reserved
  from jsonb_to_recordset(v_cats) as x(category_id uuid, name text, base bigint, carry_in bigint, reserve bigint,
                                       cap bigint, spent bigint, carry_out bigint);

  -- what goes to savings: the budgets' remainder (after what was set aside for payments), less
  -- what carries on in its category
  v_net := v_cap - v_spent - v_carry;

  insert into public.month_closes (household_id, budget_month, total_cap_minor, total_spent_minor, net_minor, carried_minor, reserved_minor, snapshot)
  values (p_household, p_month, v_cap, v_spent, v_net, v_carry, v_reserved, v_snapshot)
  on conflict do nothing
  returning true into v_inserted;

  if not coalesce(v_inserted, false) then
    return null;  -- already closed: idempotent
  end if;

  insert into public.category_rollovers (household_id, category_id, budget_month, amount_minor)
  select p_household, x.category_id, (p_month + interval '1 month')::date, x.carry_out
  from jsonb_to_recordset(v_cats) as x(category_id uuid, carry_out bigint)
  where x.carry_out <> 0;

  -- what a payment's fund gained (set aside) or gave back (released) this month
  insert into public.recurring_reserves (household_id, rule_id, category_id, budget_month, amount_minor)
  select p_household, x.rule_id, x.category_id, p_month, -x.reserve
  from jsonb_to_recordset(v_reserves) as x(rule_id uuid, category_id uuid, reserve bigint);

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

-- 90% and 100% of the month's budget, with what was set aside or released.
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

  v_cap := coalesce(app.cap_for(p_category, p_month), 0) + app.carry_for(p_category, p_month)
         + coalesce((select sum(x.reserve) from app.rule_reserves(v_household, p_month) x where x.category_id = p_category), 0);
  if v_cap <= 0 then return; end if;

  v_spent := app.spent_for(p_category, p_month);

  insert into public.budget_alerts (household_id, category_id, budget_month, threshold, spent_minor, cap_minor)
  select v_household, p_category, p_month, t, v_spent, v_cap
  from unnest(array[90, 100]) as t
  where v_spent * 100 >= v_cap * t
  on conflict do nothing;
end $$;

-- ───────── month_overview ─────────

-- Per category, reserve (in cap already) and funds: each spread rule's fund, what it held before
-- the month (balance), this month's reserve, when it's due. total_cap and net include reserves.
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
  ), res as (
    -- P1-16: what periodic payments set aside (negative) or release (positive) this month
    select x.category_id, sum(x.reserve)::bigint as reserve,
           jsonb_agg(jsonb_build_object('rule_id', x.rule_id, 'title', x.title, 'target', x.target,
                                        'balance', x.balance, 'reserve', x.reserve,
                                        'due_month', to_char(x.due_month, 'YYYY-MM-DD'), 'due_now', x.due_now)
                     order by x.title) as funds
    from app.rule_reserves(v_household, v_month) x
    where x.reserve <> 0 or x.active
    group by x.category_id
  ), base as (
    select c.id, c.name, c.sf_symbol, c.sort_order, c.budget_acknowledged, c.rollover,
           b.cap_minor as base_cap, coalesce(ro.amount_minor, 0) as carry,
           coalesce(rs.reserve, 0) as reserve, coalesce(rs.funds, '[]'::jsonb) as funds,
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
    left join res rs on rs.category_id = c.id
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
           case when base_cap is null and carry = 0 and reserve = 0 then null
                else coalesce(base_cap, 0) + carry + reserve end as cap
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
    'total_reserve', coalesce(sum(reserve), 0),
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
        'cap', cap, 'base_cap', base_cap, 'carry', carry, 'reserve', reserve, 'funds', funds,
        'rollover', rollover, 'spent', spent,
        'pct', case when coalesce(cap, 0) > 0 then round(spent * 100.0 / cap) end,
        'no_budget', base_cap is null and carry = 0 and reserve = 0 and not budget_acknowledged,
        'forecast', case when v_current then spent + upcoming + rest end
      ) order by sort_order, name), '[]'::jsonb)
  ) into v_result
  from cats;
  return v_result;
end $$;

-- ───────── report ─────────

-- The report's budgets include what was set aside or released, and it says how much went into
-- the funds. Otherwise as migration 44 left it.
do $x$
declare d text := pg_get_functiondef('app.report_metrics(uuid,date)'::regprocedure);
begin
  if position('+ app.carry_for(cat.id, p_month) end as cap,' in d) = 0
     or position('''carried'', coalesce(' in d) = 0 then
    raise exception 'report_metrics is not the expected version';
  end if;
  d := replace(d, '+ app.carry_for(cat.id, p_month) end as cap,',
                  '+ app.carry_for(cat.id, p_month)
                       + coalesce((select sum(x.reserve) from app.rule_reserves(p_household, p_month) x
                                   where x.category_id = cat.id), 0) end as cap,');
  d := replace(d, '''carried'', coalesce(',
                  '''reserved'', coalesce((select mc.reserved_minor from public.month_closes mc
                            where mc.household_id = p_household and mc.budget_month = p_month), 0),
      ''carried'', coalesce(');
  execute d;
end $x$;

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
  delete from public.recurring_reserves where household_id = p_household;
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
revoke execute on function app.rule_reserves(uuid, date) from public, anon, authenticated;
