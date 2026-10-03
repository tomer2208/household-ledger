-- Checks for migration 38 (P1-17, the month-end forecast in month_overview). One block, ends by
-- raising TEST_ROLLBACK with its findings, so nothing is kept. Makes its own users and households.
-- The forecast depends on today's date, so each value is worked out here from the same inputs
-- and the block reports whether they agree, which reads the same on any day CI runs.
-- Groceries: day-to-day spend this month plus three months of history.
-- Rent: paid by a rule still due this month; a posted recurring payment this month too.
-- Not counted: a rule due next month, a paused one, one past its end date, one in a currency
-- with no rate. Counted at the rate: one in USD.
-- Expect: groceries_rest=t rent_upcoming=t rent_rest_ignores_recurring=t usd_priced=t
--         totals_add_up=t past_month_null=t category_past_null=t posted_once=t stranger_sees=0
do $$
declare
  u uuid := gen_random_uuid(); s uuid := gen_random_uuid(); h uuid; hs uuid;
  groc uuid; rent uuid; fun uuid; cur date; last_day date; d int; days int; w numeric;
  o jsonb; o2 jsonb; past jsonb; x jsonb; rule uuid; usd uuid;
  g_var bigint; g_hist numeric; g_rest_expected bigint;
  ok_groc boolean; ok_rent boolean; ok_rent_rest boolean; ok_usd boolean; ok_totals boolean;
  ok_past boolean; ok_cat_past boolean; ok_once boolean; stranger int;
  rent_before bigint; rent_after bigint;
begin
  insert into auth.users (id, email, aud, role) values
    (u, u || '@test.local', 'authenticated', 'authenticated'), (s, s || '@test.local', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  h := public.create_household('T Forecast', 'ILS', 'Me');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  hs := public.create_household('T Other', 'ILS', 'Stranger');
  reset role;

  select id into groc from public.categories where household_id = h and name = 'Groceries';
  select id into rent from public.categories where household_id = h and name = 'Housing';
  select id into fun from public.categories where household_id = h and name = 'Entertainment';
  cur := app.local_month(h, now());
  last_day := (cur + interval '1 month - 1 day')::date;
  d := extract(day from app.local_today(h))::int;
  days := extract(day from last_day)::int;
  w := least(1, d / 5.0);

  -- Groceries: 3 purchases now and a refund; 3 months back, 90,000 of history in all
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency, occurred_at)
  values (h, u, 'manual', 'Shop 1', groc, 12000, 'ILS', now()), (h, u, 'manual', 'Shop 2', groc, 8000, 'ILS', now()),
         (h, u, 'manual', 'Shop 3', groc, 5000, 'ILS', now()), (h, u, 'manual', 'Return', groc, -1000, 'ILS', now());
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency, occurred_at)
  select h, u, 'manual', 'Old shop ' || k, groc, 30000, 'ILS', ((cur - make_interval(months => k))::date + time '12:00') at time zone 'Asia/Jerusalem'
  from generate_series(1, 3) k;
  g_var := 24000;
  g_hist := 90000 / 3.0;
  g_rest_expected := greatest(0, round(w * (g_var::numeric / d * days) + (1 - w) * greatest(g_hist, g_var) - g_var));

  -- Rent: a rule still due this month (on its last day), plus a recurring payment already posted
  insert into public.recurring_rules (household_id, title, category_id, amount_minor, currency, amount_kind, interval_months,
                                      day_of_month, start_date, next_run_date, created_by)
  values (h, 'Rent', rent, 500000, 'ILS', 'fixed', 1, extract(day from last_day)::int, cur, last_day, u)
  returning id into rule;
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency, occurred_at, recurring_rule_id, recurring_period)
  values (h, u, 'recurring', 'Parking', rent, 20000, 'ILS', now(), rule, cur);
  -- not counted
  insert into public.recurring_rules (household_id, title, category_id, amount_minor, currency, amount_kind, interval_months,
                                      day_of_month, start_date, next_run_date, end_date, paused, created_by)
  values (h, 'Next month', fun, 7000, 'ILS', 'fixed', 1, 1, cur, (cur + interval '1 month')::date, null, false, u),
         (h, 'Paused', fun, 7000, 'ILS', 'fixed', 1, extract(day from last_day)::int, cur, last_day, null, true, u),
         (h, 'Ended', fun, 7000, 'ILS', 'fixed', 1, extract(day from last_day)::int, cur, last_day, cur, false, u),
         (h, 'No rate', fun, 7000, 'XAF', 'fixed', 1, extract(day from last_day)::int, cur, last_day, null, false, u);
  -- counted at the latest rate
  insert into public.fx_rates (base, quote, rate, rate_date, source) values ('ILS', 'USD', 3.5, '2999-01-01', 'test');
  insert into public.recurring_rules (household_id, title, category_id, amount_minor, currency, amount_kind, interval_months,
                                      day_of_month, start_date, next_run_date, created_by)
  values (h, 'Streaming', fun, 1000, 'USD', 'fixed', 1, extract(day from last_day)::int, cur, last_day, u)
  returning id into usd;

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  o := public.month_overview(null);
  past := public.month_overview((cur - interval '1 month')::date);
  reset role;

  select e into x from jsonb_array_elements(o->'categories') e where (e->>'id')::uuid = groc;
  ok_groc := (x->>'forecast')::bigint = 24000 + g_rest_expected;
  select e into x from jsonb_array_elements(o->'categories') e where (e->>'id')::uuid = rent;
  -- spent 20,000 (posted), 500,000 still due, nothing variable: the posted payment sets no pace
  ok_rent := (x->>'forecast')::bigint = 20000 + 500000;
  ok_rent_rest := (x->>'spent')::bigint = 20000;
  select e into x from jsonb_array_elements(o->'categories') e where (e->>'id')::uuid = fun;
  ok_usd := (x->>'forecast')::bigint = 3500;
  ok_totals := (o->'forecast'->>'total')::bigint = (select sum((e->>'forecast')::bigint) from jsonb_array_elements(o->'categories') e)
           and (o->'forecast'->>'spent')::bigint = (o->>'total_spent')::bigint
           and (o->'forecast'->>'upcoming')::bigint = 503500
           and (o->'forecast'->>'total')::bigint = (o->'forecast'->>'spent')::bigint + (o->'forecast'->>'upcoming')::bigint + (o->'forecast'->>'rest')::bigint
           and (o->'forecast'->>'day')::int = d and (o->'forecast'->>'days')::int = days;
  ok_past := past->'forecast' = 'null'::jsonb;
  ok_cat_past := not exists (select 1 from jsonb_array_elements(past->'categories') e where e->'forecast' <> 'null'::jsonb);

  -- the rent is posted (as run_recurring would): it moves from upcoming to spent, counted once
  rent_before := (select (e->>'forecast')::bigint from jsonb_array_elements(o->'categories') e where (e->>'id')::uuid = rent);
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency, occurred_at, recurring_rule_id, recurring_period)
  values (h, u, 'recurring', 'Rent', rent, 500000, 'ILS', now(), rule, last_day);
  update public.recurring_rules set next_run_date = (cur + interval '1 month')::date + (extract(day from last_day)::int - 1) where id = rule;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  o2 := public.month_overview(null);
  reset role;
  rent_after := (select (e->>'forecast')::bigint from jsonb_array_elements(o2->'categories') e where (e->>'id')::uuid = rent);
  ok_once := rent_before = rent_after;

  -- the stranger's month has none of it
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  stranger := (public.month_overview(null)->'forecast'->>'total')::bigint;
  reset role;

  raise exception 'TEST_ROLLBACK groceries_rest=% rent_upcoming=% rent_rest_ignores_recurring=% usd_priced=% totals_add_up=% past_month_null=% category_past_null=% posted_once=% stranger_sees=%',
    ok_groc, ok_rent, ok_rent_rest, ok_usd, ok_totals, ok_past, ok_cat_past, ok_once, stranger;
end $$;
