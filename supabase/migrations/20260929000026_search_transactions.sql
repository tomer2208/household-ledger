-- R7 (docs/PRODUCT_ROADMAP.md): search and page through every expense, not the latest 300.
--
-- The Expenses screen loaded the newest 300 rows and searched and filtered them on the
-- phone, so an older purchase could not be found, a busy category showed only part of its
-- history, and the list simply stopped. search_transactions pages on the server:
-- - keyset pagination on (occurred_at, id), newest first: the next page starts strictly after
--   the last row of the previous one, so rows sharing a timestamp are never repeated or skipped
-- - optional text match on the title or the merchant as charged (ILIKE, any script, with
--   % _ \ in the query taken literally), backed by trigram indexes
-- - optional category
-- SECURITY INVOKER: row level security decides what is visible, exactly as for a plain select.
-- The explicit household condition is there for the planner (RLS alone can't use an index).

create index tx_keyset on public.transactions (household_id, occurred_at desc, id desc)
  where deleted_at is null;
create index tx_title_trgm on public.transactions using gin (title extensions.gin_trgm_ops)
  where deleted_at is null;
create index tx_raw_merchant_trgm on public.transactions using gin (raw_merchant extensions.gin_trgm_ops)
  where deleted_at is null;

create function public.search_transactions(
  p_query text default null,
  p_category uuid default null,
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_limit int default 50
) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with q as (
    select nullif(btrim(p_query), '') as text,
           '%' || replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
  ),
  page as (
    select t.id, t.title, t.raw_merchant, t.amount_minor, t.currency, t.amount_base_minor, t.fx_rate, t.fx_source,
           t.occurred_at, t.budget_month, t.status, t.source, t.category_id, t.note, t.card_label, t.created_by,
           t.recurring_rule_id, t.classification,
           jsonb_build_object('name', c.name, 'sf_symbol', c.sf_symbol) as categories
    from public.transactions t
    join public.categories c on c.id = t.category_id
    cross join q
    where t.household_id = app.current_household()
      and t.deleted_at is null
      and (p_category is null or t.category_id = p_category)
      and (q.text is null or t.title ilike q.pattern or t.raw_merchant ilike q.pattern)
      and (p_before_at is null or (t.occurred_at, t.id) < (p_before_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by t.occurred_at desc, t.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
  )
  select coalesce(jsonb_agg(to_jsonb(page) order by page.occurred_at desc, page.id desc), '[]'::jsonb) from page
$$;

revoke execute on function public.search_transactions(text, uuid, timestamptz, uuid, int) from public, anon;
grant execute on function public.search_transactions(text, uuid, timestamptz, uuid, int) to authenticated;
