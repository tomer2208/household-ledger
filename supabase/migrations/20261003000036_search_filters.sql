-- P1-9 (docs/PRODUCT_ROADMAP.md): Expenses can be filtered by more than text, category and
-- month, and shows what the filtered expenses add up to.
--
-- find_transactions(p_filter, cursor, limit) pages through the matches, and
-- summarize_transactions(p_filter) totals all of them, not just the pages loaded. Both read the
-- same filter, a JSON object whose fields are all optional:
--   q            text in the title or the merchant
--   categories   category ids (any of them)
--   month_from   first budget month, month_to last one ('YYYY-MM-DD', any day of the month):
--                the household's budget months, exactly as Overview counts them
--   from, to     calendar days on the household's clock, both included
--   min, max     size of the amount in the base currency, minor units (a refund of 50 is 50)
--   members      who added it (user ids)
--   sources      'apple_pay', 'manual', 'recurring'
--   kind         'expense' (positive), 'refund' (negative) or 'review' (waiting to be checked)
-- A malformed filter is refused with 'bad search filter'. Both live in app.tx_search, so the
-- list and its total can never disagree. search_transactions (migrations 26-33) keeps its
-- signature, for app versions still open on phones, and now calls the same code.

-- 'a%b' matches the text "a%b" literally, anywhere in the title.
create function app.ilike_pattern(p text) returns text
language sql immutable set search_path = '' as $$
  select '%' || replace(replace(replace(p, '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

create function app.tx_search(p_filter jsonb, p_before_at timestamptz, p_before_id uuid, p_limit int, p_summary boolean)
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_household uuid := app.require_household();
  f jsonb := coalesce(p_filter, '{}'::jsonb);
  v_tz text;
  v_text text;
  v_cats uuid[];
  v_members uuid[];
  v_sources text[];
  v_month_from date;
  v_month_to date;
  v_from timestamptz;
  v_to timestamptz;
  v_min bigint;
  v_max bigint;
  v_kind text;
  v_where text;
  v_result jsonb;
begin
  select h.timezone into v_tz from public.households h where h.id = v_household;
  begin
    if jsonb_typeof(f) <> 'object' then
      raise exception 'not an object';
    end if;
    v_text := nullif(btrim(f->>'q'), '');
    v_cats := nullif(array(select jsonb_array_elements_text(coalesce(f->'categories', '[]')))::uuid[], '{}');
    v_members := nullif(array(select jsonb_array_elements_text(coalesce(f->'members', '[]')))::uuid[], '{}');
    v_sources := nullif(array(select jsonb_array_elements_text(coalesce(f->'sources', '[]'))), '{}');
    v_month_from := date_trunc('month', (f->>'month_from')::date)::date;
    v_month_to := date_trunc('month', (f->>'month_to')::date)::date;
    v_from := (f->>'from')::date::timestamp at time zone v_tz;
    v_to := ((f->>'to')::date + 1)::timestamp at time zone v_tz;
    v_min := (f->>'min')::bigint;
    v_max := (f->>'max')::bigint;
    v_kind := f->>'kind';
  exception when others then
    raise exception 'bad search filter' using errcode = '22023';
  end;
  if cardinality(v_cats) > 100 or cardinality(v_members) > 20
     or not coalesce(v_sources <@ array['apple_pay', 'manual', 'recurring'], true)
     or v_kind not in ('expense', 'refund', 'review')
     or v_min < 0 or v_max < 0 or length(v_text) > 80 then
    raise exception 'bad search filter' using errcode = '22023';
  end if;

  v_where := concat_ws(' ',
    case when v_cats is not null then 'and t.category_id = any($2)' end,
    case when v_text is not null then 'and (t.title ilike $3 or t.raw_merchant ilike $3)' end,
    case when v_month_from is not null then 'and t.budget_month >= $4' end,
    case when v_month_to is not null then 'and t.budget_month <= $5' end,
    case when v_from is not null then 'and t.occurred_at >= $6' end,
    case when v_to is not null then 'and t.occurred_at < $7' end,
    case when v_min is not null then 'and abs(t.amount_base_minor) >= $8' end,
    case when v_max is not null then 'and abs(t.amount_base_minor) <= $9' end,
    case when v_members is not null then 'and t.created_by = any($10)' end,
    case when v_sources is not null then 'and t.source = any($11)' end,
    case v_kind when 'expense' then 'and t.amount_minor > 0'
                when 'refund' then 'and t.amount_minor < 0'
                when 'review' then $q$and t.status = 'pending_review'$q$ end,
    case when p_before_at is not null and not p_summary then 'and (t.occurred_at, t.id) < ($12, $13)' end);

  if p_summary then
    execute format($sql$
      select jsonb_build_object(
        'count', count(*),
        'total_minor', coalesce(sum(t.amount_base_minor), 0),
        'spent_minor', coalesce(sum(t.amount_base_minor) filter (where t.amount_base_minor > 0), 0),
        'refunded_minor', coalesce(-sum(t.amount_base_minor) filter (where t.amount_base_minor < 0), 0))
      from public.transactions t
      where t.household_id = $1 and t.deleted_at is null %s $sql$, v_where)
    into v_result
    using v_household, v_cats, app.ilike_pattern(coalesce(v_text, '')), v_month_from, v_month_to, v_from, v_to, v_min, v_max,
          v_members, v_sources, null::timestamptz, null::uuid, null::int;
    return v_result;
  end if;

  execute format($sql$
    select coalesce(jsonb_agg(to_jsonb(p) order by p.occurred_at desc, p.id desc), '[]'::jsonb)
    from (
      select t.id, t.title, t.raw_merchant, t.amount_minor, t.currency, t.amount_base_minor, t.fx_rate, t.fx_source,
             t.occurred_at, t.budget_month, t.status, t.source, t.category_id, t.note, t.card_label, t.created_by,
             t.recurring_rule_id, t.classification,
             jsonb_build_object('name', c.name, 'sf_symbol', c.sf_symbol) as categories,
             case when r.installment_count is not null and t.recurring_period is not null then
               jsonb_build_object(
                 'no', (extract(year from t.recurring_period) * 12 + extract(month from t.recurring_period))
                     - (extract(year from r.installment_first) * 12 + extract(month from r.installment_first)) + 1,
                 'count', r.installment_count)
             end as installment
      from public.transactions t
      join public.categories c on c.id = t.category_id and c.household_id = $1
      left join public.recurring_rules r on r.id = t.recurring_rule_id and r.household_id = $1
      where t.household_id = $1 and t.deleted_at is null %s
      order by t.occurred_at desc, t.id desc
      limit $14
    ) p $sql$, v_where)
  into v_result
  using v_household, v_cats, app.ilike_pattern(coalesce(v_text, '')), v_month_from, v_month_to, v_from, v_to, v_min, v_max,
        v_members, v_sources, p_before_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid),
        least(greatest(coalesce(p_limit, 50), 1), 200);
  return v_result;
end $$;

create function public.find_transactions(
  p_filter jsonb default '{}',
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_limit int default 50
) returns jsonb
language sql stable security definer set search_path = '' as $$
  select app.tx_search(p_filter, p_before_at, p_before_id, p_limit, false)
$$;

create function public.summarize_transactions(p_filter jsonb default '{}') returns jsonb
language sql stable security definer set search_path = '' as $$
  select app.tx_search(p_filter, null, null, null, true)
$$;

create or replace function public.search_transactions(
  p_query text default null,
  p_category uuid default null,
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_limit int default 50,
  p_month date default null
) returns jsonb
language sql stable security definer set search_path = '' as $$
  select app.tx_search(
    jsonb_strip_nulls(jsonb_build_object(
      'q', p_query,
      'categories', case when p_category is not null then jsonb_build_array(p_category) end,
      'month_from', p_month,
      'month_to', p_month)),
    p_before_at, p_before_id, p_limit, false)
$$;

revoke execute on function app.tx_search(jsonb, timestamptz, uuid, int, boolean), app.ilike_pattern(text)
  from public, anon, authenticated;
revoke execute on function public.find_transactions(jsonb, timestamptz, uuid, int), public.summarize_transactions(jsonb)
  from public, anon;
grant execute on function public.find_transactions(jsonb, timestamptz, uuid, int), public.summarize_transactions(jsonb)
  to authenticated;
