-- Recurring engine, daily maintenance, FX sync, cron. BLUEPRINT §3.7.

-- Pure helpers run in invoker triggers (recurring_rules) and in public.normalize_merchant.
grant execute on function app.clamp_day(date, int), app.first_occurrence(date, int),
  app.next_occurrence(date, int, int), app.local_today(uuid), app.normalize_merchant(text)
to authenticated, service_role;

create function app.run_recurring(p_household uuid, p_today date) returns int
language plpgsql security definer set search_path = '' as $$
declare
  r public.recurring_rules;
  v_tz text := (select h.timezone from public.households h where h.id = p_household);
  v_date date;
  v_count int := 0;
begin
  for r in
    select * from public.recurring_rules rr
    where rr.household_id = p_household and rr.deleted_at is null and not rr.paused
      and rr.next_run_date <= p_today
    for update
  loop
    -- one broken rule (e.g. a currency with no FX rate yet) must not stop the others
    begin
      v_date := r.next_run_date;
      -- catch up on every missed occurrence (US-R1 AC3); the unique key blocks duplicates
      while v_date <= p_today and (r.end_date is null or v_date <= r.end_date) loop
        insert into public.transactions (household_id, source, status, title, merchant_id, category_id,
          amount_minor, currency, occurred_at, recurring_rule_id, recurring_period)
        values (r.household_id, 'recurring',
                case r.amount_kind when 'fixed' then 'confirmed' else 'estimated' end,
                r.title, r.merchant_id, r.category_id, r.amount_minor, r.currency,
                (v_date + time '12:00') at time zone v_tz, r.id, v_date)
        on conflict (recurring_rule_id, recurring_period) do nothing;
        v_count := v_count + 1;
        v_date := app.next_occurrence(v_date, r.interval_months, r.day_of_month);
      end loop;
      update public.recurring_rules set next_run_date = v_date where id = r.id;
    exception when others then
      raise warning 'recurring rule % failed: %', r.id, sqlerrm;
    end;
  end loop;
  return v_count;
end $$;

-- One job, fixed order: recurring first, so the last day's standing orders land
-- in the month before it closes.
create function app.daily_maintenance() returns jsonb
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
        v_closed := v_closed + 1;
        -- Phase 4: queue monthly-report for this month here.
      end if;
    end loop;
  end loop;

  update public.agent_proposals set status = 'expired'
  where status = 'pending' and expires_at < now();
  get diagnostics v_expired = row_count;

  return jsonb_build_object('recurring_created', v_created, 'months_closed', v_closed,
                            'proposals_expired', v_expired);
end $$;

-- ───────── FX (ECB rates via Frankfurter, fetched from Postgres with pg_net) ─────────
-- No Edge Function and no secret needed: pg_net requests, a second job stores the reply.

create table app.fx_requests (
  request_id   bigint primary key,
  base         char(3) not null,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  outcome      text
);

create function app.fx_request() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_base char(3);
  v_quotes text;
  v_n int := 0;
begin
  for v_base in select distinct h.base_currency from public.households h where h.deleted_at is null loop
    select string_agg(distinct q, ',') into v_quotes
    from (
      select unnest(array['USD','EUR','GBP']) as q
      union
      select t.currency from public.transactions t
      join public.households h on h.id = t.household_id and h.base_currency = v_base
      union
      select r.currency from public.recurring_rules r
      join public.households h on h.id = r.household_id and h.base_currency = v_base
    ) s
    where q <> v_base;

    insert into app.fx_requests (request_id, base)
    values (net.http_get('https://api.frankfurter.dev/v1/latest?base=' || v_base || '&symbols=' || v_quotes), v_base);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create function app.fx_collect() returns int
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_body jsonb;
  v_n int := 0;
begin
  for r in
    select q.request_id, q.base, resp.status_code, resp.content, resp.error_msg
    from app.fx_requests q join net._http_response resp on resp.id = q.request_id
    where q.processed_at is null
  loop
    if r.status_code = 200 then
      v_body := r.content::jsonb;
      -- the API answers "1 base = x quote"; we store "1 quote = rate base"
      insert into public.fx_rates (rate_date, base, quote, rate, source)
      select (v_body->>'date')::date, r.base, e.key, round(1 / e.value::numeric, 8), 'frankfurter-ecb'
      from jsonb_each_text(v_body->'rates') e
      on conflict (rate_date, base, quote) do update set rate = excluded.rate;
      get diagnostics v_n = row_count;
      update app.fx_requests set processed_at = now(), outcome = 'ok' where request_id = r.request_id;
    else
      update app.fx_requests set processed_at = now(),
        outcome = 'http ' || coalesce(r.status_code::text, '-') || ' ' || coalesce(r.error_msg, '')
      where request_id = r.request_id;
    end if;
  end loop;
  return v_n;
end $$;

select cron.schedule('daily-maintenance', '30 1 * * *', $$select app.daily_maintenance()$$);
select cron.schedule('fx-request',        '0 15 * * *', $$select app.fx_request()$$);
select cron.schedule('fx-collect',        '5 15 * * *', $$select app.fx_collect()$$);
