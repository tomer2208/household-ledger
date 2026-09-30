-- Checks for migrations 26-28 (R7, search_transactions). One block, ends by raising TEST_ROLLBACK
-- with its findings, so nothing is kept. Makes its own users and households; needs no fixture.
-- 400 expenses in groups of three sharing a timestamp, plus an old IKEA purchase (older than
-- the 300 the list used to load), a Hebrew one, one with % in its title, and one deleted.
-- Expect: pages=9 seen=403 distinct=403 in_order=t ikea=1 ikea_raw=1 hebrew=1 percent=1 shop12=11
--         dining=200 dining_distinct=200 deleted_seen=0 stranger=0 anon_can_call=f
do $$
declare
  u uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); h uuid; c_groc uuid; c_din uuid; del uuid;
  j jsonb; cur_at timestamptz; cur_id uuid; ids uuid[] := '{}'; ats timestamptz[] := '{}'; pages int := 0;
  din uuid[] := '{}'; ordered boolean := true; i int;
  n_ikea int; n_raw int; n_heb int; n_pct int; n_shop int; n_stranger int;
begin
  insert into auth.users (id, email, aud, role) values
    (u, u || '@test.local', 'authenticated', 'authenticated'),
    (stranger, stranger || '@test.local', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  h := public.create_household('T Search', 'ILS', 'Tester');
  select id into c_groc from public.categories where household_id = h and name = 'Groceries';
  select id into c_din  from public.categories where household_id = h and name = 'Dining';

  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency, occurred_at)
  select h, u, 'manual', 'Shop ' || g, case when g % 2 = 0 then c_din else c_groc end, 1000, 'ILS',
         date_trunc('minute', now()) - make_interval(hours => g / 3)
  from generate_series(1, 400) g;
  insert into public.transactions (household_id, created_by, source, title, raw_merchant, category_id, amount_minor, currency, occurred_at)
  values (h, u, 'manual', 'IKEA Netanya', 'IKEA NETANYA 042', c_groc, 214000, 'ILS', now() - interval '300 days'),
         (h, u, 'manual', 'שופרסל דיל', null, c_groc, 4590, 'ILS', now() - interval '10 days'),
         (h, u, 'manual', '50% off sale', null, c_groc, 2000, 'ILS', now() - interval '20 days');
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency, deleted_at)
  values (h, u, 'manual', 'Deleted IKEA', c_groc, 100, 'ILS', now()) returning id into del;

  -- every page, as the app pages through them
  loop
    j := public.search_transactions(null, null, cur_at, cur_id, 50);
    exit when jsonb_array_length(j) = 0;
    pages := pages + 1;
    for i in 0 .. jsonb_array_length(j) - 1 loop
      ids := ids || (j->i->>'id')::uuid;
      ats := ats || (j->i->>'occurred_at')::timestamptz;
    end loop;
    cur_at := (j->-1->>'occurred_at')::timestamptz;
    cur_id := (j->-1->>'id')::uuid;
  end loop;
  for i in 2 .. coalesce(array_length(ats, 1), 0) loop
    if ats[i] > ats[i - 1] then ordered := false; end if;
  end loop;

  n_ikea := jsonb_array_length(public.search_transactions('ikea'));
  n_raw  := jsonb_array_length(public.search_transactions('NETANYA 04'));
  n_heb  := jsonb_array_length(public.search_transactions('שופרסל'));
  n_pct  := jsonb_array_length(public.search_transactions('%'));
  n_shop := jsonb_array_length(public.search_transactions('shop 12', null, null, null, 200));

  cur_at := null; cur_id := null;
  loop
    j := public.search_transactions(null, c_din, cur_at, cur_id, 50);
    exit when jsonb_array_length(j) = 0;
    for i in 0 .. jsonb_array_length(j) - 1 loop din := din || (j->i->>'id')::uuid; end loop;
    cur_at := (j->-1->>'occurred_at')::timestamptz;
    cur_id := (j->-1->>'id')::uuid;
  end loop;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.create_household('T Other', 'ILS', 'Stranger');
  n_stranger := jsonb_array_length(public.search_transactions('ikea'))
              + jsonb_array_length(public.search_transactions(null, c_groc));
  reset role;

  raise exception 'TEST_ROLLBACK pages=% seen=% distinct=% in_order=% ikea=% ikea_raw=% hebrew=% percent=% shop12=% dining=% dining_distinct=% deleted_seen=% stranger=% anon_can_call=%',
    pages, array_length(ids, 1), (select count(distinct x) from unnest(ids) x), ordered,
    n_ikea, n_raw, n_heb, n_pct, n_shop,
    array_length(din, 1), (select count(distinct x) from unnest(din) x),
    (select count(*) from unnest(ids) x where x = del), n_stranger,
    has_function_privilege('anon', 'public.search_transactions(text, uuid, timestamptz, uuid, int)', 'execute');
end $$;
