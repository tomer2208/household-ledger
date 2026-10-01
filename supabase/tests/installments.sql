-- Checks for migration 33 (P1-2, create_installments). One block, ends by raising TEST_ROLLBACK
-- with its findings, so nothing is kept. Makes its own users and households; needs no fixture.
-- A: ₪1,000 today in 3 → 333.34 + 333.33 + 333.33, posted month by month, nothing after the end.
-- B: 31 Jan 2026 in 3, split now → all three already due, posted at once on 31/1, 28/2, 31/3.
-- C: a purchase in a closed month → that month's savings gain back what moved to later months.
-- Expect: a_first=33334 a_share=33333 a_now=1 a_after_3_months=3 a_after_end=3 a_sum=100000
--         a_nos=1,2,3 a_count=3 b_days=01-31,02-28,03-31 b_sum=90000 c_adjust=60000 c_payments_sum=90000
--         refund_err="a refund cannot be split into installments" one_err="installments must be between 2 and 36"
--         many_err="installments must be between 2 and 36" again_err="this expense is already part of a recurring payment"
--         small_err="the amount is too small for that many payments" stranger_err="unknown expense" anon=f
do $$
declare
  u uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); h uuid; c uuid;
  ta uuid; tb uuid; tc uuid; tr uuid; ts uuid; ra jsonb; rb jsonb; rule_a uuid; d0 date; prev date;
  n_now int; n3 int; n_end int; s_a bigint; nos text; cnt text; b_days text; s_b bigint; adj bigint; s_c bigint;
  e_refund text; e_one text; e_many text; e_again text; e_small text; e_str text; j jsonb;
begin
  insert into auth.users (id, email, aud, role) values
    (u, u || '@test.local', 'authenticated', 'authenticated'),
    (stranger, stranger || '@test.local', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  h := public.create_household('T Inst', 'ILS', 'Tester');
  select id into c from public.categories where household_id = h and name = 'Shopping';

  -- A: today, ₪1,000 in 3
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency)
  values (h, u, 'manual', 'Fridge', c, 100000, 'ILS') returning id into ta;
  ra := public.create_installments(ta, 3);
  reset role;
  rule_a := (ra->>'rule_id')::uuid;
  d0 := app.local_today(h);
  select count(*) into n_now from public.transactions where recurring_rule_id = rule_a and deleted_at is null;
  perform app.run_recurring(h, (d0 + interval '3 months')::date);
  select count(*) into n3 from public.transactions where recurring_rule_id = rule_a and deleted_at is null;
  perform app.run_recurring(h, (d0 + interval '8 months')::date);
  select count(*), sum(amount_minor) into n_end, s_a from public.transactions where recurring_rule_id = rule_a and deleted_at is null;

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.search_transactions('Fridge', null, null, null, 50);
  select string_agg(x->'installment'->>'no', ',' order by (x->'installment'->>'no')::int), max(x->'installment'->>'count')
  into nos, cnt from jsonb_array_elements(j) x;

  -- B: 31 January, split now: all three months are already due
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency, occurred_at)
  values (h, u, 'manual', 'Sofa', c, 90000, 'ILS', timestamptz '2026-01-31 18:00+02') returning id into tb;
  rb := public.create_installments(tb, 3);
  reset role;
  select string_agg(to_char(recurring_period, 'MM-DD'), ',' order by recurring_period), sum(amount_minor)
  into b_days, s_b from public.transactions where recurring_rule_id = (rb->>'rule_id')::uuid and deleted_at is null;

  -- C: last month, closed, then split in 3: ₪600 of ₪900 move out of the closed month
  prev := (date_trunc('month', d0) - interval '1 month')::date;
  set local role authenticated;
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency, occurred_at)
  values (h, u, 'manual', 'TV', c, 90000, 'ILS', ((prev + 4) + time '12:00') at time zone 'Asia/Jerusalem') returning id into tc;
  reset role;
  perform app.close_month(h, prev);
  set local role authenticated;
  perform public.create_installments(tc, 3);
  reset role;
  select sum(amount_minor) into adj from public.savings_ledger where transaction_id = tc and entry_type = 'late_adjustment';
  perform app.run_recurring(h, (d0 + interval '3 months')::date);
  select sum(amount_minor) into s_c from public.transactions
  where recurring_rule_id = (select recurring_rule_id from public.transactions where id = tc) and deleted_at is null;

  -- what is refused
  set local role authenticated;
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency)
  values (h, u, 'manual', 'Return', c, -5000, 'ILS') returning id into tr;
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency)
  values (h, u, 'manual', 'Gum', c, 2, 'ILS') returning id into ts;
  begin perform public.create_installments(tr, 3); exception when others then e_refund := sqlerrm; end;
  begin perform public.create_installments(ts, 1); exception when others then e_one := sqlerrm; end;
  begin perform public.create_installments(ts, 37); exception when others then e_many := sqlerrm; end;
  begin perform public.create_installments(ta, 3); exception when others then e_again := sqlerrm; end;
  begin perform public.create_installments(ts, 3); exception when others then e_small := sqlerrm; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.create_household('T Other', 'ILS', 'Stranger');
  begin perform public.create_installments(tb, 2); exception when others then e_str := sqlerrm; end;
  reset role;

  raise exception 'TEST_ROLLBACK a_first=% a_share=% a_now=% a_after_3_months=% a_after_end=% a_sum=% a_nos=% a_count=% b_days=% b_sum=% c_adjust=% c_payments_sum=% refund_err="%" one_err="%" many_err="%" again_err="%" small_err="%" stranger_err="%" anon=%',
    ra->>'first_minor', ra->>'share_minor', n_now, n3, n_end, s_a, nos, cnt, b_days, s_b, adj, s_c,
    e_refund, e_one, e_many, e_again, e_small, e_str,
    has_function_privilege('anon', 'public.create_installments(uuid, int)', 'execute');
end $$;
