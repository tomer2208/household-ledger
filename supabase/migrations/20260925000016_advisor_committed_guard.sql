-- A budget cut must leave room for the standing orders already booked to that category
-- (found on seeded data: Utilities was offered ₪250 while a ₪420 electricity rule starts next month).

create or replace function public.advisor_candidates(p_household uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text := (select h.timezone from public.households h where h.id = p_household);
  v_month date := app.local_month(p_household, now());
  v_today date := app.local_today(p_household);
  v_closed date[];
  v jsonb := '[]'::jsonb;
begin
  select array_agg(budget_month order by budget_month desc) into v_closed
  from (select c.budget_month from public.month_closes c where c.household_id = p_household
        order by c.budget_month desc limit 3) x;

  -- 1. create_recurring: typed in by hand every month at a stable amount. Apple Pay rows
  -- are excluded on purpose: a rule for them would double-log every charge.
  v := v || coalesce((
    select jsonb_agg(jsonb_build_object(
      'candidate_id', 'rec:' || a.merchant_id, 'kind', 'create_recurring',
      'payload', jsonb_build_object('merchant_id', a.merchant_id, 'title', m.display_name, 'category_id', a.cat,
                   'amount_minor', round(a.med_amt)::bigint, 'currency', a.cur, 'amount_kind', 'fixed',
                   'interval_months', 1, 'day_of_month', a.dom::int, 'link_transaction_ids', to_jsonb(a.ids),
                   'start_date', a.last_date + 1),
      'evidence', jsonb_build_object('name', m.display_name, 'amount', jsonb_build_object('money', round(a.med_amt)::bigint),
                   'count', a.n, 'gap_days', round(a.med_gap)::int)))
    from (
      select g.merchant_id, count(*) n, avg(g.amount_minor) avg_amt, stddev_pop(g.amount_minor) sd,
             percentile_cont(0.5) within group (order by g.gap) med_gap,
             percentile_cont(0.5) within group (order by g.amount_minor) med_amt,
             mode() within group (order by g.dom) dom, max(g.currency) cur,
             mode() within group (order by g.category_id) cat, array_agg(g.id) ids, max(g.local_date) last_date
      from (
        select t.id, t.merchant_id, t.amount_minor, t.currency, t.category_id,
               extract(day from t.occurred_at at time zone v_tz) dom,
               (t.occurred_at at time zone v_tz)::date local_date,
               extract(epoch from t.occurred_at - lag(t.occurred_at) over (partition by t.merchant_id order by t.occurred_at)) / 86400 gap
        from public.transactions t
        where t.household_id = p_household and t.merchant_id is not null and t.deleted_at is null
          and t.source = 'manual' and t.amount_minor > 0 and t.occurred_at > now() - interval '120 days'
      ) g
      group by g.merchant_id
    ) a
    join public.merchants m on m.id = a.merchant_id
    where a.n >= 3 and a.sd / nullif(a.avg_amt, 0) < 0.10 and a.med_gap between 25 and 35
      and not exists (select 1 from public.recurring_rules r
                      where r.merchant_id = a.merchant_id and r.deleted_at is null)
  ), '[]'::jsonb);

  -- 2. update_estimate: the last two real bills both missed the estimate by more than 15%.
  v := v || coalesce((
    select jsonb_agg(jsonb_build_object(
      'candidate_id', 'est:' || r.id || ':' || to_char(v_month, 'YYYY-MM'), 'kind', 'update_estimate',
      'payload', jsonb_build_object('rule_id', r.id, 'old_amount_minor', r.amount_minor,
                   'new_amount_minor', (round(x.avg_amt / 1000.0) * 1000)::bigint),
      'evidence', jsonb_build_object('name', r.title, 'estimate', jsonb_build_object('money', r.amount_minor),
                   'actual_avg', jsonb_build_object('money', round(x.avg_amt)::bigint),
                   'bills', x.n)))
    from public.recurring_rules r
    join lateral (
      select count(*) n, avg(q.amount_minor) avg_amt,
             bool_and(abs(q.amount_minor - r.amount_minor) > 0.15 * r.amount_minor) filter (where q.rn <= 2) both_off
      from (select t.amount_minor, row_number() over (order by t.recurring_period desc) rn
            from public.transactions t
            where t.recurring_rule_id = r.id and t.status = 'confirmed' and t.deleted_at is null
            order by t.recurring_period desc limit 3) q
    ) x on true
    where r.household_id = p_household and r.deleted_at is null and r.amount_kind = 'estimated'
      and x.n >= 2 and x.both_off
      and (round(x.avg_amt / 1000.0) * 1000)::bigint <> r.amount_minor
  ), '[]'::jsonb);

  -- 3/4. adjust_budget: over the cap in 2 of the last 3 closed months, or under 60% for all 3.
  if coalesce(array_length(v_closed, 1), 0) >= 2 then
    v := v || coalesce((
      select jsonb_agg(jsonb_build_object(
        'candidate_id', 'cap:' || s.id || ':' || s.dir || ':' || to_char(v_month, 'YYYY-MM'), 'kind', 'adjust_budget',
        'payload', jsonb_build_object('category_id', s.id, 'effective_month', v_month,
                     'old_cap_minor', s.cur_cap, 'new_cap_minor', s.new_cap),
        'evidence', jsonb_build_object('name', s.name, 'direction', s.dir, 'months', s.months,
                     'over_months', s.over_n, 'under_months', s.under_n,
                     'old_cap', jsonb_build_object('money', s.cur_cap), 'new_cap', jsonb_build_object('money', s.new_cap),
                     'typical', jsonb_build_object('money', s.p75))))
      from (
        select c.id, c.name, coalesce(app.cap_for(c.id, v_month), 0) cur_cap,
               count(*) months,
               count(*) filter (where app.spent_for(c.id, mm) > app.cap_for(c.id, mm)) over_n,
               count(*) filter (where app.spent_for(c.id, mm) < 0.6 * app.cap_for(c.id, mm)) under_n,
               percentile_cont(0.75) within group (order by app.spent_for(c.id, mm))::bigint p75,
               (ceil(percentile_cont(0.75) within group (order by app.spent_for(c.id, mm)) / 5000.0) * 5000)::bigint new_cap,
               case when count(*) filter (where app.spent_for(c.id, mm) > app.cap_for(c.id, mm)) >= 2 then 'up'
                    when count(*) filter (where app.spent_for(c.id, mm) < 0.6 * app.cap_for(c.id, mm)) = 3 then 'down' end dir
        from public.categories c cross join unnest(v_closed) as mm
        where c.household_id = p_household and c.kind = 'expense' and c.archived_at is null
          and coalesce(app.cap_for(c.id, v_month), 0) > 0
        group by c.id, c.name
      ) s
      where s.dir is not null
        and ((s.dir = 'up' and s.new_cap > s.cur_cap)
          -- never suggest a cut the running month has already blown through
          or (s.dir = 'down' and s.new_cap < s.cur_cap and s.new_cap > 0 and app.spent_for(s.id, v_month) < s.new_cap
              -- and never below what recurring rules already commit to this category each month
              and s.new_cap >= coalesce((select sum(r.amount_minor / r.interval_months) from public.recurring_rules r
                                         where r.category_id = s.id and r.deleted_at is null and not r.paused), 0)))
    ), '[]'::jsonb);
  end if;

  -- 5. recategorize_merchant: someone moved this merchant's expenses to the same other
  -- category at least twice (read from the audit log).
  v := v || coalesce((
    select jsonb_agg(jsonb_build_object(
      'candidate_id', 'recat:' || x.merchant_id || ':' || x.to_cat, 'kind', 'recategorize_merchant',
      'payload', jsonb_build_object('merchant_id', x.merchant_id, 'from_category_id', m.default_category_id,
                   'to_category_id', x.to_cat),
      'evidence', jsonb_build_object('name', m.display_name, 'from', fc.name, 'to', tc.name, 'times', x.n)))
    from (
      select (l.after->>'merchant_id')::uuid merchant_id, (l.after->>'category_id')::uuid to_cat, count(*) n
      from public.audit_log l
      where l.household_id = p_household and l.entity = 'transactions' and l.action = 'update'
        and l.actor_type = 'user' and l.after->>'merchant_id' is not null
        and l.before->>'category_id' is distinct from l.after->>'category_id'
        and l.at > now() - interval '90 days'
      group by 1, 2
    ) x
    join public.merchants m on m.id = x.merchant_id
    join public.categories tc on tc.id = x.to_cat
    left join public.categories fc on fc.id = m.default_category_id
    where x.n >= 2 and m.default_category_id is distinct from x.to_cat
  ), '[]'::jsonb);

  -- 6. flag_duplicate: same amount at the same merchant within 24h, entered two different ways.
  v := v || coalesce((
    select jsonb_agg(jsonb_build_object(
      'candidate_id', 'dup:' || a.id || ':' || b.id, 'kind', 'flag_duplicate',
      'payload', jsonb_build_object('keep_transaction_id', a.id, 'duplicate_transaction_id', b.id),
      'evidence', jsonb_build_object('name', a.title, 'amount', jsonb_build_object('money', a.amount_base_minor),
                   'first_source', a.source, 'second_source', b.source)))
    from public.transactions a
    join public.transactions b
      on b.household_id = a.household_id and b.id <> a.id
     and b.amount_minor = a.amount_minor and b.currency = a.currency
     and (b.merchant_id = a.merchant_id or lower(b.title) = lower(a.title))
     and b.occurred_at >= a.occurred_at and b.occurred_at < a.occurred_at + interval '24 hours'
     and (b.source <> a.source or b.created_by is distinct from a.created_by)
     and (b.occurred_at > a.occurred_at or b.id > a.id)
    where a.household_id = p_household and a.deleted_at is null and b.deleted_at is null
      and a.occurred_at > now() - interval '30 days'
      and a.source <> 'recurring' and b.source <> 'recurring'
  ), '[]'::jsonb);

  -- Never offer something already proposed, or dismissed in the last 30 days.
  return coalesce((
    select jsonb_agg(e) from jsonb_array_elements(v) e
    where not exists (select 1 from public.agent_proposals p
                      where p.household_id = p_household and p.dedupe_key = e->>'candidate_id')
      and not exists (select 1 from app.advisor_dismissals d
                      where d.household_id = p_household and d.dedupe_key = e->>'candidate_id'
                        and d.created_at > now() - interval '30 days')
  ), '[]'::jsonb);
end $$;
