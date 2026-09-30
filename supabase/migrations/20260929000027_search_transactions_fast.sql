-- R7 follow-up: look the household up once per call, not once per row.
-- In a WHERE clause app.current_household() (a SECURITY DEFINER function) is evaluated for
-- every candidate row; wrapped in a sub-select it becomes one init-plan. Measured on 20,000
-- expenses: a page went from about 150 ms to about 6 ms. Same results, same signature.

create or replace function public.search_transactions(
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
    where t.household_id = (select app.current_household())
      and t.deleted_at is null
      and (p_category is null or t.category_id = p_category)
      and (q.text is null or t.title ilike q.pattern or t.raw_merchant ilike q.pattern)
      and (p_before_at is null or (t.occurred_at, t.id) < (p_before_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by t.occurred_at desc, t.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
  )
  select coalesce(jsonb_agg(to_jsonb(page) order by page.occurred_at desc, page.id desc), '[]'::jsonb) from page
$$;
