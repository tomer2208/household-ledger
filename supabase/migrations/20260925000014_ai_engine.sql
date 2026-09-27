-- Phase 4 data layer (BLUEPRINT §4). The iron rule lives here: every number an agent
-- mentions is computed in this file. Agents choose, rank and phrase; SQL counts.

-- ───────── monthly report: metrics ─────────

-- Keys (c1.., m1.., a1..) are what the narrative cites as {{categories.c1.spent}}.
create function app.report_metrics(p_household uuid, p_month date) returns jsonb
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
                else coalesce(app.cap_for(cat.id, p_month), 0) end as cap,
           app.spent_for(cat.id, p_month) as spent,
           app.spent_for(cat.id, m1) as prev_spent,
           (app.spent_for(cat.id, m1) + app.spent_for(cat.id, m2) + app.spent_for(cat.id, m3)) / 3 as avg3,
           (select count(*) from public.transactions t
            where t.category_id = cat.id and t.budget_month = p_month and t.deleted_at is null) as tx_count
    from public.categories cat
    where cat.household_id = p_household and cat.kind = 'expense'
  ),
  totals as (
    select coalesce(sum(cap), 0)::bigint cap, coalesce(sum(spent), 0)::bigint spent,
           coalesce(sum(prev_spent), 0)::bigint prev, coalesce(sum(avg3), 0)::bigint avg3,
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
      and t.amount_base_minor >= 20000
      and t.amount_base_minor >= 2 * coalesce((
            select avg(p.amount_base_minor) from public.transactions p
            where p.category_id = t.category_id and p.deleted_at is null and p.amount_base_minor > 0
              and p.budget_month between m3 and m1), t.amount_base_minor)
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

-- ───────── monthly report: queue ─────────

alter table public.monthly_reports drop constraint monthly_reports_status_check;
alter table public.monthly_reports add constraint monthly_reports_status_check
  check (status in ('pending','generating','ready','fallback','failed'));
alter table public.monthly_reports add column claimed_at timestamptz;
alter table public.monthly_reports add column updated_at timestamptz not null default now();

create function app.queue_monthly_report(p_household uuid, p_month date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.monthly_reports (household_id, budget_month, metrics, status)
  values (p_household, p_month, app.report_metrics(p_household, p_month), 'pending')
  on conflict (household_id, budget_month)
  do update set metrics = excluded.metrics, status = 'pending', narrative = null, updated_at = now();
  perform app.wake('monthly-report');
end $$;

-- "Regenerate" in the app. Only closed months: an open month's report would go stale.
create function public.request_monthly_report(p_month date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
begin
  if not app.is_month_closed(v_household, date_trunc('month', p_month)::date) then
    raise exception 'reports are written for closed months' using errcode = '22023';
  end if;
  perform app.queue_monthly_report(v_household, date_trunc('month', p_month)::date);
end $$;

create function public.claim_monthly_reports() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
begin
  with claimed as (
    update public.monthly_reports r set status = 'generating', claimed_at = now(), updated_at = now()
    where r.status = 'pending' or (r.status = 'generating' and r.claimed_at < now() - interval '15 minutes')
    returning r.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'household_id', c.household_id, 'budget_month', c.budget_month, 'metrics', c.metrics,
    'ai_enabled', h.ai_consent_at is not null)), '[]'::jsonb)
  into v
  from claimed c join public.households h on h.id = c.household_id;
  return v;
end $$;

-- ───────── advisor: candidates ─────────

create table app.advisor_dismissals (
  household_id uuid not null,
  dedupe_key   text not null,
  reason       text,
  created_at   timestamptz not null default now(),
  primary key (household_id, dedupe_key)
);

-- Deterministic detectors (BLUEPRINT §4.4.1). Each candidate carries its final payload;
-- the agent may only pick it, rank it and explain it.
create function public.advisor_candidates(p_household uuid) returns jsonb
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
        and ((s.dir = 'up' and s.new_cap > s.cur_cap) or (s.dir = 'down' and s.new_cap < s.cur_cap and s.new_cap > 0))
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

create function public.advisor_dismiss(p_household uuid, p_candidate_id text, p_reason text) returns void
language sql security definer set search_path = '' as $$
  insert into app.advisor_dismissals (household_id, dedupe_key, reason)
  values (p_household, p_candidate_id, left(p_reason, 300))
  on conflict (household_id, dedupe_key) do update set reason = excluded.reason, created_at = now();
$$;

-- ───────── advisor: one-tap approval ─────────

-- US-A2 AC2: approve runs the change in one transaction, audited as the agent's action.
-- Every kind re-checks the state it was computed from; if that moved, it fails as 'stale'.
create function public.decide_proposal(p_id uuid, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.agent_proposals;
  v_household uuid := app.require_household();
  v_month date := app.local_month(v_household, now());
  v_result jsonb;
  v_stale boolean := false;
  v_id uuid;
begin
  select * into p from public.agent_proposals where id = p_id and household_id = v_household for update;
  if not found then
    raise exception 'proposal not found' using errcode = 'P0002';
  end if;
  if p.status <> 'pending' or p.expires_at < now() then
    return jsonb_build_object('status', p.status);
  end if;

  if not p_approve then
    update public.agent_proposals set status = 'rejected', decided_by = auth.uid(), decided_at = now() where id = p.id;
    return jsonb_build_object('status', 'rejected');
  end if;

  perform set_config('app.actor_type', 'agent', true);
  perform set_config('app.actor_id', p.id::text, true);

  case p.kind
  when 'create_recurring' then
    if exists (select 1 from public.recurring_rules r
               where r.merchant_id = (p.payload->>'merchant_id')::uuid and r.deleted_at is null) then
      v_stale := true;
    else
      insert into public.recurring_rules (household_id, title, merchant_id, category_id, amount_minor, currency,
                                          amount_kind, interval_months, day_of_month, start_date, created_by)
      values (v_household, p.payload->>'title', (p.payload->>'merchant_id')::uuid, (p.payload->>'category_id')::uuid,
              (p.payload->>'amount_minor')::bigint, p.payload->>'currency', p.payload->>'amount_kind',
              (p.payload->>'interval_months')::smallint, (p.payload->>'day_of_month')::smallint,
              greatest((p.payload->>'start_date')::date, app.local_today(v_household)), auth.uid())
      returning id into v_id;
      update public.transactions set recurring_rule_id = v_id
      where household_id = v_household
        and id in (select jsonb_array_elements_text(p.payload->'link_transaction_ids')::uuid);
      v_result := jsonb_build_object('recurring_rule_id', v_id);
    end if;

  when 'update_estimate' then
    update public.recurring_rules set amount_minor = (p.payload->>'new_amount_minor')::bigint
    where id = (p.payload->>'rule_id')::uuid and household_id = v_household and deleted_at is null
      and amount_minor = (p.payload->>'old_amount_minor')::bigint;
    v_stale := not found;

  when 'adjust_budget' then
    if coalesce(app.cap_for((p.payload->>'category_id')::uuid, v_month), 0) <> (p.payload->>'old_cap_minor')::bigint then
      v_stale := true;
    else
      insert into public.category_budgets (category_id, household_id, effective_month, cap_minor, created_by)
      values ((p.payload->>'category_id')::uuid, v_household, v_month, (p.payload->>'new_cap_minor')::bigint, auth.uid())
      on conflict (category_id, effective_month) do update set cap_minor = excluded.cap_minor;
    end if;

  when 'recategorize_merchant' then
    update public.merchants set default_category_id = (p.payload->>'to_category_id')::uuid
    where id = (p.payload->>'merchant_id')::uuid and household_id = v_household
      and default_category_id is not distinct from (p.payload->>'from_category_id')::uuid;
    if not found then
      v_stale := true;
    else
      -- Closed months stay as they were closed; only the running months move.
      update public.transactions t set category_id = (p.payload->>'to_category_id')::uuid
      where t.household_id = v_household and t.merchant_id = (p.payload->>'merchant_id')::uuid
        and t.deleted_at is null
        and t.category_id is not distinct from (p.payload->>'from_category_id')::uuid
        and not app.is_month_closed(v_household, t.budget_month);
    end if;

  when 'flag_duplicate' then
    update public.transactions set deleted_at = now()
    where id = (p.payload->>'duplicate_transaction_id')::uuid and household_id = v_household and deleted_at is null
      and exists (select 1 from public.transactions k
                  where k.id = (p.payload->>'keep_transaction_id')::uuid and k.deleted_at is null);
    v_stale := not found;
  end case;

  if v_stale then
    update public.agent_proposals
    set status = 'failed', decided_by = auth.uid(), decided_at = now(), result = jsonb_build_object('reason', 'stale')
    where id = p.id;
    return jsonb_build_object('status', 'failed', 'reason', 'stale');
  end if;

  update public.agent_proposals
  set status = 'approved', decided_by = auth.uid(), decided_at = now(),
      result = coalesce(v_result, '{}'::jsonb) || jsonb_build_object('approved_by', auth.uid())
  where id = p.id;
  return jsonb_build_object('status', 'approved');
end $$;

revoke execute on function public.request_monthly_report(date), public.decide_proposal(uuid, boolean) from public, anon;
grant execute on function public.request_monthly_report(date), public.decide_proposal(uuid, boolean) to authenticated;
revoke execute on function public.claim_monthly_reports(), public.advisor_candidates(uuid),
  public.advisor_dismiss(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_monthly_reports(), public.advisor_candidates(uuid),
  public.advisor_dismiss(uuid, text, text) to service_role;

-- ───────── schedule ─────────

-- Same order as before, plus: queue the report for each month it closes, then let the
-- advisor look at the fresh closes.
create or replace function app.daily_maintenance() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  h record;
  v_today date;
  v_month date;
  v_created int := 0;
  v_closed int := 0;
  v_expired int;
begin
  perform set_config('app.actor_type', 'system', true);

  for h in select id, created_at, timezone from public.households where deleted_at is null loop
    v_today := (now() at time zone h.timezone)::date;
    v_created := v_created + app.run_recurring(h.id, v_today);

    for v_month in
      select generate_series(date_trunc('month', h.created_at at time zone h.timezone),
                             date_trunc('month', v_today::timestamp) - interval '1 month',
                             interval '1 month')::date
    loop
      if not app.is_month_closed(h.id, v_month) then
        perform app.close_month(h.id, v_month);
        perform app.queue_monthly_report(h.id, v_month);
        v_closed := v_closed + 1;
      end if;
    end loop;
  end loop;

  update public.agent_proposals set status = 'expired'
  where status = 'pending' and expires_at < now();
  get diagnostics v_expired = row_count;

  if v_closed > 0 then
    perform app.wake('advisor-run');
  end if;

  return jsonb_build_object('recurring_created', v_created, 'months_closed', v_closed,
                            'proposals_expired', v_expired);
end $$;

select cron.schedule('advisor-weekly', '0 6 * * 0', $$select app.wake('advisor-run')$$);
select cron.schedule('report-backstop', '*/15 * * * *',
  $$select app.wake('monthly-report') where exists (select 1 from public.monthly_reports where status in ('pending','generating'))$$);

alter publication supabase_realtime add table public.agent_proposals, public.monthly_reports;
