-- P1-8 (docs/PRODUCT_ROADMAP.md): faster manual entry. Most cash, Bit and bank-transfer expenses
-- repeat (the market, the babysitter, the building committee), so Add offers them back.
--
-- recent_expense_templates(): the household's most repeated manual expenses of the last 60
-- days, grouped by normalized title (app.normalize_merchant, so "Market 12" and "market" are
-- one), most frequent first, each with its latest title, category and amount. Refunds, deleted
-- rows and archived categories are left out.
--
-- suggest_category(p_title): the category a title most likely belongs to, from what the
-- household already taught the app, or null. In order: a merchant the Shortcut learned
-- (exact alias), a past expense with the same normalized title (most used category), then a
-- close match to either (trigram similarity >= 0.75, the Shortcut's own bar for "same place").

create function public.recent_expense_templates() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'title', top.title, 'category_id', top.category_id, 'amount_minor', top.amount_minor,
             'currency', top.currency, 'uses', top.uses) order by top.uses desc, top.last_at desc)
    from (
      select g.* from (
        select distinct on (x.norm)
               x.norm, x.title, x.category_id, x.amount_minor, x.currency, x.occurred_at as last_at,
               count(*) over (partition by x.norm) as uses
        from (
          select app.normalize_merchant(t.title) as norm, t.title, t.category_id, t.amount_minor, t.currency, t.occurred_at
          from public.transactions t
          join public.categories c on c.id = t.category_id and c.household_id = v_household and c.archived_at is null
          where t.household_id = v_household and t.deleted_at is null and t.source = 'manual'
            and t.amount_minor > 0 and t.occurred_at > now() - interval '60 days'
        ) x
        where x.norm is not null
        order by x.norm, x.occurred_at desc
      ) g
      order by g.uses desc, g.last_at desc
      limit 6
    ) top
  ), '[]'::jsonb);
end $$;

create function public.suggest_category(p_title text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
  v_norm text := app.normalize_merchant(p_title);
  v_result jsonb;
begin
  if v_norm is null or length(v_norm) < 2 then
    return null;
  end if;

  -- 1. a merchant the Shortcut already learned
  select jsonb_build_object('category_id', m.default_category_id, 'source', 'merchant')
  into v_result
  from public.merchant_aliases a
  join public.merchants m on m.id = a.merchant_id
  join public.categories c on c.id = m.default_category_id and c.archived_at is null
  where a.household_id = v_household and a.normalized = v_norm;
  if v_result is not null then return v_result; end if;

  -- 2. past expenses with the same title, most used category
  select jsonb_build_object('category_id', t.category_id, 'source', 'history')
  into v_result
  from public.transactions t
  join public.categories c on c.id = t.category_id and c.archived_at is null
  where t.household_id = v_household and t.deleted_at is null
    and t.occurred_at > now() - interval '365 days'
    and app.normalize_merchant(t.title) = v_norm
  group by t.category_id
  order by count(*) desc, max(t.occurred_at) desc
  limit 1;
  if v_result is not null then return v_result; end if;

  -- 3. a close match to a learned merchant or a past title
  select jsonb_build_object('category_id', s.category_id, 'source', 'similar')
  into v_result
  from (
    select m.default_category_id as category_id, extensions.similarity(a.normalized, v_norm) as sim
    from public.merchant_aliases a
    join public.merchants m on m.id = a.merchant_id
    join public.categories c on c.id = m.default_category_id and c.archived_at is null
    where a.household_id = v_household
    union all
    select t.category_id, extensions.similarity(app.normalize_merchant(t.title), v_norm)
    from public.transactions t
    join public.categories c on c.id = t.category_id and c.archived_at is null
    where t.household_id = v_household and t.deleted_at is null
      and t.occurred_at > now() - interval '365 days'
  ) s
  where s.sim >= 0.75
  order by s.sim desc
  limit 1;
  return v_result;
end $$;

revoke execute on function public.recent_expense_templates() from public, anon;
grant execute on function public.recent_expense_templates() to authenticated;
revoke execute on function public.suggest_category(text) from public, anon;
grant execute on function public.suggest_category(text) to authenticated;
