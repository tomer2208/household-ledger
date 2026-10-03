-- Checks for migration 36 (P1-9, find_transactions / summarize_transactions). One block, ends by
-- raising TEST_ROLLBACK with its findings, so nothing is kept. Makes its own users and households.
-- A owns a household (Israel time) that B joins; C has a household of their own.
-- Eight expenses, July to September 2026; the 31 August one is 23:30 Israel time and the next one
-- 00:10 on 1 September, so the day and month edges are the household's, not UTC's.
-- Expect: dining=3 aug_sep=7 day_aug31=1 from_sep=4 amount_1000_2500=4 by_b=3 apple_pay=3
--         expenses=7 refunds=1 review=1 combined=1 text=2 text_total=8000
--         all={"count": 8, "spent_minor": 70499, "total_minor": 68499, "refunded_minor": 2000}
--         groc_sep={"count": 3, "spent_minor": 52500, "total_minor": 50500, "refunded_minor": 2000}
--         paged=4 paged_distinct=4 paged_pages=2 c_sees_count=0 c_sees_rows=0 old_api=2
--         bad="bad search filter|bad search filter|bad search filter|bad search filter|bad search filter|bad search filter"
--         anon_find=f anon_sum=f
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  h uuid; hc uuid; code text; groc uuid; din uuid;
  j jsonb; cur_at timestamptz; cur_id uuid; ids uuid[] := '{}'; pages int := 0; i int;
  bad text[] := '{}'; f jsonb;
  r_din int; r_augsep int; r_day int; r_from int; r_amount int; r_b int; r_ap int; r_exp int; r_ref int; r_rev int;
  r_comb int; r_text int; r_text_total bigint; s_all jsonb; s_groc_sep jsonb; c_count int; c_rows int; old_api int;
begin
  insert into auth.users (id, email, aud, role) values
    (a, a || '@test.local', 'authenticated', 'authenticated'), (b, b || '@test.local', 'authenticated', 'authenticated'),
    (c, c || '@test.local', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  h := public.create_household('T Filters', 'ILS', 'Owner');
  code := public.create_invite();
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.join_household(code, 'Partner');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  hc := public.create_household('T Other', 'ILS', 'Stranger');
  reset role;

  select id into groc from public.categories where household_id = h and name = 'Groceries';
  select id into din from public.categories where household_id = h and name = 'Dining';
  insert into public.transactions (household_id, created_by, source, status, title, category_id, amount_minor, currency, occurred_at) values
    (h, a, 'apple_pay', 'confirmed',      'Shufersal',        groc,  10000, 'ILS', '2026-07-10 12:00+03'),
    (h, a, 'manual',    'confirmed',      'Cafe Aroma',       din,    4500, 'ILS', '2026-08-05 12:00+03'),
    (h, b, 'manual',    'confirmed',      'Cafe Neta',        din,    1000, 'ILS', '2026-08-20 12:00+03'),
    (h, b, 'apple_pay', 'confirmed',      'Late snack',       groc,   1500, 'ILS', '2026-08-31 23:30+03'),
    (h, a, 'manual',    'confirmed',      'Midnight fuel',    groc,   2500, 'ILS', '2026-09-01 00:10+03'),
    (h, a, 'manual',    'confirmed',      'Shufersal refund', groc,  -2000, 'ILS', '2026-09-03 12:00+03'),
    (h, a, 'apple_pay', 'pending_review', 'Pending thing',    din,     999, 'ILS', '2026-09-04 12:00+03'),
    (h, b, 'manual',    'confirmed',      'Big TV',           groc,  50000, 'ILS', '2026-09-10 12:00+03');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r_din    := public.summarize_transactions(jsonb_build_object('categories', jsonb_build_array(din)))->>'count';
  r_augsep := public.summarize_transactions('{"month_from": "2026-08-14", "month_to": "2026-09-01"}')->>'count';
  r_day    := public.summarize_transactions('{"from": "2026-08-31", "to": "2026-08-31"}')->>'count';
  r_from   := public.summarize_transactions('{"from": "2026-09-01"}')->>'count';
  r_amount := public.summarize_transactions('{"min": 1000, "max": 2500}')->>'count';
  r_b      := public.summarize_transactions(jsonb_build_object('members', jsonb_build_array(b)))->>'count';
  r_ap     := public.summarize_transactions('{"sources": ["apple_pay"]}')->>'count';
  r_exp    := public.summarize_transactions('{"kind": "expense"}')->>'count';
  r_ref    := public.summarize_transactions('{"kind": "refund"}')->>'count';
  r_rev    := public.summarize_transactions('{"kind": "review"}')->>'count';
  r_comb   := public.summarize_transactions(jsonb_build_object('categories', jsonb_build_array(din),
                'members', jsonb_build_array(b), 'month_from', '2026-08-01', 'month_to', '2026-08-01'))->>'count';
  j := public.summarize_transactions('{"q": "shufersal"}');
  r_text := j->>'count';
  r_text_total := j->>'total_minor';
  s_all := public.summarize_transactions('{}');
  s_groc_sep := public.summarize_transactions(jsonb_build_object('categories', jsonb_build_array(groc),
                  'month_from', '2026-09-01', 'month_to', '2026-09-30'));

  -- the list pages through exactly what the total counts
  f := jsonb_build_object('categories', jsonb_build_array(groc), 'from', '2026-08-31');
  loop
    j := public.find_transactions(f, cur_at, cur_id, 2);
    exit when jsonb_array_length(j) = 0;
    pages := pages + 1;
    for i in 0 .. jsonb_array_length(j) - 1 loop
      ids := ids || (j->i->>'id')::uuid;
    end loop;
    cur_at := (j->-1->>'occurred_at')::timestamptz;
    cur_id := (j->-1->>'id')::uuid;
  end loop;
  if cardinality(ids) <> (public.summarize_transactions(f)->>'count')::int then
    raise exception 'paging and total disagree';
  end if;

  old_api := jsonb_array_length(public.search_transactions('Cafe', din, null, null, 50, null));

  foreach f in array array[
    '{"kind": "everything"}', '{"sources": ["card"]}', '{"min": -1}', '{"categories": "groceries"}',
    '{"from": "last tuesday"}', '[]']::jsonb[] loop
    begin
      perform public.find_transactions(f);
      bad := bad || 'accepted'::text;
    exception when others then
      bad := bad || sqlerrm;
    end;
  end loop;
  reset role;

  -- C: A's category ids find nothing of A's
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  c_count := public.summarize_transactions(jsonb_build_object('categories', jsonb_build_array(groc, din)))->>'count';
  c_rows := jsonb_array_length(public.find_transactions('{}'));
  reset role;

  raise exception 'TEST_ROLLBACK dining=% aug_sep=% day_aug31=% from_sep=% amount_1000_2500=% by_b=% apple_pay=% expenses=% refunds=% review=% combined=% text=% text_total=% all=% groc_sep=% paged=% paged_distinct=% paged_pages=% c_sees_count=% c_sees_rows=% old_api=% bad="%" anon_find=% anon_sum=%',
    r_din, r_augsep, r_day, r_from, r_amount, r_b, r_ap, r_exp, r_ref, r_rev, r_comb, r_text, r_text_total, s_all, s_groc_sep,
    cardinality(ids), (select count(distinct x) from unnest(ids) x), pages, c_count, c_rows, old_api, array_to_string(bad, '|'),
    has_function_privilege('anon', 'public.find_transactions(jsonb, timestamptz, uuid, int)', 'execute'),
    has_function_privilege('anon', 'public.summarize_transactions(jsonb)', 'execute');
end $$;
