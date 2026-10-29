-- Checks for migration 50 (what the Shortcut's notification says is left in the envelope). One
-- block, ends by raising TEST_ROLLBACK with its findings, so nothing is kept.
-- A ₪500 budget with ₪120 spent → ₪380 left; ₪600 spent → ₪100 over; no budget → null; another
-- household's category → null; only the server may call it.
-- Expect: left=38000 over=-10000 no_budget=null stranger=null auth=f
do $$
declare
  u uuid := gen_random_uuid(); s uuid := gen_random_uuid(); h uuid; h2 uuid; c uuid; nb uuid; c2 uuid;
  l1 bigint; l2 bigint; l3 bigint; l4 bigint;
begin
  insert into auth.users (id, email, aud, role) values
    (u, u || '@test.local', 'authenticated', 'authenticated'), (s, s || '@test.local', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  h := public.create_household('T Left', 'ILS', 'Me');
  select id into c from public.categories where household_id = h and kind = 'expense' order by sort_order limit 1;
  select id into nb from public.categories where household_id = h and kind = 'expense' order by sort_order offset 1 limit 1;
  perform public.set_category_budget(c, 50000);
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency)
  values (h, u, 'manual', 'x', c, 12000, 'ILS');
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  h2 := public.create_household('T Left Other', 'ILS', 'S');
  select id into c2 from public.categories where household_id = h2 and kind = 'expense' order by sort_order limit 1;
  reset role;
  l1 := public.capture_left(h, c);
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency)
  values (h, u, 'manual', 'y', c, 48000, 'ILS');
  l2 := public.capture_left(h, c);
  l3 := public.capture_left(h, nb);
  l4 := public.capture_left(h, c2);
  raise exception 'TEST_ROLLBACK left=% over=% no_budget=% stranger=% auth=%',
    l1, l2, coalesce(l3::text, 'null'), coalesce(l4::text, 'null'),
    has_function_privilege('authenticated', 'public.capture_left(uuid, uuid)', 'execute');
end $$;
