-- Checks for migration 49 (one Apple Pay Shortcut per household). One block, ends by raising
-- TEST_ROLLBACK with its findings, so nothing is kept. Makes its own users and households.
-- Tomer (Hebrew) makes the household key; the Shortcut on two iPhones sends it with the phone's
-- name. Each phone logs a purchase before anyone says whose it is; then each is assigned.
-- Expect: same_device=t two_devices=t unowned=true,true moved=1,1 owners=t lang=he,en no_name=iPhone
--         revoked_phone=0 old_key=0 new_key=1 own_token_still=t stranger_assign="unknown device"
--         not_member="that person is not in this household" read_keys=42501 call_auth=42501 key_shape=t
--         partner_sees_key=t stranger_sees_key=null
do $$
declare
  u uuid := gen_random_uuid(); p uuid := gen_random_uuid(); s uuid := gen_random_uuid(); h uuid; code text;
  k text; k2 text; own text; c uuid; d1 uuid; d1b uuid; d2 uuid; d2b uuid; t1 uuid; t2 uuid; r record; m1 int; m2 int;
  unowned text; owners boolean; lang text; no_name text; revoked int; old_key int; new_key int; own_ok boolean;
  stranger_assign text; not_member text; read_keys text; call_auth text; partner_sees boolean; stranger_sees text;
begin
  insert into auth.users (id, email, aud, role) values
    (u, u || '@test.local', 'authenticated', 'authenticated'), (p, p || '@test.local', 'authenticated', 'authenticated'),
    (s, s || '@test.local', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  h := public.create_household('T Key', 'ILS', 'Tomer', 'he');
  code := public.create_invite();
  k := public.create_household_key();
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform public.join_household(code, 'Noa');
  perform public.set_my_language('en');
  reset role;
  select id into c from public.categories where household_id = h and kind = 'expense' order by sort_order limit 1;

  select * into r from public.capture_auth(app.sha256_hex(k), ' Tomer''s iPhone ');
  d1 := r.device_id;
  select device_id into d1b from public.capture_auth(app.sha256_hex(k), 'TOMER''S IPHONE');
  select device_id into d2 from public.capture_auth(app.sha256_hex(k), 'Noa iPhone');
  t1 := (public.capture_record(jsonb_build_object('household_id', h, 'user_id', null, 'device_id', d1, 'status', 'confirmed',
          'title', 'Aroma', 'raw_merchant', 'AROMA', 'category_id', c, 'amount_minor', 2500, 'currency', 'ILS',
          'occurred_at', now(), 'idempotency_key', 'k1'))->>'transaction_id')::uuid;
  t2 := (public.capture_record(jsonb_build_object('household_id', h, 'user_id', null, 'device_id', d2, 'status', 'confirmed',
          'title', 'Fox', 'raw_merchant', 'FOX', 'category_id', c, 'amount_minor', 9900, 'currency', 'ILS',
          'occurred_at', now(), 'idempotency_key', 'k2'))->>'transaction_id')::uuid;
  select string_agg((created_by is null)::text, ',' order by title) into unowned from public.transactions where id in (t1, t2);

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  m1 := public.assign_device(d1, u);
  m2 := public.assign_device(d2, p);
  begin perform public.assign_device(d1, s); exception when others then not_member := sqlerrm; end;
  own := (select token from public.create_device_token('Old phone'));
  reset role;
  owners := (select created_by from public.transactions where id = t1) = u and (select created_by from public.transactions where id = t2) = p;
  lang := (select language from public.capture_auth(app.sha256_hex(k), 'Tomer''s iPhone')) || ','
       || (select language from public.capture_auth(app.sha256_hex(k), 'Noa iPhone'));
  -- (two statements: a row the function adds isn't visible to the statement that called it)
  select device_id into d2b from public.capture_auth(app.sha256_hex(k), '  ');
  no_name := (select label from public.device_tokens where id = d2b);

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.revoke_device_token(d2);
  reset role;
  select count(*) into revoked from public.capture_auth(app.sha256_hex(k), 'Noa iPhone');

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  k2 := public.create_household_key();
  -- the partner can copy the key on their own phone (migration 51)
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  partner_sees := public.household_key()->>'key' = k2;
  reset role;
  select count(*) into old_key from public.capture_auth(app.sha256_hex(k), 'Tomer''s iPhone');
  select count(*) into new_key from public.capture_auth(app.sha256_hex(k2), 'Tomer''s iPhone');
  own_ok := (select user_id from public.capture_auth(app.sha256_hex(own))) = u;

  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.create_household('T Other', 'ILS', 'S');
  begin perform public.assign_device(d1, s); exception when others then stranger_assign := sqlerrm; end;
  begin perform 1 from public.household_capture_keys; exception when others then read_keys := sqlstate; end;
  begin perform public.capture_auth(app.sha256_hex(k2), 'x'); exception when others then call_auth := sqlstate; end;
  stranger_sees := coalesce(public.household_key()->>'key', 'null');
  reset role;

  raise exception 'TEST_ROLLBACK same_device=% two_devices=% unowned=% moved=%,% owners=% lang=% no_name=% revoked_phone=% old_key=% new_key=% own_token_still=% stranger_assign="%" not_member="%" read_keys=% call_auth=% key_shape=% partner_sees_key=% stranger_sees_key=%',
    d1 = d1b, d1 <> d2, unowned, m1, m2, owners, lang, no_name, revoked, old_key, new_key, own_ok,
    stranger_assign, not_member, read_keys, call_auth, k ~ '^hl_hh_[0-9a-f]{48}$', partner_sees, stranger_sees;
end $$;
