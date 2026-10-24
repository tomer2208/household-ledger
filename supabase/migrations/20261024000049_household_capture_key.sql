-- One Apple Pay Shortcut for the whole household (docs/PRODUCT_ROADMAP.md, Apple Pay rework).
--
-- Until now each iPhone had its own token (hl_dev_…), made by its owner, so a Shortcut shared
-- by AirDrop logged every purchase as the person who built it. A household now has one key
-- (hl_hh_…) for the Shortcut, and the Shortcut also sends the iPhone's name (Get Device
-- Details → Device Name). The first purchase from an iPhone adds it to the household's devices
-- with no owner; someone picks whose it is once (assign_device), and the purchases it already
-- logged move to that person too. Until then they are the household's, with no one's name.
--
-- Each iPhone is still a row in device_tokens (with device_name instead of a token), so the
-- per-device rate limit, the quiet-Shortcut check and revoking one iPhone work as before.
-- Replacing the key stops every Shortcut that has the old one. Per-device tokens keep working.

create table public.household_capture_keys (
  household_id uuid primary key references public.households(id),
  token_hash   text not null unique,     -- sha256 hex; the key is shown once and never stored
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.household_capture_keys enable row level security;
revoke all on public.household_capture_keys from anon, authenticated;

create trigger audit after insert or update or delete on public.household_capture_keys
  for each row execute function app.audit();

-- An iPhone that came in with the household key: a name, and maybe an owner.
alter table public.device_tokens
  alter column user_id drop not null,
  alter column token_hash drop not null,
  add column device_name text check (length(btrim(device_name)) between 1 and 60),
  add constraint device_has_a_way_in check (token_hash is not null or device_name is not null);
create unique index device_tokens_household_name on public.device_tokens (household_id, lower(device_name))
  where token_hash is null;
grant select (device_name) on public.device_tokens to authenticated;

-- A new key replaces the household's old one. Returns the key, shown this once.
create function public.create_household_key() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
  v_key text := 'hl_hh_' || encode(extensions.gen_random_bytes(24), 'hex');
begin
  insert into public.household_capture_keys (household_id, token_hash, created_by)
  values (v_household, app.sha256_hex(v_key), auth.uid())
  on conflict (household_id) do update
    set token_hash = excluded.token_hash, created_by = excluded.created_by, created_at = now(), last_used_at = null;
  return v_key;
end $$;

-- Whether the household has a key, since when, and when a Shortcut last used it.
create function public.household_key() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('created_at', k.created_at, 'last_used_at', k.last_used_at,
                            'created_by', k.created_by)
  from public.household_capture_keys k
  where k.household_id = app.require_household();
$$;

-- Whose iPhone this is. Its purchases so far (logged with no owner) become that person's.
-- Returns how many moved.
create function public.assign_device(p_device_id uuid, p_user_id uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
  v_moved int;
begin
  if not exists (select 1 from public.household_members m
                 where m.household_id = v_household and m.user_id = p_user_id and m.removed_at is null) then
    raise exception 'that person is not in this household' using errcode = '22023';
  end if;
  update public.device_tokens d set user_id = p_user_id
  where d.id = p_device_id and d.household_id = v_household and d.token_hash is null;
  if not found then
    raise exception 'unknown device' using errcode = 'P0002';
  end if;
  -- what this iPhone logged (audit_log: actor 'device') before anyone said whose it was
  update public.transactions t set created_by = p_user_id
  where t.household_id = v_household and t.created_by is null
    and t.id in (select a.entity_id from public.audit_log a
                 where a.actor_type = 'device' and a.actor_id = p_device_id
                   and a.entity = 'transactions' and a.action = 'insert');
  get diagnostics v_moved = row_count;
  return v_moved;
end $$;

-- The Shortcut's way in: a device's own token, or the household key plus the iPhone's name.
-- Returns nothing for a wrong, replaced or revoked one. language is the owner's, or the
-- household's first member's while the iPhone has no owner.
drop function public.capture_auth(text);
create function public.capture_auth(p_token_hash text, p_device_name text default null)
returns table (device_id uuid, household_id uuid, user_id uuid, base_currency char(3), ai_enabled boolean, language text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_household uuid;
  v_name text := left(coalesce(nullif(btrim(regexp_replace(coalesce(p_device_name, ''), '[​-‏⁠﻿]', '', 'g')), ''), 'iPhone'), 60);
  v_device public.device_tokens;
begin
  -- a device's own token, as before
  return query
    update public.device_tokens d set last_used_at = now()
    from public.households h, public.household_members m
    where d.token_hash = p_token_hash and d.revoked_at is null
      and h.id = d.household_id and h.deleted_at is null
      and m.household_id = d.household_id and m.user_id = d.user_id and m.removed_at is null
    returning d.id, d.household_id, d.user_id, h.base_currency, h.ai_consent_at is not null, m.language;
  if found then return; end if;

  update public.household_capture_keys k set last_used_at = now()
  from public.households h
  where k.token_hash = p_token_hash and h.id = k.household_id and h.deleted_at is null
  returning k.household_id into v_household;
  if v_household is null then return; end if;

  -- this iPhone's row: found by name, or added on its first purchase
  insert into public.device_tokens (household_id, label, device_name)
  values (v_household, v_name, v_name)
  on conflict (household_id, lower(device_name)) where token_hash is null do nothing;
  update public.device_tokens d set last_used_at = now()
  where d.household_id = v_household and d.token_hash is null and lower(d.device_name) = lower(v_name)
  returning * into v_device;
  if v_device.revoked_at is not null then return; end if;

  return query
    select v_device.id, v_household, v_device.user_id, h.base_currency, h.ai_consent_at is not null,
           coalesce((select m.language from public.household_members m
                     where m.household_id = v_household and m.user_id = v_device.user_id and m.removed_at is null),
                    (select m.language from public.household_members m
                     where m.household_id = v_household and m.removed_at is null order by m.joined_at limit 1))
    from public.households h where h.id = v_household;
end $$;

revoke execute on function public.capture_auth(text, text) from public, anon, authenticated;
grant execute on function public.capture_auth(text, text) to service_role;
revoke execute on function public.create_household_key(), public.household_key(), public.assign_device(uuid, uuid)
  from public, anon;
grant execute on function public.create_household_key(), public.household_key(), public.assign_device(uuid, uuid)
  to authenticated;

-- Account deletion takes the key with it.
create or replace function app.purge_household(p_household uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.savings_goal_moves     where household_id = p_household;
  delete from public.savings_goals          where household_id = p_household;
  delete from public.savings_ledger         where household_id = p_household;
  delete from public.budget_alerts          where household_id = p_household;
  delete from public.month_closes           where household_id = p_household; -- unlocks category_budgets, household_income
  delete from public.category_rollovers     where household_id = p_household;
  delete from public.recurring_reserves     where household_id = p_household;
  delete from public.monthly_reports        where household_id = p_household;
  delete from public.agent_proposals        where household_id = p_household;
  delete from public.agent_runs             where household_id = p_household;
  delete from app.advisor_dismissals        where household_id = p_household;
  delete from public.transactions           where household_id = p_household;
  delete from public.recurring_rules        where household_id = p_household;
  delete from public.merchant_aliases       where household_id = p_household;
  delete from public.merchants              where household_id = p_household;
  delete from public.category_budgets       where household_id = p_household;
  delete from public.household_income       where household_id = p_household;
  delete from public.categories             where household_id = p_household;
  delete from public.device_tokens          where household_id = p_household;
  delete from public.household_capture_keys where household_id = p_household;
  delete from public.household_invites      where household_id = p_household;
  delete from public.household_members      where household_id = p_household;
  delete from public.households             where id = p_household;
  -- Last, because every delete above wrote an audit row.
  delete from public.audit_log              where household_id = p_household;
end $$;
revoke execute on function app.purge_household(uuid) from public, anon, authenticated;
