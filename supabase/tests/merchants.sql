-- Checks for migration 39 (P1-13, correcting learned merchants). One block, ends by raising
-- TEST_ROLLBACK with its findings, so nothing is kept. Makes its own users and households.
-- "Shufersal" was learned with the wrong default (Dining) and the same shop again as
-- "שופרסל דיל". Last month is closed and has one of its expenses; one this month awaits review.
-- Expect: listed=2 first_is_most_used=t aliases_listed=t dry=t dry_changed_nothing=t moved=t now_groceries=t
--         review_confirmed=t closed_month_kept=t renamed=t
--         errors="merchant names are 1 to 60 characters|unknown category|unknown category|unknown merchant"
--         merged={"aliases": 1, "recurring": 1, "transactions": 2} from_gone=t all_on_into=t old_spelling_matches_into=t
--         self_merge="a merchant cannot be merged into itself" stranger_merge="unknown merchant" alias_removed=t
--         anon_list=f anon_merge=f
do $$
declare
  u uuid := gen_random_uuid(); s uuid := gen_random_uuid(); h uuid; hs uuid;
  groc uuid; din uuid; fun uuid; s_cat uuid; m1 uuid; m2 uuid; cur date; prev date; pend uuid; old uuid;
  l jsonb; dry jsonb; dry1 jsonb; res jsonb; merged jsonb; bad text[] := '{}'; self_err text; stranger_err text;
  ok_dry_nothing boolean; ok_now boolean; ok_review boolean; ok_closed boolean; ok_renamed boolean;
  ok_gone boolean; ok_all boolean; ok_match boolean; ok_alias boolean;
begin
  insert into auth.users (id, email, aud, role) values
    (u, u || '@test.local', 'authenticated', 'authenticated'), (s, s || '@test.local', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  h := public.create_household('T Merchants', 'ILS', 'Me');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  hs := public.create_household('T Other', 'ILS', 'Stranger');
  reset role;
  select id into groc from public.categories where household_id = h and name = 'Groceries';
  select id into din from public.categories where household_id = h and name = 'Dining';
  select id into fun from public.categories where household_id = h and name = 'Entertainment';
  select id into s_cat from public.categories where household_id = hs and name = 'Groceries';
  update public.categories set archived_at = now() where id = fun;
  cur := app.local_month(h, now());
  prev := (cur - interval '1 month')::date;

  insert into public.merchants (household_id, display_name, default_category_id) values (h, 'Shufersal', din) returning id into m1;
  insert into public.merchants (household_id, display_name, default_category_id) values (h, 'שופרסל דיל', groc) returning id into m2;
  insert into public.merchant_aliases (household_id, normalized, merchant_id, source) values
    (h, 'shufersal', m1, 'llm'), (h, 'שופרסל דיל', m2, 'fuzzy');
  insert into public.transactions (household_id, created_by, source, title, merchant_id, category_id, amount_minor, currency, occurred_at)
  select h, u, 'apple_pay', 'Shufersal', m1, din, 5000 + g, 'ILS', now() - make_interval(mins => g) from generate_series(1, 3) g;
  insert into public.transactions (household_id, created_by, source, status, title, merchant_id, category_id, amount_minor, currency, occurred_at)
  values (h, u, 'apple_pay', 'pending_review', 'Shufersal', m1, din, 7000, 'ILS', now()) returning id into pend;
  insert into public.transactions (household_id, created_by, source, title, merchant_id, category_id, amount_minor, currency, occurred_at)
  values (h, u, 'apple_pay', 'Shufersal', m1, din, 9000, 'ILS', (prev + 10 + time '12:00') at time zone 'Asia/Jerusalem') returning id into old;
  insert into public.transactions (household_id, created_by, source, title, merchant_id, category_id, amount_minor, currency, occurred_at)
  select h, u, 'apple_pay', 'שופרסל דיל', m2, groc, 3000, 'ILS', now() from generate_series(1, 2);
  insert into public.recurring_rules (household_id, title, merchant_id, category_id, amount_minor, currency, amount_kind,
                                      interval_months, day_of_month, start_date, created_by)
  values (h, 'Weekly order', m2, groc, 20000, 'ILS', 'fixed', 1, 28, cur, u);
  perform app.close_month(h, prev);

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  l := public.list_merchants();
  dry1 := public.update_merchant(m1, 'Shufersal Deal', groc, true, true);
  reset role;
  ok_dry_nothing := (select display_name from public.merchants where id = m1) = 'Shufersal'
    and (select count(*) from public.transactions where merchant_id = m1 and category_id = din) = 5;

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := public.update_merchant(m1, '  Shufersal Deal ', groc, true);
  foreach dry in array array[
    '{"name": "", "category": null}', jsonb_build_object('name', 'X', 'category', s_cat),
    jsonb_build_object('name', 'X', 'category', fun), jsonb_build_object('name', 'X', 'category', null, 'stranger', true)]::jsonb[] loop
    begin
      if dry ? 'stranger' then
        perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
      end if;
      perform public.update_merchant(m1, dry->>'name', (dry->>'category')::uuid);
      bad := bad || 'accepted'::text;
    exception when others then
      bad := bad || sqlerrm;
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  end loop;
  dry := public.update_merchant(m1, 'Shufersal Deal', groc, true, true);
  reset role;
  ok_now := (select bool_and(category_id = groc) from public.transactions where merchant_id = m1 and budget_month = cur);
  ok_review := (select status from public.transactions where id = pend) = 'confirmed';
  ok_closed := (select category_id from public.transactions where id = old) = din;
  ok_renamed := (select display_name = 'Shufersal Deal' and default_category_id = groc from public.merchants where id = m1);

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- the stranger can't merge A's merchants
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  begin perform public.merge_merchants(m1, m2); exception when others then stranger_err := sqlerrm; end;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  merged := public.merge_merchants(m1, m2);
  begin perform public.merge_merchants(m1, m1); exception when others then self_err := sqlerrm; end;
  perform public.remove_merchant_alias(m1, 'shufersal');
  reset role;
  ok_gone := not exists (select 1 from public.merchants where id = m2);
  ok_all := not exists (select 1 from public.transactions where merchant_id = m2)
        and not exists (select 1 from public.recurring_rules where merchant_id = m2)
        and (select count(*) from public.transactions where merchant_id = m1) = 7;
  ok_match := (public.capture_match(h, 'שופרסל דיל 4471')->'exact'->>'merchant_id')::uuid = m1;
  ok_alias := not exists (select 1 from public.merchant_aliases where household_id = h and normalized = 'shufersal');

  raise exception 'TEST_ROLLBACK listed=% first_is_most_used=% aliases_listed=% dry=% dry_changed_nothing=% moved=% now_groceries=% review_confirmed=% closed_month_kept=% renamed=% errors="%" merged=% from_gone=% all_on_into=% old_spelling_matches_into=% self_merge="%" stranger_merge="%" alias_removed=% anon_list=% anon_merge=%',
    jsonb_array_length(l), (l->0->>'id')::uuid = m1 and (l->0->>'tx_count')::int = 5,
    (l->0->'aliases'->0->>'normalized') = 'shufersal',
    (dry1->>'moved')::int = 4 and (dry1->>'closed')::int = 1,
    ok_dry_nothing, (res->>'moved')::int = 4 and (res->>'closed')::int = 1 and (dry->>'moved')::int = 0, ok_now, ok_review, ok_closed, ok_renamed,
    array_to_string(bad, '|'), merged, ok_gone, ok_all, ok_match, self_err, stranger_err, ok_alias,
    has_function_privilege('anon', 'public.list_merchants()', 'execute'),
    has_function_privilege('anon', 'public.merge_merchants(uuid, uuid)', 'execute');
end $$;
