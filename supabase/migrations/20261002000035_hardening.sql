-- R8 + T13 (docs/PRODUCT_ROADMAP.md): hardening before the app opens to the public.
--
-- 1. join_household is rate limited: 10 wrong codes an hour and 30 a day per person
--    (app.rate_windows, migration 20). A wrong code now returns null instead of raising,
--    because an exception would roll back the attempt it should count; the app treats null
--    as "invalid or expired". Joining successfully never counts.
-- 2. What members may write on their household is checked: a real time zone (a bad one would
--    break every month boundary of that household), a three-letter currency, and consent
--    stamped with the server's clock. `settings` is unused by the app, so members can no
--    longer write it, and it must stay a small JSON object.
-- 3. Internal functions (schema app) were executable by every role: migration 1's default
--    privileges never took. The API does not expose this schema, so nothing could reach
--    them, but they are now locked anyway. Signed-in users keep only what their own
--    queries run: the RLS membership check and the helpers of the recurring-rule trigger.

-- ───────── 1. join_household ─────────

create or replace function public.join_household(p_code text, p_display_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_invite public.household_invites;
  v_hour_key text := 'join:h:' || auth.uid();
  v_day_key text := 'join:d:' || auth.uid();
  v_tries_hour int;
  v_tries_day int;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if app.current_household() is not null then
    raise exception 'already a member of a household' using errcode = 'unique_violation';
  end if;

  select coalesce(sum(w.hits) filter (where w.key = v_hour_key), 0),
         coalesce(sum(w.hits) filter (where w.key = v_day_key), 0)
  into v_tries_hour, v_tries_day
  from app.rate_windows w
  where (w.key = v_hour_key and w.window_start = to_timestamp(floor(extract(epoch from now()) / 3600) * 3600))
     or (w.key = v_day_key and w.window_start = to_timestamp(floor(extract(epoch from now()) / 86400) * 86400));
  if v_tries_hour >= 10 or v_tries_day >= 30 then
    raise exception 'too many invite attempts, try again later' using errcode = '54000';
  end if;

  select * into v_invite from public.household_invites i
  where i.code_hash = app.sha256_hex(upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g')))
    and i.used_at is null and i.expires_at > now()
  for update;
  if not found then
    perform public.rate_hit(v_hour_key, 3600, 10);
    perform public.rate_hit(v_day_key, 86400, 30);
    return null;
  end if;

  insert into public.household_members (household_id, user_id, display_name)
  values (v_invite.household_id, auth.uid(), btrim(p_display_name))
  on conflict (household_id, user_id) do update set removed_at = null, display_name = excluded.display_name;

  update public.household_invites set used_by = auth.uid(), used_at = now() where id = v_invite.id;
  return v_invite.household_id;
end $$;

-- ───────── 2. what members write on their household ─────────

create function app.households_validate() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (tg_op = 'INSERT' or new.timezone is distinct from old.timezone)
     and not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
    raise exception 'unknown time zone' using errcode = '22023';
  end if;
  if new.base_currency !~ '^[A-Z]{3}$' then
    raise exception 'currency must be a three-letter code' using errcode = '22023';
  end if;
  -- consent is when the server saw it given, not whatever time a client sends
  if new.ai_consent_at is not null and (tg_op = 'INSERT' or new.ai_consent_at is distinct from old.ai_consent_at) then
    new.ai_consent_at := now();
  end if;
  return new;
end $$;

create trigger households_validate before insert or update on public.households
  for each row execute function app.households_validate();

revoke update (settings) on public.households from authenticated;
alter table public.households
  add constraint households_settings_shape
  check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 4096);

-- ───────── 3. internal functions ─────────

revoke execute on all functions in schema app from public, anon, authenticated;
grant execute on function
  app.is_member(uuid),
  app.local_month(uuid, timestamptz),
  app.local_today(uuid),
  app.first_occurrence(date, int),
  app.next_occurrence(date, int, int),
  app.clamp_day(date, int),
  app.normalize_merchant(text)
to authenticated;

alter default privileges for role postgres in schema app revoke execute on functions from public;
