-- Web Push for the installed web app (PWA route, NEXT_SESSION C2). Runs next to the Expo
-- tokens: a person can have both, and push-dispatch sends to whatever exists.
--
-- VAPID keys live in Supabase Vault, not in this file. Set them once per project:
--   select vault.create_secret('<base64url public key>',  'vapid_public_key');
--   select vault.create_secret('<base64url private key>', 'vapid_private_key');
-- (scripts: supabase/scripts/vapid-keys.mjs prints a fresh pair.)

create table public.web_push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index web_push_subscriptions_user_idx on public.web_push_subscriptions (user_id);

alter table public.web_push_subscriptions enable row level security;
grant select, insert, update, delete on public.web_push_subscriptions to authenticated;
-- Each person manages only their own browsers; the partner never sees endpoints.
create policy self_all on public.web_push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- The browser needs the public key to subscribe. It is public by design.
create function public.web_push_public_key() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public_key' limit 1
$$;
revoke execute on function public.web_push_public_key() from public, anon;
grant execute on function public.web_push_public_key() to authenticated;

-- push-dispatch signs with the private key; only the service role can read it.
create function public.web_push_vapid() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'public_key',  (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public_key' limit 1),
    'private_key', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private_key' limit 1))
$$;
revoke execute on function public.web_push_vapid() from public, anon, authenticated;
grant execute on function public.web_push_vapid() to service_role;

-- Same claim as before, plus the household's web subscriptions.
create or replace function public.claim_push_alerts() returns jsonb
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
               where m.household_id = c.household_id and m.removed_at is null),
    'web', (select coalesce(jsonb_agg(jsonb_build_object('endpoint', w.endpoint, 'p256dh', w.p256dh, 'auth', w.auth)), '[]'::jsonb)
            from public.household_members m
            join public.web_push_subscriptions w on w.user_id = m.user_id
            where m.household_id = c.household_id and m.removed_at is null)
  )), '[]'::jsonb) into v
  from claimed c
  join public.categories cat on cat.id = c.category_id
  join public.households h on h.id = c.household_id;
  return v;
end $$;

-- Adds dead web endpoints (404/410 from the push service) to the cleanup.
drop function public.finish_push_alerts(jsonb, text[]);
create function public.finish_push_alerts(p_results jsonb, p_dead_tokens text[], p_dead_endpoints text[] default '{}')
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.budget_alerts a
  set push_status = r.status
  from jsonb_to_recordset(p_results) as r(category_id uuid, budget_month date, threshold smallint, status text)
  where a.category_id = r.category_id and a.budget_month = r.budget_month and a.threshold = r.threshold;

  delete from public.push_tokens where expo_push_token = any(coalesce(p_dead_tokens, '{}'));
  delete from public.web_push_subscriptions where endpoint = any(coalesce(p_dead_endpoints, '{}'));
end $$;
revoke execute on function public.finish_push_alerts(jsonb, text[], text[]) from public, anon, authenticated;
grant execute on function public.finish_push_alerts(jsonb, text[], text[]) to service_role;
