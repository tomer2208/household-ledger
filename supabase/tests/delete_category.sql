-- Checks for migration 22 (delete_category). One block, ends by raising TEST_ROLLBACK with its
-- findings, so nothing is kept. Needs the dev fixture dev-preview@householdledger.test ("Our Home").
-- Expect: dry=delete still_there=1 unused=delete gone=0 used=archive archived=t tx_count=1
--         blocked=blocked blocked_err="move or pause 1 recurring expense(s) first"
--         savings_err="the Savings category cannot be deleted" other_hh_err="unknown category"
do $$
declare
  u uuid; h uuid; c_unused uuid; c_used uuid; c_rule uuid; c_sav uuid; c_other uuid;
  dry jsonb; after_dry int; r1 jsonb; r2 jsonb; r3 jsonb; e_block text; e_sav text; e_other text;
begin
  select id into u from auth.users where email = 'dev-preview@householdledger.test';
  select household_id into h from public.household_members where user_id = u and removed_at is null;

  insert into public.categories (household_id, name, sf_symbol, kind) values (h, 'T Unused', 'tag', 'expense') returning id into c_unused;
  insert into public.categories (household_id, name, sf_symbol, kind) values (h, 'T Used', 'tag', 'expense') returning id into c_used;
  insert into public.categories (household_id, name, sf_symbol, kind) values (h, 'T Rule', 'tag', 'expense') returning id into c_rule;
  select id into c_sav from public.categories where household_id = h and kind = 'savings';
  select c.id into c_other from public.categories c where c.household_id <> h limit 1;

  insert into public.category_budgets (category_id, household_id, effective_month, cap_minor)
  values (c_unused, h, app.local_month(h, now()), 50000);
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency)
  values (h, u, 'manual', 'Test', c_used, 1000, 'ILS');
  insert into public.recurring_rules (household_id, title, category_id, amount_minor, currency, amount_kind,
                                      interval_months, day_of_month, start_date)
  values (h, 'Test rule', c_rule, 1000, 'ILS', 'fixed', 1, 5, current_date);

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  dry := public.delete_category(c_unused, true);
  reset role;
  select count(*) into after_dry from public.categories where id = c_unused;
  set local role authenticated;
  r1 := public.delete_category(c_unused);
  r2 := public.delete_category(c_used);
  r3 := public.delete_category(c_rule, true);
  begin perform public.delete_category(c_rule); exception when others then e_block := sqlerrm; end;
  begin perform public.delete_category(c_sav); exception when others then e_sav := sqlerrm; end;
  if c_other is not null then
    begin perform public.delete_category(c_other); exception when others then e_other := sqlerrm; end;
  end if;
  reset role;

  raise exception 'TEST_ROLLBACK dry=% still_there=% unused=% gone=% used=% archived=% tx_count=% blocked=% blocked_err="%" savings_err="%" other_hh_err="%"',
    dry->>'action', after_dry, r1->>'action',
    (select count(*) from public.categories where id = c_unused),
    r2->>'action', (select archived_at is not null from public.categories where id = c_used), r2->>'transactions',
    r3->>'action', e_block, e_sav, coalesce(e_other, 'n/a (single household)');
end $$;
