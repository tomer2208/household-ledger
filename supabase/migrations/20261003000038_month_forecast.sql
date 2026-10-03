-- P1-17 (docs/PRODUCT_ROADMAP.md): Overview says where the month is heading, not only where it is.
--
-- For the current month only, month_overview adds a forecast per category and for the month:
--   spent        what is already recorded (as before)
--   upcoming     recurring payments and installments still due this month: a rule whose next run
--                falls in the month has not been posted yet, so nothing is counted twice
--   rest         the expected spend on everything else for the days left, at this month's daily
--                pace of non-recurring spend. In the first days of a month one large purchase
--                would swing the pace, so until day 5 it is blended with the average of the three
--                months before (the blend leans on this month more each day)
--   forecast     spent + upcoming + rest
-- Past and future months get null: they have actual numbers, or nothing to go on.
-- A rule in another currency is priced at the latest rate, as a new expense would be; without
-- a rate it is left out rather than guessed.

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
  ), cats as (
    select c.id, c.name, c.sf_symbol, c.sort_order, c.budget_acknowledged,
           b.cap_minor as cap, coalesce(s.spent, 0) as spent,
           case when v_current then coalesce(u.upcoming, 0) end as upcoming,
           case when v_current then greatest(0, round(
             v_weight * (coalesce(s.variable, 0)::numeric / v_day * v_days)
             + (1 - v_weight) * greatest(coalesce(hi.avg_variable, 0), coalesce(s.variable, 0))
             - coalesce(s.variable, 0)))::bigint end as rest
    from public.categories c
    left join spent s on s.category_id = c.id
    left join history hi on hi.category_id = c.id
    left join upcoming u on u.category_id = c.id
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
    'currency', v_base,
    'income', v_income,
    'unassigned', v_income - coalesce(sum(coalesce(cap, 0)), 0),
    'total_cap', coalesce(sum(coalesce(cap, 0)), 0),
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
        'cap', cap, 'spent', spent,
        'pct', case when coalesce(cap, 0) > 0 then round(spent * 100.0 / cap) end,
        'no_budget', cap is null and not budget_acknowledged,
        'forecast', case when v_current then spent + upcoming + rest end
      ) order by sort_order, name), '[]'::jsonb)
  ) into v_result
  from cats;
  return v_result;
end $$;
