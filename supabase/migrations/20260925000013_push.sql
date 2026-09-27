-- Push for budget alerts (US-S2). budget_alerts is the queue: the trigger in
-- 20260925000004 inserts a row per crossed threshold, push-dispatch drains it.
--
-- push-dispatch trusts nothing in the request that wakes it. It only drains rows that
-- are already queued here, so it needs no shared secret and a stray call is harmless.

alter table public.budget_alerts drop constraint budget_alerts_push_status_check;
alter table public.budget_alerts add constraint budget_alerts_push_status_check
  check (push_status in ('queued','sending','sent','suppressed','failed'));
alter table public.budget_alerts add column push_claimed_at timestamptz;

-- Per-environment values (functions URL) live in data, not in migrations.
create table if not exists app.config (
  key   text primary key,
  value text not null
);

create function app.function_url(p_name text) returns text
language sql stable set search_path = '' as $$
  select c.value || '/' || p_name from app.config c where c.key = 'functions_url';
$$;

-- Wake a function without waiting for it; pg_net sends after the transaction commits.
create function app.wake(p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text := app.function_url(p_name);
begin
  if v_url is not null then
    perform net.http_post(url := v_url, body := '{}'::jsonb,
                          headers := '{"Content-Type":"application/json"}'::jsonb);
  end if;
end $$;

create function app.budget_alerts_wake() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.wake('push-dispatch');
  return null;
end $$;

create trigger budget_alerts_wake after insert on public.budget_alerts
  for each statement execute function app.budget_alerts_wake();

-- Claims queued alerts (and ones stuck in 'sending' for 10 minutes after a crash) and
-- returns everything the function needs to write and address the notification.
create function public.claim_push_alerts() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
begin
  with claimed as (
    update public.budget_alerts a
    set push_status = 'sending', push_claimed_at = now()
    where a.push_status = 'queued'
       or (a.push_status = 'sending' and a.push_claimed_at < now() - interval '10 minutes')
    returning a.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'category_id', c.category_id,
    'budget_month', c.budget_month,
    'threshold', c.threshold,
    'spent_minor', c.spent_minor,
    'cap_minor', c.cap_minor,
    'category_name', cat.name,
    'currency', h.base_currency,
    'days_left', (date_trunc('month', now() at time zone h.timezone) + interval '1 month - 1 day')::date
                 - (now() at time zone h.timezone)::date,
    -- H7: a 90% alert that fired together with (or after) its 100% sibling stays silent
    'suppressed', c.threshold = 90 and exists (
        select 1 from public.budget_alerts b
        where b.category_id = c.category_id and b.budget_month = c.budget_month and b.threshold = 100),
    'tokens', (select coalesce(jsonb_agg(p.expo_push_token), '[]'::jsonb)
               from public.household_members m
               join public.push_tokens p on p.user_id = m.user_id
               where m.household_id = c.household_id and m.removed_at is null)
  )), '[]'::jsonb) into v
  from claimed c
  join public.categories cat on cat.id = c.category_id
  join public.households h on h.id = c.household_id;
  return v;
end $$;

create function public.finish_push_alerts(p_results jsonb, p_dead_tokens text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.budget_alerts a
  set push_status = r.status
  from jsonb_to_recordset(p_results) as r(category_id uuid, budget_month date, threshold smallint, status text)
  where a.category_id = r.category_id and a.budget_month = r.budget_month and a.threshold = r.threshold;

  -- Expo says these devices uninstalled the app or revoked permission.
  delete from public.push_tokens where expo_push_token = any(coalesce(p_dead_tokens, '{}'));
end $$;

revoke execute on function public.claim_push_alerts(), public.finish_push_alerts(jsonb, text[])
from public, anon, authenticated;
grant execute on function public.claim_push_alerts(), public.finish_push_alerts(jsonb, text[]) to service_role;

-- Backstop: if a wake-up request was lost, the queue still drains within 5 minutes.
create function app.push_backstop() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.budget_alerts where push_status in ('queued','sending')) then
    perform app.wake('push-dispatch');
  end if;
end $$;

select cron.schedule('push-backstop', '*/5 * * * *', $$select app.push_backstop()$$);
