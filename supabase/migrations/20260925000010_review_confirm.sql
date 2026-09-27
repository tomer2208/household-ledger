-- The in-app "To Review" queue must teach the merchant memory exactly like the
-- Shortcut menu does, so both paths share one function. Only the actor differs.

create function app.confirm_pending(
  p_household uuid, p_transaction_id uuid,
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
    insert into public.categories (household_id, name, sf_symbol, kind, sort_order, created_via, budget_acknowledged)
    values (p_household, v_name, 'tag', 'expense',
            (select coalesce(max(c.sort_order), 0) + 1 from public.categories c
             where c.household_id = p_household and c.kind = 'expense' and c.sort_order < 99),
            case when current_setting('app.actor_type', true) = 'device' then 'shortcut' else 'app' end,
            false)
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

create or replace function public.capture_confirm(
  p_device_id uuid, p_household uuid, p_transaction_id uuid,
  p_category_name text, p_new_category_name text, p_title text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.actor_type', 'device', true);
  perform set_config('app.actor_id', p_device_id::text, true);
  return app.confirm_pending(p_household, p_transaction_id, p_category_name, p_new_category_name, p_title);
end $$;

create function public.review_transaction(
  p_transaction_id uuid, p_category_name text, p_new_category_name text, p_title text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return app.confirm_pending(app.require_household(), p_transaction_id,
                             p_category_name, p_new_category_name, p_title);
end $$;

revoke execute on function public.review_transaction(uuid, text, text, text) from public, anon;
grant execute on function public.review_transaction(uuid, text, text, text) to authenticated;
