-- P1-11 (docs/PRODUCT_ROADMAP.md): a category's last months at a glance, on its screen.
-- category_trend(category, months) returns one row per budget month, oldest first, ending with
-- the current one: what was spent (app.spent_for, as Overview and month close count it) and the
-- budget in force that month (app.cap_for). Months with no spending are there with 0, so the
-- chart's months are always consecutive.

create function public.category_trend(p_category uuid, p_months int default 6) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
  v_now date := app.local_month(v_household, now());
  v_months int := least(greatest(coalesce(p_months, 6), 1), 24);
begin
  if not exists (select 1 from public.categories c where c.id = p_category and c.household_id = v_household) then
    raise exception 'unknown category' using errcode = 'P0002';
  end if;
  return (
    select jsonb_agg(jsonb_build_object(
             'month', to_char(m, 'YYYY-MM-DD'),
             'spent', app.spent_for(p_category, m),
             'cap', app.cap_for(p_category, m)) order by m)
    from generate_series((v_now - make_interval(months => v_months - 1))::date, v_now, interval '1 month') g(ts),
         lateral (select g.ts::date as m) x
  );
end $$;

revoke execute on function public.category_trend(uuid, int) from public, anon;
grant execute on function public.category_trend(uuid, int) to authenticated;
