-- The Apple Pay setup wizard: every member of the household can copy the household key on their
-- own phone, instead of it being shown once to whoever made it (the partner had to get it from
-- them). The key can only add purchases to this household (capture), never read or change
-- anything, and replacing it takes one tap, so members may see it like they see the invite code.
-- Keys made before this migration have no readable copy; the app offers to make a new one.

alter table public.household_capture_keys add column token text;

create or replace function public.create_household_key() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
  v_key text := 'hl_hh_' || encode(extensions.gen_random_bytes(24), 'hex');
begin
  insert into public.household_capture_keys (household_id, token_hash, token, created_by)
  values (v_household, app.sha256_hex(v_key), v_key, auth.uid())
  on conflict (household_id) do update
    set token_hash = excluded.token_hash, token = excluded.token, created_by = excluded.created_by,
        created_at = now(), last_used_at = null;
  return v_key;
end $$;

-- The key itself (null for a key made before it was kept), when it was made and last used.
create or replace function public.household_key() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('key', k.token, 'created_at', k.created_at, 'last_used_at', k.last_used_at,
                            'created_by', k.created_by)
  from public.household_capture_keys k
  where k.household_id = app.require_household();
$$;
