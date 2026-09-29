-- CI only: the dev fixtures the SQL tests expect (they exist by hand in household-ledger-dev).
-- dev-preview@householdledger.test owns "Our Home" with a few expenses; e2e-fixture@test.local
-- has no household. Never run this against a real project.
do $$
declare u uuid := gen_random_uuid(); p uuid := gen_random_uuid(); h uuid; c uuid;
begin
  insert into auth.users (id, email, aud, role) values
    (u, 'dev-preview@householdledger.test', 'authenticated', 'authenticated'),
    (p, 'e2e-fixture@test.local', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  h := public.create_household('Our Home', 'ILS', 'Dev');
  select id into c from public.categories where household_id = h and name = 'Groceries';
  perform public.set_category_budget(c, 200000);
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency)
  select h, u, 'manual', 'Fixture ' || g, c, 1000 * g, 'ILS' from generate_series(1, 5) g;
  reset role;
end $$;
