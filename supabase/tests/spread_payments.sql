-- Checks for migration 45 (P1-16, spreading a periodic payment). One block, ends by raising
-- TEST_ROLLBACK with its findings, so nothing is kept. Makes its own users and households.
-- Income ₪10,000; category C has a ₪1,000 budget; K has none. Three months back to last month
-- (m3, m2, m1) close in turn, then this month (cur).
--   R  yearly ₪3,600 in C, spread, next due two months from now: 6 months to go from m3
--      → ₪600 a month set aside (m3, m2, m1, and cur while it's open)
--   R2 every 6 months ₪600 in C, spread, due next month → ₪120 a month; paused during cur, so
--      its ₪360 goes back into the budget
--   R3 yearly in K (no budget), spread → sets nothing aside
--   C spends ₪500 in each closed month; then R's ₪3,600 payment is posted this month.
-- Expect: nets=-22000,-22000,-22000 funds_after_m1="R:180000 R2:36000" r3_entries=0 invariant=t
--         cur_cap=28000 cur_funds="R:180000/-60000/f R2:36000/-12000/f" paused_cap=76000
--         paid_cap=316000 paid_due_now=t alerts=90,100 cur_net=-44000 reserved=-216000
--         funds_after_cur="R:0 R2:0" invariant_after=t report_cap=316000 report_reserved=-216000
--         interval1="spread_needs_period" stranger_rows=0 no_direct_insert=42501 auth_rule_reserves=f
do $$
declare
  u uuid := gen_random_uuid(); s uuid := gen_random_uuid(); h uuid; cur date; m1 date; m2 date; m3 date;
  c uuid; k uuid; r uuid; r2 uuid; r3 uuid; o jsonb; e jsonb;
  nets text; funds1 text; funds2 text; r3n int; inv1 boolean; inv2 boolean; cur_cap text; cur_funds text;
  paused_cap text; paid_cap text; paid_due text; alerts text; cur_net bigint; reserved bigint;
  rep_cap text; rep_res text; e_int text; stranger_rows int; direct text; auth_rr boolean;
begin
  insert into auth.users (id, email, aud, role) values
    (u, u || '@test.local', 'authenticated', 'authenticated'), (s, s || '@test.local', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  h := public.create_household('T Spread', 'ILS', 'Me');
  insert into public.categories (household_id, name) values (h, 'SC') returning id into c;
  insert into public.categories (household_id, name) values (h, 'SK') returning id into k;
  reset role;

  cur := app.local_month(h, now());
  m1 := (cur - interval '1 month')::date; m2 := (cur - interval '2 months')::date; m3 := (cur - interval '3 months')::date;
  insert into public.household_income (household_id, effective_month, amount_minor) values (h, m3, 1000000);
  insert into public.category_budgets (household_id, category_id, effective_month, cap_minor) values (h, c, m3, 100000);

  set local role authenticated;
  insert into public.recurring_rules (household_id, title, category_id, amount_minor, currency, amount_kind, interval_months, day_of_month, start_date, spread)
  values (h, 'R', c, 360000, 'ILS', 'fixed', 12, 10, (cur + interval '2 months' + interval '9 days')::date, true) returning id into r;
  insert into public.recurring_rules (household_id, title, category_id, amount_minor, currency, amount_kind, interval_months, day_of_month, start_date, spread)
  values (h, 'R2', c, 60000, 'ILS', 'fixed', 6, 10, (cur + interval '1 month' + interval '9 days')::date, true) returning id into r2;
  insert into public.recurring_rules (household_id, title, category_id, amount_minor, currency, amount_kind, interval_months, day_of_month, start_date, spread)
  values (h, 'R3', k, 120000, 'ILS', 'fixed', 12, 10, (cur + interval '2 months' + interval '9 days')::date, true) returning id into r3;
  begin
    insert into public.recurring_rules (household_id, title, category_id, amount_minor, currency, amount_kind, interval_months, day_of_month, start_date, spread)
    values (h, 'Monthly', c, 1000, 'ILS', 'fixed', 1, 10, cur, true);
  exception when check_violation then get stacked diagnostics e_int = constraint_name; end;
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency, occurred_at)
  select h, u, 'manual', 'x', c, 50000, 'ILS', ((m + 9) + time '12:00') at time zone 'Asia/Jerusalem'
  from unnest(array[m3, m2, m1]) m;
  reset role;

  perform app.close_month(h, m3);
  perform app.close_month(h, m2);
  perform app.close_month(h, m1);

  select string_agg(net_minor::text, ',' order by budget_month) into nets from public.month_closes where household_id = h;
  select string_agg(rr.title || ':' || coalesce((select sum(x.amount_minor) from public.recurring_reserves x where x.rule_id = rr.id), 0), ' ' order by rr.title)
  into funds1 from public.recurring_rules rr where rr.id in (r, r2);
  select count(*) into r3n from public.recurring_reserves where rule_id = r3;
  inv1 := app.savings_balance(h) + (select coalesce(sum(amount_minor), 0) from public.recurring_reserves where household_id = h)
          = 3 * 1000000 - 150000;

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  o := public.month_overview();
  select x into e from jsonb_array_elements(o->'categories') x where (x->>'id')::uuid = c;
  cur_cap := e->>'cap';
  select string_agg((f->>'title') || ':' || (f->>'balance') || '/' || (f->>'reserve') || '/' || left(f->>'due_now', 1), ' ' order by f->>'title')
  into cur_funds from jsonb_array_elements(e->'funds') f;
  update public.recurring_rules set paused = true where id = r2;
  select x->>'cap' into paused_cap from jsonb_array_elements(public.month_overview()->'categories') x where (x->>'id')::uuid = c;
  reset role;

  -- R's payment is posted this month
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency, recurring_rule_id, recurring_period)
  values (h, u, 'recurring', 'R', c, 360000, 'ILS', r, (cur + 9));
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select x into e from jsonb_array_elements(public.month_overview()->'categories') x where (x->>'id')::uuid = c;
  paid_cap := e->>'cap';
  select left(f->>'due_now', 1) into paid_due from jsonb_array_elements(e->'funds') f where f->>'title' = 'R';
  reset role;
  select string_agg(threshold::text, ',' order by threshold) into alerts from public.budget_alerts where category_id = c and budget_month = cur;

  cur_net := app.close_month(h, cur);
  select reserved_minor into reserved from public.month_closes where household_id = h and budget_month = cur;
  select string_agg(rr.title || ':' || coalesce((select sum(x.amount_minor) from public.recurring_reserves x where x.rule_id = rr.id), 0), ' ' order by rr.title)
  into funds2 from public.recurring_rules rr where rr.id in (r, r2);
  inv2 := app.savings_balance(h) + (select coalesce(sum(amount_minor), 0) from public.recurring_reserves where household_id = h)
          = 4 * 1000000 - 510000;
  select x->>'cap' into rep_cap from jsonb_array_elements(app.report_metrics(h, cur)->'categories') x where (x->>'id')::uuid = c;
  rep_res := app.report_metrics(h, cur)->'totals'->>'reserved';
  auth_rr := has_function_privilege('authenticated', 'app.rule_reserves(uuid, date)', 'execute');

  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.create_household('T Other', 'ILS', 'S');
  select count(*) into stranger_rows from public.recurring_reserves where household_id = h;
  begin insert into public.recurring_reserves (household_id, rule_id, category_id, budget_month, amount_minor) values (h, r, c, cur, 1);
  exception when others then direct := sqlstate; end;
  reset role;

  raise exception 'TEST_ROLLBACK nets=% funds_after_m1="%" r3_entries=% invariant=% cur_cap=% cur_funds="%" paused_cap=% paid_cap=% paid_due_now=% alerts=% cur_net=% reserved=% funds_after_cur="%" invariant_after=% report_cap=% report_reserved=% interval1="%" stranger_rows=% no_direct_insert=% auth_rule_reserves=%',
    nets, funds1, r3n, inv1, cur_cap, cur_funds, paused_cap, paid_cap, paid_due, alerts, cur_net, reserved, funds2, inv2,
    rep_cap, rep_res, e_int, stranger_rows, direct, auth_rr;
end $$;
