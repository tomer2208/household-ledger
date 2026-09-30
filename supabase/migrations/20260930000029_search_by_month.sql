-- P1-5 (docs/PRODUCT_ROADMAP.md): Overview can show past months, and tapping a category there
-- opens that month's expenses only. search_transactions gains an optional p_month (any day of
-- the month; matched against budget_month, so the household's clock decides, as everywhere).
-- A new parameter is a new signature: the five-argument version is dropped so PostgREST never
-- has two candidates for the same call. Everything else is unchanged from migration 28.

drop function public.search_transactions(text, uuid, timestamptz, uuid, int);

create or replace function public.search_transactions(
  p_query text default null,
  p_category uuid default null,
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_limit int default 50,
  p_month date default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
  v_text text := nullif(btrim(p_query), '');
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_result jsonb;
begin
  execute format($sql$
    select coalesce(jsonb_agg(to_jsonb(p) order by p.occurred_at desc, p.id desc), '[]'::jsonb)
    from (
      select t.id, t.title, t.raw_merchant, t.amount_minor, t.currency, t.amount_base_minor, t.fx_rate, t.fx_source,
             t.occurred_at, t.budget_month, t.status, t.source, t.category_id, t.note, t.card_label, t.created_by,
             t.recurring_rule_id, t.classification,
             jsonb_build_object('name', c.name, 'sf_symbol', c.sf_symbol) as categories
      from public.transactions t
      join public.categories c on c.id = t.category_id and c.household_id = $1
      where t.household_id = $1 and t.deleted_at is null
        %s %s %s %s
      order by t.occurred_at desc, t.id desc
      limit $6
    ) p $sql$,
    case when p_category is not null then 'and t.category_id = $2' else '' end,
    case when v_text is not null then 'and (t.title ilike $3 or t.raw_merchant ilike $3)' else '' end,
    case when p_before_at is not null then 'and (t.occurred_at, t.id) < ($4, $5)' else '' end,
    case when p_month is not null then 'and t.budget_month = $7' else '' end)
  into v_result
  using v_household, p_category,
        '%' || replace(replace(replace(coalesce(v_text, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%',
        p_before_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid), v_limit,
        date_trunc('month', p_month)::date;
  return v_result;
end $$;

revoke execute on function public.search_transactions(text, uuid, timestamptz, uuid, int, date) from public, anon;
grant execute on function public.search_transactions(text, uuid, timestamptz, uuid, int, date) to authenticated;
