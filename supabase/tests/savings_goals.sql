-- Checks for migration 43 (P1-15, savings goals). One block, ends by raising TEST_ROLLBACK with its
-- findings, so nothing is kept. Makes its own users and households.
-- The household has ₪10,000 in savings. "Vacation" wants ₪12,000 by six months from now;
-- "Laptop" ₪3,000 with no date; "Gift" ₪500 by last month (its date has passed).
-- Expect: monthly=200000 months_left=6 behind=200000 no_date_monthly=null passed_left=0 passed_monthly=50000
--         after_moves={"free": 350000, "saved": 50000} balance_free=t over_free="not enough free savings for that"
--         over_release="the goal holds less than that" zero="the amount must not be zero" done=t
--         closed_releases=t list_hides_closed=t withdraw_allowed=t free_negative=t
--         bad="goal names are 1 to 40 characters|a goal needs an amount above zero|unknown goal"
--         stranger_list=0 stranger_move="unknown goal" no_direct_insert=42501
do $$
declare
  u uuid := gen_random_uuid(); s uuid := gen_random_uuid(); h uuid; cur date;
  vac uuid; lap uuid; gift uuid; l jsonb; mv jsonb; e jsonb;
  over_free text; over_release text; zero text; bad text[] := '{}'; stranger_move text; direct text;
  ok_done boolean; ok_closed boolean; ok_hidden boolean; ok_withdraw boolean; ok_negative boolean; stranger_list int;
begin
  insert into auth.users (id, email, aud, role) values
    (u, u || '@test.local', 'authenticated', 'authenticated'), (s, s || '@test.local', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  h := public.create_household('T Goals', 'ILS', 'Me');
  perform public.add_savings_entry(1000000, 'Starting balance');
  cur := app.local_month(h, now());
  vac := public.save_goal(null, ' Vacation ', 'airplane', 1200000, (cur + interval '5 months')::date);
  lap := public.save_goal(null, 'Laptop', 'laptopcomputer', 300000, null);
  gift := public.save_goal(null, 'Gift', 'gift', 50000, (cur - interval '1 month')::date);
  l := public.list_goals();
  reset role;

  -- Vacation: 6 months to go (this one included), 12,000 / 6 = 2,000 a month; an even plan from
  -- this month expects 2,000 by this month's end, and nothing is set aside yet.
  select x into e from jsonb_array_elements(l->'goals') x where (x->>'id')::uuid = vac;

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- Vacation 5,000 + 1,000; Laptop in and out again; Gift fully funded
  perform public.move_goal(vac, 500000);
  perform public.move_goal(vac, 100000);
  perform public.move_goal(lap, 100000);
  perform public.move_goal(lap, -100000);
  begin perform public.move_goal(lap, 400001); exception when others then over_free := sqlerrm; end;
  begin perform public.move_goal(lap, -1); exception when others then over_release := sqlerrm; end;
  begin perform public.move_goal(lap, 0); exception when others then zero := sqlerrm; end;
  mv := public.move_goal(gift, 50000);
  ok_done := (select (g->>'done')::boolean from jsonb_array_elements(public.list_goals()->'goals') g where (g->>'id')::uuid = gift);
  perform public.close_goal(gift);
  ok_closed := (public.list_goals()->>'free')::bigint = 400000;
  ok_hidden := not exists (select 1 from jsonb_array_elements(public.list_goals()->'goals') g where (g->>'id')::uuid = gift);
  -- spending savings is never blocked, even below what goals hold
  perform public.add_savings_entry(-800000, 'Car repair');
  ok_withdraw := true;
  ok_negative := (public.list_goals()->>'free')::bigint = -400000;
  begin perform public.save_goal(null, '', 'star', 100, null); exception when others then bad := bad || sqlerrm; end;
  begin perform public.save_goal(null, 'X', 'star', 0, null); exception when others then bad := bad || sqlerrm; end;
  begin perform public.save_goal(gift, 'Gift', 'gift', 100, null); exception when others then bad := bad || sqlerrm; end;
  begin insert into public.savings_goal_moves (household_id, goal_id, amount_minor) values (h, vac, 1); exception when others then direct := sqlstate; end;
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  perform public.create_household('T Other', 'ILS', 'S');
  stranger_list := jsonb_array_length(public.list_goals()->'goals');
  begin perform public.move_goal(vac, 1); exception when others then stranger_move := sqlerrm; end;
  reset role;

  raise exception 'TEST_ROLLBACK monthly=% months_left=% behind=% no_date_monthly=% passed_left=% passed_monthly=% after_moves=% balance_free=% over_free="%" over_release="%" zero="%" done=% closed_releases=% list_hides_closed=% withdraw_allowed=% free_negative=% bad="%" stranger_list=% stranger_move="%" no_direct_insert=%',
    e->>'monthly_needed', e->>'months_left', e->>'behind_by',
    coalesce((select g->>'monthly_needed' from jsonb_array_elements(l->'goals') g where (g->>'id')::uuid = lap), 'null'),
    (select g->>'months_left' from jsonb_array_elements(l->'goals') g where (g->>'id')::uuid = gift),
    (select g->>'monthly_needed' from jsonb_array_elements(l->'goals') g where (g->>'id')::uuid = gift),
    mv, (l->>'balance')::bigint = 1000000 and (l->>'free')::bigint = 1000000,
    over_free, over_release, zero, ok_done, ok_closed, ok_hidden, ok_withdraw, ok_negative,
    array_to_string(bad, '|'), stranger_list, stranger_move, direct;
end $$;
