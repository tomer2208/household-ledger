-- Checks for migration 29 (P1-5, search_transactions p_month). One block, ends by raising
-- TEST_ROLLBACK with its findings, so nothing is kept. Makes its own user and household.
-- August 2026 gets 120 expenses; one lands at 23:30 on 31 August Israel time (20:30 UTC) and
-- one at 00:10 on 1 September Israel time (21:10 UTC on 31 August): the household clock decides.
-- Expect: aug_pages=3 aug_seen=121 aug_distinct=121 aug_all_august=t edge_aug=t edge_sep=t
--         sep=1 aug_dining=60 aug_search=1 no_month=122
do $$
declare
  u uuid := gen_random_uuid(); h uuid; c_groc uuid; c_din uuid; edge_aug uuid; edge_sep uuid;
  j jsonb; cur_at timestamptz; cur_id uuid; ids uuid[] := '{}'; months date[] := '{}'; pages int := 0; i int;
  n_sep int; n_din int; n_search int; n_all int; sep jsonb;
begin
  insert into auth.users (id, email, aud, role) values (u, u || '@test.local', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  h := public.create_household('T Month', 'ILS', 'Tester');
  select id into c_groc from public.categories where household_id = h and name = 'Groceries';
  select id into c_din  from public.categories where household_id = h and name = 'Dining';
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency, occurred_at)
  select h, u, 'manual', 'Aug ' || g, case when g % 2 = 0 then c_din else c_groc end, 1000, 'ILS',
         timestamptz '2026-08-02 12:00+03' + make_interval(hours => g * 4)
  from generate_series(1, 120) g;
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency, occurred_at)
  values (h, u, 'manual', 'Late night snack', c_groc, 1500, 'ILS', timestamptz '2026-08-31 23:30+03') returning id into edge_aug;
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency, occurred_at)
  values (h, u, 'manual', 'Midnight fuel', c_groc, 2500, 'ILS', timestamptz '2026-09-01 00:10+03') returning id into edge_sep;

  loop
    j := public.search_transactions(null, null, cur_at, cur_id, 50, date '2026-08-15');
    exit when jsonb_array_length(j) = 0;
    pages := pages + 1;
    for i in 0 .. jsonb_array_length(j) - 1 loop
      ids := ids || (j->i->>'id')::uuid;
      months := months || (j->i->>'budget_month')::date;
    end loop;
    cur_at := (j->-1->>'occurred_at')::timestamptz;
    cur_id := (j->-1->>'id')::uuid;
  end loop;
  sep := public.search_transactions(null, null, null, null, 50, date '2026-09-01');
  n_sep := jsonb_array_length(sep);
  n_din := jsonb_array_length(public.search_transactions(null, c_din, null, null, 200, date '2026-08-01'));
  n_search := jsonb_array_length(public.search_transactions('snack', null, null, null, 50, date '2026-08-01'));
  n_all := jsonb_array_length(public.search_transactions(null, null, null, null, 200));
  reset role;

  raise exception 'TEST_ROLLBACK aug_pages=% aug_seen=% aug_distinct=% aug_all_august=% edge_aug=% edge_sep=% sep=% aug_dining=% aug_search=% no_month=%',
    pages, array_length(ids, 1), (select count(distinct x) from unnest(ids) x),
    (select bool_and(m = date '2026-08-01') from unnest(months) m),
    edge_aug = any (ids), (sep->0->>'id')::uuid = edge_sep, n_sep, n_din, n_search, n_all;
end $$;
