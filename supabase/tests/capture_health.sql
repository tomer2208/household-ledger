-- Checks for migration 25 (R9, capture_health). One block, ends by raising TEST_ROLLBACK with its
-- findings, so nothing is kept. Makes its own users, household and devices; needs no fixture.
-- Expect: daily_quiet=silent weekly_quiet=ok daily_recent=ok new_2d=setup new_2h=ok revoked=absent
--         daily_median=24.0 weekly_median=168.0 stranger_sees=0 anon_can_call=f
do $$
declare
  u uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); h uuid;
  d_daily uuid; d_weekly uuid; d_recent uuid; d_new2d uuid; d_new2h uuid; d_revoked uuid;
  j jsonb; js jsonb; i int;
  st jsonb;
begin
  insert into auth.users (id, email, aud, role) values
    (u, u || '@test.local', 'authenticated', 'authenticated'),
    (stranger, stranger || '@test.local', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  h := public.create_household('T Health', 'ILS', 'Tester');
  reset role;

  insert into public.device_tokens (household_id, user_id, label, token_hash, created_at)
  values (h, u, 'daily quiet',  md5(random()::text), now() - interval '40 days') returning id into d_daily;
  insert into public.device_tokens (household_id, user_id, label, token_hash, created_at)
  values (h, u, 'weekly quiet', md5(random()::text), now() - interval '40 days') returning id into d_weekly;
  insert into public.device_tokens (household_id, user_id, label, token_hash, created_at)
  values (h, u, 'daily recent', md5(random()::text), now() - interval '40 days') returning id into d_recent;
  insert into public.device_tokens (household_id, user_id, label, token_hash, created_at)
  values (h, u, 'new 2d',       md5(random()::text), now() - interval '2 days') returning id into d_new2d;
  insert into public.device_tokens (household_id, user_id, label, token_hash, created_at)
  values (h, u, 'new 2h',       md5(random()::text), now() - interval '2 hours') returning id into d_new2h;
  insert into public.device_tokens (household_id, user_id, label, token_hash, created_at, revoked_at)
  values (h, u, 'revoked',      md5(random()::text), now() - interval '40 days', now() - interval '1 day') returning id into d_revoked;

  -- captures as the capture RPC records them
  for i in 4..20 loop   -- daily until 4 days ago
    insert into public.audit_log (household_id, actor_type, actor_id, action, entity, entity_id, at)
    values (h, 'device', d_daily, 'insert', 'transactions', gen_random_uuid(), now() - make_interval(days => i));
  end loop;
  for i in 0..3 loop    -- weekly, last one 4 days ago
    insert into public.audit_log (household_id, actor_type, actor_id, action, entity, entity_id, at)
    values (h, 'device', d_weekly, 'insert', 'transactions', gen_random_uuid(), now() - make_interval(days => 4 + 7 * i));
  end loop;
  for i in 1..10 loop   -- daily until yesterday
    insert into public.audit_log (household_id, actor_type, actor_id, action, entity, entity_id, at)
    values (h, 'device', d_recent, 'insert', 'transactions', gen_random_uuid(), now() - make_interval(days => i));
  end loop;
  insert into public.audit_log (household_id, actor_type, actor_id, action, entity, entity_id, at)
  values (h, 'device', d_revoked, 'insert', 'transactions', gen_random_uuid(), now() - interval '30 days');

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.capture_health();
  reset role;
  st := (select jsonb_object_agg(x->>'label', x) from jsonb_array_elements(j) x);

  -- a member of another household sees none of these devices
  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.create_household('T Other', 'ILS', 'Stranger');
  js := public.capture_health();
  reset role;

  raise exception 'TEST_ROLLBACK daily_quiet=% weekly_quiet=% daily_recent=% new_2d=% new_2h=% revoked=% daily_median=% weekly_median=% stranger_sees=% anon_can_call=%',
    st->'daily quiet'->>'status', st->'weekly quiet'->>'status', st->'daily recent'->>'status',
    st->'new 2d'->>'status', st->'new 2h'->>'status', coalesce(st->'revoked'->>'status', 'absent'),
    st->'daily quiet'->>'median_gap_hours', st->'weekly quiet'->>'median_gap_hours',
    jsonb_array_length(js), has_function_privilege('anon', 'public.capture_health()', 'execute');
end $$;
