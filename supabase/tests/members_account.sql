-- Checks for migration 18 (leave / remove member / purge). Every block ends by raising
-- TEST_ROLLBACK with its findings, so nothing is kept. Expected values are in comments.
-- Needs the dev fixtures: dev-preview@householdledger.test ("Our Home") and e2e-fixture@test.local.

-- 1. purge removes every row of the household.  Expect: rows_after=0
do $$
declare h uuid; before_tx int; after_rows int;
begin
  select id into h from public.households where name = 'Our Home' limit 1;
  select count(*) into before_tx from public.transactions where household_id = h;
  perform app.purge_household(h);
  select (select count(*) from public.transactions where household_id = h)
       + (select count(*) from public.categories where household_id = h)
       + (select count(*) from public.households where id = h)
       + (select count(*) from public.audit_log where household_id = h)
       + (select count(*) from public.month_closes where household_id = h) into after_rows;
  raise exception 'TEST_ROLLBACK tx_before=% rows_after=%', before_tx, after_rows;
end $$;

-- 2. sole member: removing self is refused, leaving deletes the household.
--    Expect: self_remove_err="use leave_household to leave" leave=deleted households_left=0 active_devices=0
do $$
declare u uuid; h uuid; r text; err text; dev int;
begin
  select id into u from auth.users where email = 'dev-preview@householdledger.test';
  select household_id into h from public.household_members where user_id = u and removed_at is null;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.remove_member(u); exception when others then err := sqlerrm; end;
  r := public.leave_household();
  reset role;
  select count(*) into dev from public.device_tokens where user_id = u and revoked_at is null;
  raise exception 'TEST_ROLLBACK self_remove_err="%" leave=% households_left=% active_devices=%',
    err, r, (select count(*) from public.households where id = h), dev;
end $$;

-- 3. two members: remove works and is audited; leaving keeps the household for the partner.
--    Expect: partner_active_after_remove=f leave=left household_exists=1 new_audit_rows=3
do $$
declare u uuid; p uuid; h uuid; r text; partner_active boolean; hh_exists int; a0 int;
begin
  select id into u from auth.users where email = 'dev-preview@householdledger.test';
  select id into p from auth.users where email = 'e2e-fixture@test.local';
  select household_id into h from public.household_members where user_id = u and removed_at is null;
  update public.household_members set removed_at = now() where user_id = p and removed_at is null;
  insert into public.household_members (household_id, user_id, display_name) values (h, p, 'Partner');
  select count(*) into a0 from public.audit_log where entity = 'household_members' and household_id = h;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.remove_member(p);
  reset role;
  select removed_at is null into partner_active from public.household_members where household_id = h and user_id = p;
  update public.household_members set removed_at = null where household_id = h and user_id = p;
  set local role authenticated;
  r := public.leave_household();
  reset role;
  select count(*) into hh_exists from public.households where id = h;
  raise exception 'TEST_ROLLBACK partner_active_after_remove=% leave=% household_exists=% new_audit_rows=%', partner_active, r, hh_exists,
    (select count(*) from public.audit_log where entity = 'household_members' and household_id = h) - a0;
end $$;

-- 4. account deletion prep: a shared household stays, a solo one is deleted.
--    Expect: shared=left tx_kept=45 alone=deleted household_left=0
do $$
declare u uuid; p uuid; h uuid; r1 text; r2 text; tx int;
begin
  select id into u from auth.users where email = 'dev-preview@householdledger.test';
  select id into p from auth.users where email = 'e2e-fixture@test.local';
  select household_id into h from public.household_members where user_id = u and removed_at is null;
  update public.household_members set removed_at = now() where user_id = p and removed_at is null;
  insert into public.household_members (household_id, user_id, display_name) values (h, p, 'Partner');
  r1 := public.prepare_account_deletion(p);
  select count(*) into tx from public.transactions where household_id = h;
  r2 := public.prepare_account_deletion(u);
  raise exception 'TEST_ROLLBACK shared=% tx_kept=% alone=% household_left=%', r1, tx, r2, (select count(*) from public.households where id = h);
end $$;
