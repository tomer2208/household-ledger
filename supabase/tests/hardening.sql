-- Checks for migration 35 (R8 + T13). One block, ends by raising TEST_ROLLBACK with its
-- findings, so nothing is kept. Makes its own users and households; needs no fixture.
-- A owns a household; B guesses invite codes; C joins with a real code; D is a bystander.
-- Expect: wrong=null tries_before_block=10 blocked="too many invite attempts, try again later"
--         right_code_while_blocked="too many invite attempts, try again later" c_joined=t c_counted=0
--         d_unaffected=t tz_err="unknown time zone" tz_ok=Europe/London cur_err="currency must be a three-letter code"
--         settings_err=42501 consent_now=t
--         auth_report_metrics=f auth_close_month=f auth_run_recurring=f auth_confirm_pending=f auth_is_member=t anon_is_member=f
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); d uuid := gen_random_uuid();
  ha uuid; code text; code2 text; r uuid; i int := 0; wrong text; tries int; blocked text; right_blocked text;
  c_joined boolean; c_counted int; d_ok boolean; tz_err text; tz_ok text; cur_err text; settings_err text; consent_now boolean;
begin
  insert into auth.users (id, email, aud, role) values
    (a, a || '@test.local', 'authenticated', 'authenticated'), (b, b || '@test.local', 'authenticated', 'authenticated'),
    (c, c || '@test.local', 'authenticated', 'authenticated'), (d, d || '@test.local', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ha := public.create_household('T Hard', 'ILS', 'Owner');
  code := public.create_invite();
  code2 := public.create_invite();
  reset role;

  -- B: ten wrong codes are answered with null; the eleventh try is refused, even with a real code
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  loop
    begin
      r := public.join_household('WRNG-' || lpad(i::text, 4, '0'), 'Guesser');
      if i = 0 then wrong := coalesce(r::text, 'null'); end if;
      i := i + 1;
    exception when others then
      blocked := sqlerrm;
      exit;
    end;
    exit when i > 20;
  end loop;
  tries := i;
  begin
    perform public.join_household(code2, 'Guesser');
  exception when others then
    right_blocked := sqlerrm;
  end;
  reset role;

  -- C: a real code works, and joining is not counted as an attempt
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  c_joined := public.join_household(code, 'Partner') = ha;
  reset role;
  select coalesce(sum(hits), 0) into c_counted from app.rate_windows where key like 'join:%:' || c;

  -- D: someone else's guessing doesn't block them (a wrong code still just returns null)
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  set local role authenticated;
  d_ok := public.join_household('NOPE-NOPE', 'Bystander') is null;
  reset role;

  -- A edits the household: time zone and currency are checked, settings is read-only, consent uses the server's clock
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin update public.households set timezone = 'Mars/Olympus' where id = ha; exception when others then tz_err := sqlerrm; end;
  update public.households set timezone = 'Europe/London' where id = ha;
  begin update public.households set base_currency = 'a1b' where id = ha; exception when others then cur_err := sqlerrm; end;
  begin update public.households set settings = '{"x": 1}' where id = ha; exception when others then settings_err := sqlstate; end;
  update public.households set ai_consent_at = timestamptz '2099-01-01' where id = ha;
  reset role;
  select timezone, ai_consent_at between now() - interval '1 minute' and now() + interval '1 minute'
  into tz_ok, consent_now from public.households where id = ha;

  raise exception 'TEST_ROLLBACK wrong=% tries_before_block=% blocked="%" right_code_while_blocked="%" c_joined=% c_counted=% d_unaffected=% tz_err="%" tz_ok=% cur_err="%" settings_err=% consent_now=% auth_report_metrics=% auth_close_month=% auth_run_recurring=% auth_confirm_pending=% auth_is_member=% anon_is_member=%',
    wrong, tries, blocked, right_blocked, c_joined, c_counted, d_ok, tz_err, tz_ok, cur_err, settings_err, consent_now,
    has_function_privilege('authenticated', 'app.report_metrics(uuid, date)', 'execute'),
    has_function_privilege('authenticated', 'app.close_month(uuid, date)', 'execute'),
    has_function_privilege('authenticated', 'app.run_recurring(uuid, date)', 'execute'),
    has_function_privilege('authenticated', 'app.confirm_pending(uuid, uuid, text, text, text)', 'execute'),
    has_function_privilege('authenticated', 'app.is_member(uuid)', 'execute'),
    has_function_privilege('anon', 'app.is_member(uuid)', 'execute');
end $$;
