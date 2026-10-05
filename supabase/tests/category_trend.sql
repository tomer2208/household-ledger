-- Checks for migration 42 (P1-11, category_trend). One block, ends by raising TEST_ROLLBACK with
-- its findings, so nothing is kept. Makes its own users and households.
-- Dining has spending this month and the two before (a refund and a deleted expense among
-- them), none three months back, and a budget that changed two months ago. Every month of the
-- trend must say what month_overview says for that category.
-- Expect: rows=6 consecutive=t ends_now=t matches_overview=t empty_month_zero=t caps_follow_changes=t
--         one_month=1 capped_at=24 stranger="unknown category"
do $$
declare
  u uuid := gen_random_uuid(); s uuid := gen_random_uuid(); h uuid; din uuid; cur date; tr jsonb; e jsonb; o jsonb;
  ok_match boolean := true; stranger text; one int; capped int;
begin
  insert into auth.users (id, email, aud, role) values
    (u, u || '@test.local', 'authenticated', 'authenticated'), (s, s || '@test.local', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  h := public.create_household('T Trend', 'ILS', 'Me');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.create_household('T Other', 'ILS', 'S');
  reset role;
  select id into din from public.categories where household_id = h and name = 'Dining';
  cur := app.local_month(h, now());

  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency, occurred_at)
  values (h, u, 'manual', 'Now', din, 16100, 'ILS', now()),
         (h, u, 'manual', 'Refund', din, -1100, 'ILS', now()),
         (h, u, 'manual', 'Last month', din, 12400, 'ILS', ((cur - interval '1 month')::date + 9 + time '12:00') at time zone 'Asia/Jerusalem'),
         (h, u, 'manual', 'Two back', din, 9000, 'ILS', ((cur - interval '2 months')::date + 9 + time '12:00') at time zone 'Asia/Jerusalem'),
         (h, u, 'manual', 'Gone', din, 50000, 'ILS', ((cur - interval '2 months')::date + 10 + time '12:00') at time zone 'Asia/Jerusalem');
  update public.transactions set deleted_at = now() where household_id = h and title = 'Gone';
  insert into public.category_budgets (category_id, household_id, effective_month, cap_minor, created_by) values
    (din, h, (cur - interval '5 months')::date, 100000, u), (din, h, (cur - interval '1 month')::date, 150000, u);

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tr := public.category_trend(din);
  for e in select * from jsonb_array_elements(tr) loop
    o := (select x from jsonb_array_elements(public.month_overview((e->>'month')::date)->'categories') x where (x->>'id')::uuid = din);
    if (e->>'spent')::bigint is distinct from coalesce((o->>'spent')::bigint, 0)
       or (e->'cap') is distinct from coalesce(o->'cap', 'null'::jsonb) then
      ok_match := false;
    end if;
  end loop;
  one := jsonb_array_length(public.category_trend(din, 0));
  capped := jsonb_array_length(public.category_trend(din, 99));
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  begin perform public.category_trend(din); exception when others then stranger := sqlerrm; end;
  reset role;

  raise exception 'TEST_ROLLBACK rows=% consecutive=% ends_now=% matches_overview=% empty_month_zero=% caps_follow_changes=% one_month=% capped_at=% stranger="%"',
    jsonb_array_length(tr),
    (select bool_and((tr->i->>'month')::date = ((tr->0->>'month')::date + make_interval(months => i))::date) from generate_series(0, 5) i),
    (tr->-1->>'month')::date = cur,
    ok_match,
    (tr->2->>'spent')::bigint = 0 and (tr->-1->>'spent')::bigint = 15000 and (tr->3->>'spent')::bigint = 9000,
    (tr->0->>'cap')::bigint = 100000 and (tr->-2->>'cap')::bigint = 150000 and (tr->-1->>'cap')::bigint = 150000,
    one, capped, stranger;
end $$;
