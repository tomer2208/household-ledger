-- P1-8 follow-up: suggest_category runs as people type, so it has to be quick. Measured on
-- 5,000 expenses: 120 ms for a match and 250 ms for none, because the title of every past
-- expense was normalized again on each call. app.normalize_merchant is IMMUTABLE, so it can be
-- indexed: an expression index serves the exact-title step (now ~1 ms), and a trigram index on
-- the same expression lets the close-match step pre-filter with pg_trgm's % operator (now ~8 ms).
-- % keeps candidates at similarity >= 0.3, a superset of the >= 0.75 the step accepts, so the
-- result is the same; merchant_aliases_trgm (migration 2, unused until now) serves aliases.

create index tx_norm_title on public.transactions (household_id, app.normalize_merchant(title))
  where deleted_at is null;
create index tx_norm_title_trgm on public.transactions using gin (app.normalize_merchant(title) extensions.gin_trgm_ops)
  where deleted_at is null;

create or replace function public.suggest_category(p_title text) returns jsonb
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
    where a.household_id = v_household and a.normalized operator(extensions.%) v_norm
    union all
    select t.category_id, extensions.similarity(app.normalize_merchant(t.title), v_norm)
    from public.transactions t
    join public.categories c on c.id = t.category_id and c.archived_at is null
    where t.household_id = v_household and t.deleted_at is null
      and t.occurred_at > now() - interval '365 days'
      and app.normalize_merchant(t.title) operator(extensions.%) v_norm
  ) s
  where s.sim >= 0.75
  order by s.sim desc
  limit 1;
  return v_result;
end $$;
