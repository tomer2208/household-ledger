-- Checks for migration 30 (P1-7, set_budgets_bulk). One block, ends by raising TEST_ROLLBACK with
-- its findings, so nothing is kept. Makes its own users and households; needs no fixture.
-- Expect: first=2 groc=200000 din=80000 income=1000000 acknowledged=t second=1 groc_after=250000
--         rows_for_groc=1 income_kept=1000000 negative_err="every budget must be a whole amount of zero or more"
--         groc_untouched=250000 fraction_err="every budget must be a whole amount of zero or more"
--         savings_err="unknown category" dup_err="a category appears twice" stranger_err="unknown category"
--         neg_income_err="income must be zero or more" empty=0 anon_can_call=f
do $$
declare
  u uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); h uuid; c_groc uuid; c_din uuid; c_sav uuid;
  m date; r1 int; r2 int; r_empty int;
  e_neg text; e_frac text; e_sav text; e_dup text; e_str text; e_inc text;
  groc1 bigint; din1 bigint; inc1 bigint; ack boolean; groc2 bigint; rows int; inc2 bigint;
begin
  insert into auth.users (id, email, aud, role) values
    (u, u || '@test.local', 'authenticated', 'authenticated'),
    (stranger, stranger || '@test.local', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  h := public.create_household('T Bulk', 'ILS', 'Tester');
  select id into c_groc from public.categories where household_id = h and name = 'Groceries';
  select id into c_din  from public.categories where household_id = h and name = 'Dining';
  select id into c_sav  from public.categories where household_id = h and kind = 'savings';
  -- as if Dining came from the Shortcut ("No budget"); setting a budget must acknowledge it
  reset role;
  update public.categories set budget_acknowledged = false where id = c_din;
  set local role authenticated;

  r1 := public.set_budgets_bulk(jsonb_build_array(
          jsonb_build_object('category_id', c_groc, 'cap_minor', 200000),
          jsonb_build_object('category_id', c_din,  'cap_minor', 80000)), 1000000);
  -- read back what the first call saved, before the second changes Groceries
  reset role;
  m := app.local_month(h, now());
  select cap_minor into groc1 from public.category_budgets where category_id = c_groc and effective_month = m;
  inc1 := app.income_for(h, m);
  set local role authenticated;
  r2 := public.set_budgets_bulk(jsonb_build_array(jsonb_build_object('category_id', c_groc, 'cap_minor', 250000)));

  begin perform public.set_budgets_bulk(jsonb_build_array(
          jsonb_build_object('category_id', c_groc, 'cap_minor', 100),
          jsonb_build_object('category_id', c_din,  'cap_minor', -5)));
  exception when others then e_neg := sqlerrm; end;
  begin perform public.set_budgets_bulk(jsonb_build_array(jsonb_build_object('category_id', c_groc, 'cap_minor', 10.5)));
  exception when others then e_frac := sqlerrm; end;
  begin perform public.set_budgets_bulk(jsonb_build_array(jsonb_build_object('category_id', c_sav, 'cap_minor', 100)));
  exception when others then e_sav := sqlerrm; end;
  begin perform public.set_budgets_bulk(jsonb_build_array(
          jsonb_build_object('category_id', c_groc, 'cap_minor', 1),
          jsonb_build_object('category_id', c_groc, 'cap_minor', 2)));
  exception when others then e_dup := sqlerrm; end;
  begin perform public.set_budgets_bulk('[]'::jsonb, -1);
  exception when others then e_inc := sqlerrm; end;
  r_empty := public.set_budgets_bulk('[]'::jsonb);
  reset role;

  select cap_minor into groc2 from public.category_budgets where category_id = c_groc and effective_month = m;
  select cap_minor into din1 from public.category_budgets where category_id = c_din and effective_month = m;
  select count(*) into rows from public.category_budgets where category_id = c_groc;
  select app.income_for(h, m) into inc2;
  select budget_acknowledged into ack from public.categories where id = c_din;

  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.create_household('T Other', 'ILS', 'Stranger');
  begin perform public.set_budgets_bulk(jsonb_build_array(jsonb_build_object('category_id', c_groc, 'cap_minor', 1)));
  exception when others then e_str := sqlerrm; end;
  reset role;

  raise exception 'TEST_ROLLBACK first=% groc=% din=% income=% acknowledged=% second=% groc_after=% rows_for_groc=% income_kept=% negative_err="%" groc_untouched=% fraction_err="%" savings_err="%" dup_err="%" stranger_err="%" neg_income_err="%" empty=% anon_can_call=%',
    r1, groc1, din1, inc1, ack, r2, groc2, rows, inc2, e_neg,
    (select cap_minor from public.category_budgets where category_id = c_groc and effective_month = m),
    e_frac, e_sav, e_dup, e_str, e_inc, r_empty,
    has_function_privilege('anon', 'public.set_budgets_bulk(jsonb, bigint)', 'execute');
end $$;
