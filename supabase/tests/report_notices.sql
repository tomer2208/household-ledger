-- Checks for migration 40 (P1-19, the "your report is ready" notification). One block, ends by
-- raising TEST_ROLLBACK with its findings, so nothing is kept. Makes its own users and households.
-- A (Hebrew) keeps report notices on; P (English) turns them off; S is another household.
-- Expect: pending_not_queued=t ready_queued=t one_item=t item_kind=report to_a_only=t lang=he numbers=t
--         stranger_separate=t claimed_twice=f sent=t regenerated_not_requeued=t old_reports_quiet=t p_back_on=t
do $$
declare
  a uuid := gen_random_uuid(); p uuid := gen_random_uuid(); s uuid := gen_random_uuid();
  h uuid; hs uuid; code text; prev date; r uuid; rs uuid; c jsonb; mine jsonb; c2 jsonb;
  ok_pending boolean; ok_queued boolean; ok_old boolean;
begin
  insert into auth.users (id, email, aud, role) values
    (a, a || '@test.local', 'authenticated', 'authenticated'), (p, p || '@test.local', 'authenticated', 'authenticated'),
    (s, s || '@test.local', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  h := public.create_household('T Notices', 'ILS', 'A', 'he');
  code := public.create_invite();
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.join_household(code, 'P');
  perform public.set_report_notices(false);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  hs := public.create_household('T Other', 'ILS', 'S');
  reset role;
  insert into public.push_tokens (user_id, expo_push_token) values
    (a, 'ExponentPushToken[a]'), (p, 'ExponentPushToken[p]'), (s, 'ExponentPushToken[s]');
  prev := (app.local_month(h, now()) - interval '1 month')::date;

  -- a report from before (already ready when written) was announced by migration 40 or not at all
  ok_old := not exists (select 1 from public.monthly_reports where push_status is null and status in ('ready', 'fallback'));

  insert into public.monthly_reports (household_id, budget_month, status, metrics)
  values (h, prev, 'pending', '{"totals": {"spent": 820000, "cap": 1000000}}') returning id into r;
  ok_pending := (select push_status from public.monthly_reports where id = r) is null;
  update public.monthly_reports set status = 'ready' where id = r;
  ok_queued := (select push_status from public.monthly_reports where id = r) = 'queued';
  insert into public.monthly_reports (household_id, budget_month, status, metrics)
  values (hs, prev, 'fallback', '{"totals": {"spent": 1, "cap": 2}}') returning id into rs;

  c := public.claim_push_alerts();
  select e into mine from jsonb_array_elements(c) e where e->>'report_id' = r::text;
  c2 := public.claim_push_alerts();

  perform public.finish_push_alerts(jsonb_build_array(jsonb_build_object('report_id', r, 'status', 'sent')), '{}');

  -- written again (e.g. regenerated): already announced, nothing new is queued
  update public.monthly_reports set status = 'pending' where id = r;
  update public.monthly_reports set status = 'ready' where id = r;

  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_report_notices(true);
  reset role;

  raise exception 'TEST_ROLLBACK pending_not_queued=% ready_queued=% one_item=% item_kind=% to_a_only=% lang=% numbers=% stranger_separate=% claimed_twice=% sent=% regenerated_not_requeued=% old_reports_quiet=% p_back_on=%',
    ok_pending, ok_queued,
    (select count(*) from jsonb_array_elements(c) e where e->>'report_id' = r::text) = 1,
    mine->>'kind',
    mine->'tokens' = '["ExponentPushToken[a]"]'::jsonb and mine->'web' = '[]'::jsonb,
    mine->'token_lang'->>'ExponentPushToken[a]',
    (mine->>'spent_minor')::bigint = 820000 and (mine->>'cap_minor')::bigint = 1000000 and mine->>'budget_month' = prev::text,
    (select e->'tokens' = '["ExponentPushToken[s]"]'::jsonb from jsonb_array_elements(c) e where e->>'report_id' = rs::text),
    exists (select 1 from jsonb_array_elements(c2) e where e->>'report_id' = r::text),
    (select push_status from public.monthly_reports where id = r) = 'sent',
    (select push_status from public.monthly_reports where id = r) = 'sent',
    ok_old,
    (select notify_reports from public.household_members where user_id = p);
end $$;
