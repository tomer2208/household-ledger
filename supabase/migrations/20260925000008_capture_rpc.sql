-- RPCs used only by the capture Edge Function (service_role). BLUEPRINT §3.6.
-- The DB side of capture lives here so each step is one atomic, audited statement.

create function public.capture_auth(p_token_hash text)
returns table (device_id uuid, household_id uuid, user_id uuid, base_currency char(3), ai_enabled boolean)
language sql security definer set search_path = '' as $$
  update public.device_tokens d set last_used_at = now()
  from public.households h, public.household_members m
  where d.token_hash = p_token_hash and d.revoked_at is null
    and h.id = d.household_id and h.deleted_at is null
    and m.household_id = d.household_id and m.user_id = d.user_id and m.removed_at is null
  returning d.id, d.household_id, d.user_id, h.base_currency, h.ai_consent_at is not null;
$$;

create function public.capture_match(p_household uuid, p_raw text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_norm  text := app.normalize_merchant(p_raw);
  v_exact jsonb;
  v_fuzzy jsonb;
begin
  if v_norm is not null then
    select jsonb_build_object('merchant_id', m.id, 'display_name', m.display_name,
                              'category_id', m.default_category_id)
    into v_exact
    from public.merchant_aliases a join public.merchants m on m.id = a.merchant_id
    where a.household_id = p_household and a.normalized = v_norm;

    if v_exact is null then
      select coalesce(jsonb_agg(x order by x.similarity desc), '[]'::jsonb) into v_fuzzy
      from (
        select * from (
          select distinct on (m.id)
                 m.id as merchant_id, m.display_name, m.default_category_id as category_id,
                 round(extensions.similarity(a.normalized, v_norm)::numeric, 3) as similarity
          from public.merchant_aliases a join public.merchants m on m.id = a.merchant_id
          where a.household_id = p_household
            and extensions.similarity(a.normalized, v_norm) >= 0.3
          order by m.id, extensions.similarity(a.normalized, v_norm) desc
        ) best
        order by similarity desc limit 5
      ) x;
    end if;
  end if;

  return jsonb_build_object(
    'normalized', v_norm,
    'exact', v_exact,
    'fuzzy', coalesce(v_fuzzy, '[]'::jsonb),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name)
                                             order by c.sort_order, c.name), '[]'::jsonb)
                   from public.categories c
                   where c.household_id = p_household and c.kind = 'expense' and c.archived_at is null),
    -- H3 fallback when nothing better is known
    'fallback_category_id', (select c.id from public.categories c
                             where c.household_id = p_household and c.kind = 'expense' and c.archived_at is null
                             order by (lower(c.name) = 'other') desc, c.sort_order desc limit 1)
  );
end $$;

-- Idempotent: a repeat with the same key returns the stored row instead of a new one (US-C4).
create function public.capture_record(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := (p->>'household_id')::uuid;
  v_id uuid;
  v_dup boolean := false;
  v_tx public.transactions;
begin
  perform set_config('app.actor_type', 'device', true);
  perform set_config('app.actor_id', p->>'device_id', true);

  insert into public.transactions (
    household_id, created_by, source, status, title, raw_merchant, merchant_id, category_id,
    amount_minor, currency, occurred_at, card_label, classification, idempotency_key)
  values (
    v_household, (p->>'user_id')::uuid, 'apple_pay', p->>'status', p->>'title', p->>'raw_merchant',
    (p->>'merchant_id')::uuid, (p->>'category_id')::uuid,
    (p->>'amount_minor')::bigint, p->>'currency', (p->>'occurred_at')::timestamptz,
    p->>'card_label', p->'classification', p->>'idempotency_key')
  on conflict (household_id, idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    v_dup := true;
    select t.id into v_id from public.transactions t
    where t.household_id = v_household and t.idempotency_key = p->>'idempotency_key';
  elsif (p->>'alias_source') is not null and (p->>'merchant_id') is not null and (p->>'normalized') is not null then
    -- a confident fuzzy/LLM match teaches the exact alias, so next time is a plain lookup
    insert into public.merchant_aliases (household_id, normalized, merchant_id, source)
    values (v_household, p->>'normalized', (p->>'merchant_id')::uuid, p->>'alias_source')
    on conflict do nothing;
  end if;

  select * into v_tx from public.transactions t where t.id = v_id;
  return jsonb_build_object(
    'transaction_id', v_tx.id, 'duplicate', v_dup, 'status', v_tx.status, 'title', v_tx.title,
    'category_id', v_tx.category_id,
    'category_name', (select c.name from public.categories c where c.id = v_tx.category_id),
    'amount_minor', v_tx.amount_minor, 'currency', v_tx.currency);
end $$;

create function public.capture_confirm(
  p_device_id uuid, p_household uuid, p_transaction_id uuid,
  p_category_name text, p_new_category_name text, p_title text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tx public.transactions;
  v_cat uuid;
  v_created boolean := false;
  v_name text;
  v_kind text;
  v_title text;
  v_merchant uuid;
  v_norm text;
begin
  perform set_config('app.actor_type', 'device', true);
  perform set_config('app.actor_id', p_device_id::text, true);

  select * into v_tx from public.transactions t
  where t.id = p_transaction_id and t.household_id = p_household and t.deleted_at is null
  for update;
  if not found then
    raise exception 'transaction not found' using errcode = 'P0002';
  end if;
  if v_tx.status <> 'pending_review' then
    return jsonb_build_object('status', 'already_confirmed', 'category_id', v_tx.category_id);
  end if;

  if (nullif(btrim(p_category_name), '') is null) = (nullif(btrim(p_new_category_name), '') is null) then
    raise exception 'send exactly one of category_name or new_category_name' using errcode = '22023';
  end if;

  v_name := btrim(coalesce(nullif(btrim(p_new_category_name), ''), p_category_name));
  select c.id, c.kind into v_cat, v_kind from public.categories c
  where c.household_id = p_household and lower(c.name) = lower(v_name);

  if v_kind = 'savings' then
    raise exception 'Savings cannot hold expenses' using errcode = '22023';
  end if;

  if v_cat is null then
    if nullif(btrim(p_new_category_name), '') is null then
      raise exception 'unknown category %', v_name using errcode = 'P0002';
    end if;
    if length(v_name) > 30 then
      raise exception 'category name too long' using errcode = '22023';
    end if;
    -- US-C2 AC6: created at the register, no cap yet, flagged "No budget"
    insert into public.categories (household_id, name, sf_symbol, kind, sort_order, created_via, budget_acknowledged)
    values (p_household, v_name, 'tag', 'expense',
            (select coalesce(max(c.sort_order), 0) + 1 from public.categories c
             where c.household_id = p_household and c.kind = 'expense' and c.sort_order < 99),
            'shortcut', false)
    returning id into v_cat;
    v_created := true;
  else
    update public.categories set archived_at = null where id = v_cat and archived_at is not null;
  end if;

  v_title := left(coalesce(nullif(btrim(p_title), ''), v_tx.title), 60);

  if v_tx.merchant_id is null then
    insert into public.merchants (household_id, display_name, default_category_id)
    values (p_household, v_title, v_cat)
    returning id into v_merchant;
  else
    v_merchant := v_tx.merchant_id;
    update public.merchants set default_category_id = v_cat where id = v_merchant;
  end if;

  v_norm := app.normalize_merchant(v_tx.raw_merchant);
  if v_norm is not null then
    insert into public.merchant_aliases (household_id, normalized, merchant_id, source)
    values (p_household, v_norm, v_merchant, 'user')
    on conflict (household_id, normalized)
    do update set merchant_id = excluded.merchant_id, source = 'user';
  end if;

  update public.transactions
  set category_id = v_cat, title = v_title, merchant_id = v_merchant, status = 'confirmed',
      classification = coalesce(classification, '{}'::jsonb) || jsonb_build_object('method', 'user')
  where id = v_tx.id;

  return jsonb_build_object('status', 'confirmed', 'category_id', v_cat, 'category_name', v_name,
                            'created_category', v_created);
end $$;

revoke execute on function public.capture_auth(text), public.capture_match(uuid, text),
  public.capture_record(jsonb), public.capture_confirm(uuid, uuid, uuid, text, text, text)
from public, anon, authenticated;
grant execute on function public.capture_auth(text), public.capture_match(uuid, text),
  public.capture_record(jsonb), public.capture_confirm(uuid, uuid, uuid, text, text, text)
to service_role;

-- Exposed to the Edge Function so both sides normalize identically.
create function public.normalize_merchant(p_raw text) returns text
language sql immutable set search_path = '' as $$ select app.normalize_merchant(p_raw) $$;
revoke execute on function public.normalize_merchant(text) from public, anon;
grant execute on function public.normalize_merchant(text) to service_role, authenticated;
