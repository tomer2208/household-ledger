-- Checks for migration 46 (design P1, a category's colour and icon). One block, ends by raising
-- TEST_ROLLBACK with its findings, so nothing is kept. Makes its own user and household.
-- Expect: first8=teal,sand,blue,ocean,clay,olive,indigo,sage first8_distinct=8 savings_icon=savings
--         icons=supermarket,dining,car,fuel other_icon=other new_icon=pets new_color=clay
--         unknown_icon=tag bad_color=check own_color=rose
do $$
declare
  a uuid := gen_random_uuid(); h uuid; cat uuid;
  first8 text; first8_distinct int; savings_icon text; icons text; other_icon text;
  new_icon text; new_color text; unknown_icon text; bad_color text; own_color text;
begin
  insert into auth.users (id, email, aud, role) values (a, a || '@test.local', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  h := public.create_household('Home', 'ILS', 'Ann', 'en');
  reset role;

  -- the seeded categories get their colours and icons without create_household knowing
  select string_agg(color, ',' order by sort_order), count(distinct color) into first8, first8_distinct
  from (select color, sort_order from public.categories where household_id = h and kind = 'expense' order by sort_order limit 8) x;
  select icon into savings_icon from public.categories where household_id = h and kind = 'savings';
  select string_agg(icon, ',' order by sort_order) into icons from public.categories where household_id = h and sort_order between 1 and 4;
  select icon into other_icon from public.categories where household_id = h and sort_order = 99;

  -- a category added later: icon from its symbol, colour the least used one in the household
  insert into public.categories (household_id, name, sf_symbol, sort_order) values (h, 'Dog', 'pawprint', 50) returning id into cat;
  select icon, color into new_icon, new_color from public.categories where id = cat;
  insert into public.categories (household_id, name, sf_symbol, sort_order) values (h, 'Misc', 'not.a.symbol', 51) returning id into cat;
  select icon into unknown_icon from public.categories where id = cat;
  -- a colour that isn't one of the ten is refused; one of them is kept as given
  begin
    insert into public.categories (household_id, name, sf_symbol, color) values (h, 'Neon', 'tag', '#00FF00');
  exception when check_violation then bad_color := 'check';
  end;
  insert into public.categories (household_id, name, sf_symbol, color) values (h, 'Mine', 'tag', 'rose') returning id into cat;
  select color into own_color from public.categories where id = cat;

  raise exception 'TEST_ROLLBACK first8=% first8_distinct=% savings_icon=% icons=% other_icon=% new_icon=% new_color=% unknown_icon=% bad_color=% own_color=%',
    first8, first8_distinct, savings_icon, icons, other_icon, new_icon, new_color, unknown_icon, bad_color, own_color;
end $$;
