-- P1-13 (docs/PRODUCT_ROADMAP.md): the merchants the app has learned can be corrected. Until now a
-- wrong default category kept sorting every new purchase there, and the same shop learned under
-- two spellings stayed two merchants, with no way to fix either from the app.
--
--   list_merchants()                 every merchant with its category, aliases, use and last purchase
--   update_merchant(...)             rename, change the default category, and optionally move its
--                                    existing expenses there (a dry run first counts them). Closed
--                                    months are left as they were closed; an item waiting for review
--                                    is confirmed, since the category was just chosen for it.
--   remove_merchant_alias(...)       forget one learned spelling, so it is classified afresh
--   merge_merchants(into, from)      expenses, recurring rules and spellings of `from` move to `into`,
--                                    and `from` is deleted. A new purchase under any of its spellings
--                                    then lands on `into`.
-- Each checks that everything named belongs to the caller's household. The audit triggers on
-- merchants, aliases and transactions record every row changed.

create function public.list_merchants() returns jsonb
language sql stable security definer set search_path = '' as $$
  with h as (select app.require_household() as id),
  use as (
    select t.merchant_id, count(*) as tx_count, max(t.occurred_at) as last_at
    from public.transactions t, h
    where t.household_id = h.id and t.deleted_at is null and t.merchant_id is not null
    group by t.merchant_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id,
      'display_name', m.display_name,
      'default_category_id', m.default_category_id,
      'category', case when c.id is not null then jsonb_build_object('name', c.name, 'sf_symbol', c.sf_symbol) end,
      'tx_count', coalesce(u.tx_count, 0),
      'last_at', u.last_at,
      'aliases', coalesce((select jsonb_agg(jsonb_build_object('normalized', a.normalized, 'source', a.source)
                                            order by a.created_at)
                           from public.merchant_aliases a where a.merchant_id = m.id), '[]'::jsonb)
    ) order by coalesce(u.tx_count, 0) desc, lower(m.display_name)), '[]'::jsonb)
  from public.merchants m
  cross join h
  left join use u on u.merchant_id = m.id
  left join public.categories c on c.id = m.default_category_id
  where m.household_id = h.id
$$;

create function public.update_merchant(
  p_merchant uuid,
  p_name text,
  p_category uuid,
  p_apply_existing boolean default false,
  p_dry_run boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
  v_name text := btrim(p_name);
  v_moved int := 0;
  v_closed int := 0;
begin
  if not exists (select 1 from public.merchants m where m.id = p_merchant and m.household_id = v_household) then
    raise exception 'unknown merchant' using errcode = 'P0002';
  end if;
  if v_name is null or length(v_name) not between 1 and 60 then
    raise exception 'merchant names are 1 to 60 characters' using errcode = '22023';
  end if;
  if p_category is not null and not exists (
    select 1 from public.categories c
    where c.id = p_category and c.household_id = v_household and c.kind = 'expense' and c.archived_at is null) then
    raise exception 'unknown category' using errcode = 'P0002';
  end if;

  if p_apply_existing and p_category is not null then
    select count(*) filter (where not app.is_month_closed(v_household, t.budget_month)),
           count(*) filter (where app.is_month_closed(v_household, t.budget_month))
    into v_moved, v_closed
    from public.transactions t
    where t.household_id = v_household and t.merchant_id = p_merchant and t.deleted_at is null
      and t.category_id <> p_category;
  end if;
  if p_dry_run then
    return jsonb_build_object('moved', v_moved, 'closed', v_closed);
  end if;

  perform set_config('app.actor_type', 'user', true);
  update public.merchants
  set display_name = v_name, default_category_id = p_category, updated_at = now()
  where id = p_merchant;

  if p_apply_existing and p_category is not null then
    update public.transactions t
    set category_id = p_category,
        status = case when t.status = 'pending_review' then 'confirmed' else t.status end
    where t.household_id = v_household and t.merchant_id = p_merchant and t.deleted_at is null
      and t.category_id <> p_category
      and not app.is_month_closed(v_household, t.budget_month);
  end if;
  return jsonb_build_object('moved', v_moved, 'closed', v_closed);
end $$;

create function public.remove_merchant_alias(p_merchant uuid, p_normalized text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
begin
  perform set_config('app.actor_type', 'user', true);
  delete from public.merchant_aliases a
  where a.household_id = v_household and a.merchant_id = p_merchant and a.normalized = p_normalized;
  if not found then
    raise exception 'unknown merchant' using errcode = 'P0002';
  end if;
end $$;

create function public.merge_merchants(p_into uuid, p_from uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
  v_into public.merchants;
  v_from public.merchants;
  v_tx int;
  v_rules int;
  v_aliases int;
begin
  if p_into = p_from then
    raise exception 'a merchant cannot be merged into itself' using errcode = '22023';
  end if;
  select * into v_into from public.merchants m where m.id = p_into and m.household_id = v_household for update;
  select * into v_from from public.merchants m where m.id = p_from and m.household_id = v_household for update;
  if v_into.id is null or v_from.id is null then
    raise exception 'unknown merchant' using errcode = 'P0002';
  end if;

  perform set_config('app.actor_type', 'user', true);
  update public.transactions set merchant_id = p_into
  where household_id = v_household and merchant_id = p_from;
  get diagnostics v_tx = row_count;
  update public.recurring_rules set merchant_id = p_into
  where household_id = v_household and merchant_id = p_from;
  get diagnostics v_rules = row_count;
  update public.merchant_aliases set merchant_id = p_into
  where household_id = v_household and merchant_id = p_from;
  get diagnostics v_aliases = row_count;
  -- the merged-away name is a spelling of this shop too
  insert into public.merchant_aliases (household_id, normalized, merchant_id, source)
  select v_household, n, p_into, 'user'
  from (select app.normalize_merchant(v_from.display_name) as n) x
  where n is not null
  on conflict (household_id, normalized) do update set merchant_id = excluded.merchant_id, source = 'user';
  if v_into.default_category_id is null and v_from.default_category_id is not null then
    update public.merchants set default_category_id = v_from.default_category_id, updated_at = now() where id = p_into;
  end if;
  delete from public.merchants where id = p_from;

  return jsonb_build_object('transactions', v_tx, 'recurring', v_rules, 'aliases', v_aliases);
end $$;

revoke execute on function public.list_merchants(), public.update_merchant(uuid, text, uuid, boolean, boolean),
  public.remove_merchant_alias(uuid, text), public.merge_merchants(uuid, uuid) from public, anon;
grant execute on function public.list_merchants(), public.update_merchant(uuid, text, uuid, boolean, boolean),
  public.remove_merchant_alias(uuid, text), public.merge_merchants(uuid, uuid) to authenticated;
