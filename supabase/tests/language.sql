-- Checks for migration 34 (P1-6, language per member). One block, ends by raising TEST_ROLLBACK
-- with its findings, so nothing is kept. Makes its own users and households; needs no fixture.
-- A creates a household in Hebrew; B (English) is a member of it; C creates one the old way.
-- Expect: he_lang=he he_cats=16 he_names=סופרמרקט,אוכל בחוץ,אחר,חיסכון he_savings=savings
--         en_lang=en en_names=Groceries,Other,Savings
--         b_set=he a_after_b=he c_after_b=en bad_err="language must be en or he" anon_err="not signed in"
--         auth_lang=he token_lang=he/en web_lang=he/en anon_exec=f
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  ha uuid; hc uuid; cat uuid; v jsonb; al jsonb;
  he_lang text; he_cats int; he_names text; he_savings text; en_lang text; en_names text;
  b_set text; a_after text; c_after text; bad_err text; anon_err text; auth_lang text; tok text; web text;
begin
  insert into auth.users (id, email, aud, role) values
    (a, a || '@test.local', 'authenticated', 'authenticated'),
    (b, b || '@test.local', 'authenticated', 'authenticated'),
    (c, c || '@test.local', 'authenticated', 'authenticated');

  -- A: a Hebrew household starts with Hebrew categories, and A's language is Hebrew
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ha := public.create_household('הבית שלנו', 'ILS', 'אורי', 'he');
  reset role;
  select language into he_lang from public.household_members where user_id = a;
  select count(*) into he_cats from public.categories where household_id = ha;
  select string_agg(name, ',' order by sort_order) into he_names
  from public.categories where household_id = ha and sort_order in (1, 2, 99, 100);
  select kind into he_savings from public.categories where household_id = ha and name = 'חיסכון';

  -- C: the three-argument call still works, in English
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  hc := public.create_household('Home', 'ILS', 'Cy');
  reset role;
  select language into en_lang from public.household_members where user_id = c;
  select string_agg(name, ',' order by sort_order) into en_names
  from public.categories where household_id = hc and sort_order in (1, 99, 100);

  -- B joins A's household (English by default) and switches to Hebrew: only B's row changes
  insert into public.household_members (household_id, user_id, display_name) values (ha, b, 'Bea');
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_my_language('he');
  perform public.set_my_language('he'); -- again: nothing to change, no error
  begin perform public.set_my_language('fr'); exception when others then bad_err := sqlerrm; end;
  reset role;
  select language into b_set from public.household_members where user_id = b;
  select language into a_after from public.household_members where user_id = a;
  select language into c_after from public.household_members where user_id = c;
  perform set_config('request.jwt.claims', '{}', true);
  begin perform public.set_my_language('he'); exception when others then anon_err := sqlerrm; end;

  -- back to English for B, so the push check below sees one recipient in each language
  update public.household_members set language = 'en' where user_id = b;

  -- the Shortcut learns its owner's language
  insert into public.device_tokens (household_id, user_id, label, token_hash) values (ha, a, 'iPhone', 'lang-test-hash');
  select x.language into auth_lang from public.capture_auth('lang-test-hash') x;

  -- a budget alert: each token and browser comes with its owner's language
  insert into public.push_tokens (user_id, expo_push_token) values (a, 'ExponentPushToken[a]'), (b, 'ExponentPushToken[b]');
  insert into public.web_push_subscriptions (endpoint, user_id, p256dh, auth) values
    ('https://push.test/a', a, 'k', 's'), ('https://push.test/b', b, 'k', 's');
  select id into cat from public.categories where household_id = ha and sort_order = 1;
  update public.budget_alerts set push_status = 'sent' where push_status in ('queued', 'sending');
  insert into public.budget_alerts (household_id, category_id, budget_month, threshold, spent_minor, cap_minor)
  values (ha, cat, date_trunc('month', now())::date, 90, 90000, 100000);
  v := public.claim_push_alerts();
  al := (select x from jsonb_array_elements(v) x where x->>'category_id' = cat::text);
  tok := (al->'token_lang'->>'ExponentPushToken[a]') || '/' || (al->'token_lang'->>'ExponentPushToken[b]');
  web := (select string_agg(w->>'lang', '/' order by w->>'endpoint') from jsonb_array_elements(al->'web') w);

  raise exception 'TEST_ROLLBACK he_lang=% he_cats=% he_names=% he_savings=% en_lang=% en_names=% b_set=% a_after_b=% c_after_b=% bad_err="%" anon_err="%" auth_lang=% token_lang=% web_lang=% anon_exec=%',
    he_lang, he_cats, he_names, he_savings, en_lang, en_names, b_set, a_after, c_after, bad_err, anon_err,
    auth_lang, tok, web, has_function_privilege('anon', 'public.set_my_language(text)', 'execute');
end $$;
