-- P1-19 (docs/PRODUCT_ROADMAP.md), the notification half: when a month's report is written, the
-- household hears about it. Email waits for an email provider (R11, G1).
--
-- - A report that becomes ready (or falls back to the numbers-only version) is queued once:
--   push_status is set the first time and never reset, so writing it again sends nothing.
-- - Each member can turn report notices off (household_members.notify_reports, default on)
--   without turning off budget alerts.
-- - claim_push_alerts returns report notices next to budget alerts, each item saying its kind,
--   and finish_push_alerts records how each went. push-dispatch writes both, in each
--   recipient's language, and a report notice opens the report.

alter table public.monthly_reports
  add column push_status text check (push_status in ('queued', 'sending', 'sent', 'suppressed', 'failed')),
  add column push_claimed_at timestamptz;

alter table public.household_members add column notify_reports boolean not null default true;

create function app.report_notice() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status in ('ready', 'fallback') and new.push_status is null then
    new.push_status := 'queued';
  end if;
  return new;
end $$;

create trigger report_notice before insert or update of status on public.monthly_reports
  for each row execute function app.report_notice();

create function app.report_notice_wake() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.push_status = 'queued' and (tg_op = 'INSERT' or old.push_status is distinct from 'queued') then
    perform app.wake('push-dispatch');
  end if;
  return null;
end $$;

create trigger report_notice_wake after insert or update of push_status on public.monthly_reports
  for each row execute function app.report_notice_wake();

create function public.set_report_notices(p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  update public.household_members set notify_reports = coalesce(p_on, true)
  where user_id = auth.uid() and removed_at is null;
end $$;

revoke execute on function public.set_report_notices(boolean) from public, anon;
grant execute on function public.set_report_notices(boolean) to authenticated;

-- claim_push_alerts (migration 34) with report notices. Budget alerts are unchanged apart from
-- "kind"; a report notice reaches only the members who keep them on.
create or replace function public.claim_push_alerts() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_alerts jsonb;
  v_reports jsonb;
begin
  with claimed as (
    update public.budget_alerts a
    set push_status = 'sending', push_claimed_at = now()
    where a.push_status = 'queued'
       or (a.push_status = 'sending' and a.push_claimed_at < now() - interval '10 minutes')
    returning a.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', 'budget',
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
               where m.household_id = c.household_id and m.removed_at is null),
    'token_lang', (select coalesce(jsonb_object_agg(p.expo_push_token, m.language), '{}'::jsonb)
                   from public.household_members m
                   join public.push_tokens p on p.user_id = m.user_id
                   where m.household_id = c.household_id and m.removed_at is null),
    'web', (select coalesce(jsonb_agg(jsonb_build_object('endpoint', w.endpoint, 'p256dh', w.p256dh, 'auth', w.auth,
                                                         'lang', m.language)), '[]'::jsonb)
            from public.household_members m
            join public.web_push_subscriptions w on w.user_id = m.user_id
            where m.household_id = c.household_id and m.removed_at is null)
  )), '[]'::jsonb) into v_alerts
  from claimed c
  join public.categories cat on cat.id = c.category_id
  join public.households h on h.id = c.household_id;

  with claimed as (
    update public.monthly_reports r
    set push_status = 'sending', push_claimed_at = now()
    where r.push_status = 'queued'
       or (r.push_status = 'sending' and r.push_claimed_at < now() - interval '10 minutes')
    returning r.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', 'report',
    'report_id', c.id,
    'budget_month', c.budget_month,
    'currency', h.base_currency,
    'spent_minor', coalesce((c.metrics->'totals'->>'spent')::bigint, 0),
    'cap_minor', coalesce((c.metrics->'totals'->>'cap')::bigint, 0),
    'suppressed', false,
    'tokens', (select coalesce(jsonb_agg(p.expo_push_token), '[]'::jsonb)
               from public.household_members m
               join public.push_tokens p on p.user_id = m.user_id
               where m.household_id = c.household_id and m.removed_at is null and m.notify_reports),
    'token_lang', (select coalesce(jsonb_object_agg(p.expo_push_token, m.language), '{}'::jsonb)
                   from public.household_members m
                   join public.push_tokens p on p.user_id = m.user_id
                   where m.household_id = c.household_id and m.removed_at is null and m.notify_reports),
    'web', (select coalesce(jsonb_agg(jsonb_build_object('endpoint', w.endpoint, 'p256dh', w.p256dh, 'auth', w.auth,
                                                         'lang', m.language)), '[]'::jsonb)
            from public.household_members m
            join public.web_push_subscriptions w on w.user_id = m.user_id
            where m.household_id = c.household_id and m.removed_at is null and m.notify_reports)
  )), '[]'::jsonb) into v_reports
  from claimed c
  join public.households h on h.id = c.household_id;

  return v_alerts || v_reports;
end $$;

-- finish_push_alerts (migration 17): a result with a report_id belongs to a report notice.
create or replace function public.finish_push_alerts(p_results jsonb, p_dead_tokens text[], p_dead_endpoints text[] default '{}')
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.budget_alerts a
  set push_status = r.status
  from jsonb_to_recordset(p_results) as r(category_id uuid, budget_month date, threshold smallint, status text, report_id uuid)
  where r.report_id is null
    and a.category_id = r.category_id and a.budget_month = r.budget_month and a.threshold = r.threshold;

  update public.monthly_reports m
  set push_status = r.status
  from jsonb_to_recordset(p_results) as r(report_id uuid, status text)
  where r.report_id is not null and m.id = r.report_id;

  delete from public.push_tokens where expo_push_token = any(coalesce(p_dead_tokens, '{}'));
  delete from public.web_push_subscriptions where endpoint = any(coalesce(p_dead_endpoints, '{}'));
end $$;

-- Reports written before this migration are history: nothing to announce now.
update public.monthly_reports set push_status = 'suppressed' where push_status is null and status in ('ready', 'fallback');
