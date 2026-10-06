-- Checks for migration 44 (P1-14, budget rollover). One block, ends by raising TEST_ROLLBACK with
-- its findings, so nothing is kept. Makes its own users and households.
-- Income ₪10,000. Three months back to last month (m3, m2, m1) are closed in turn.
--   G ₪1,000, rolls over: spends 700, 1,500, 500  → carries +300, −200, +300
--   F ₪500, rolls over but not an overspend: spends 600, 200, 100 → carries 0, +300, then rollover
--     is turned off before m1 closes: its 800 budget less 100 goes to savings
--   S ₪400, no rollover: spends 100 a month → nothing carries
--   K rolls over, no budget: spends 50 in m3 → nothing carries
-- Expect: nets=15000,30000,100000 carried=30000,10000,30000 carries="G:30000 G:-20000 F:30000 G:30000"
--         savings=2575000 invariant=t again=null m1_cap_g=80000 m1_carry_g=-20000
--         now_g="130000/100000/30000/true" now_total="total_cap=220000 base=190000 carry=30000 unassigned=810000"
--         alerts=90 report_cap_g=80000 report_carried=30000 snapshot_g="80000/-20000/30000" stranger_rows=0
--         stranger_update=0 no_direct_insert=42501 auth_carry_for=f
do $$
declare
  u uuid := gen_random_uuid(); s uuid := gen_random_uuid(); h uuid; cur date; m1 date; m2 date; m3 date;
  g uuid; f uuid; sc uuid; k uuid; o jsonb; e jsonb; nets text; carried text; carries text; again bigint;
  m1_cap_g text; m1_carry_g text; alerts text; report_cap text; snap text; stranger_rows int; stranger_upd int;
  direct text; sav bigint; spent_all bigint; outstanding bigint; rep_carried text; auth_carry boolean;
begin
  insert into auth.users (id, email, aud, role) values
    (u, u || '@test.local', 'authenticated', 'authenticated'), (s, s || '@test.local', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  h := public.create_household('T Rollover', 'ILS', 'Me');
  insert into public.categories (household_id, name, rollover) values (h, 'RG', true) returning id into g;
  insert into public.categories (household_id, name, rollover, rollover_overspend) values (h, 'RF', true, false) returning id into f;
  insert into public.categories (household_id, name) values (h, 'RS') returning id into sc;
  insert into public.categories (household_id, name, rollover) values (h, 'RK', true) returning id into k;
  reset role;

  cur := app.local_month(h, now());
  m1 := (cur - interval '1 month')::date; m2 := (cur - interval '2 months')::date; m3 := (cur - interval '3 months')::date;
  insert into public.household_income (household_id, effective_month, amount_minor) values (h, m3, 1000000);
  insert into public.category_budgets (household_id, category_id, effective_month, cap_minor) values
    (h, g, m3, 100000), (h, f, m3, 50000), (h, sc, m3, 40000);

  set local role authenticated;
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency, occurred_at)
  select h, u, 'manual', 'x', c, a, 'ILS', ((m + 9) + time '12:00') at time zone 'Asia/Jerusalem'
  from (values (g, m3, 70000), (f, m3, 60000), (sc, m3, 10000), (k, m3, 5000),
               (g, m2, 150000), (f, m2, 20000), (sc, m2, 10000),
               (g, m1, 50000), (f, m1, 10000), (sc, m1, 10000)) v(c, m, a);
  reset role;

  perform app.close_month(h, m3);
  perform app.close_month(h, m2);
  -- turned off during m1: what F has left goes to savings at the m1 close
  set local role authenticated;
  update public.categories set rollover = false where id = f;
  reset role;
  perform app.close_month(h, m1);
  again := app.close_month(h, m1);

  select string_agg(net_minor::text, ',' order by budget_month), string_agg(carried_minor::text, ',' order by budget_month)
  into nets, carried from public.month_closes where household_id = h;
  select string_agg(case r.category_id when g then 'G' when f then 'F' else '?' end || ':' || r.amount_minor, ' '
                    order by r.budget_month, r.category_id = f)
  into carries from public.category_rollovers r where r.household_id = h;
  sav := app.savings_balance(h);
  select sum(amount_base_minor) into spent_all from public.transactions where household_id = h and deleted_at is null;
  select sum(amount_minor) into outstanding from public.category_rollovers where household_id = h and budget_month = cur;
  select x->>'cap' || '/' || (x->>'carry_in') || '/' || (x->>'carry_out') into snap
  from public.month_closes mc, jsonb_array_elements(mc.snapshot) x
  where mc.household_id = h and mc.budget_month = m1 and (x->>'category_id')::uuid = g;
  select x->>'cap' into report_cap from jsonb_array_elements(app.report_metrics(h, m1)->'categories') x where (x->>'id')::uuid = g;
  rep_carried := app.report_metrics(h, m1)->'totals'->>'carried';

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  o := public.month_overview(m1);
  select x into e from jsonb_array_elements(o->'categories') x where (x->>'id')::uuid = g;
  m1_cap_g := e->>'cap'; m1_carry_g := e->>'carry';
  o := public.month_overview();
  select x into e from jsonb_array_elements(o->'categories') x where (x->>'id')::uuid = g;
  -- 1,200 of G's 1,300 this month: past 90%, not past 100% (it would be, without the carry)
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency)
  values (h, u, 'manual', 'x', g, 120000, 'ILS');
  reset role;
  select string_agg(threshold::text, ',' order by threshold) into alerts
  from public.budget_alerts where category_id = g and budget_month = cur;
  auth_carry := has_function_privilege('authenticated', 'app.carry_for(uuid, date)', 'execute');

  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.create_household('T Other', 'ILS', 'S');
  select count(*) into stranger_rows from public.category_rollovers where household_id = h;
  update public.categories set rollover = false where id = g;
  get diagnostics stranger_upd = row_count;
  begin insert into public.category_rollovers (household_id, category_id, budget_month, amount_minor) values (h, g, cur, 1);
  exception when others then direct := sqlstate; end;
  reset role;

  raise exception 'TEST_ROLLBACK nets=% carried=% carries="%" savings=% invariant=% again=% m1_cap_g=% m1_carry_g=% now_g="%" now_total="%" alerts=% report_cap_g=% report_carried=% snapshot_g="%" stranger_rows=% stranger_update=% no_direct_insert=% auth_carry_for=%',
    nets, carried, carries, sav, sav + outstanding = 3 * 1000000 - spent_all, coalesce(again::text, 'null'),
    m1_cap_g, m1_carry_g,
    concat_ws('/', e->>'cap', e->>'base_cap', e->>'carry', e->>'rollover'),
    format('total_cap=%s base=%s carry=%s unassigned=%s', o->>'total_cap', o->>'total_base_cap', o->>'total_carry', o->>'unassigned'),
    alerts, report_cap, rep_carried, snap, stranger_rows, stranger_upd, direct, auth_carry;
end $$;
