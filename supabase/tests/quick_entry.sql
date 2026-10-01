-- Checks for migration 31 (P1-8, recent_expense_templates and suggest_category). One block, ends
-- by raising TEST_ROLLBACK with its findings, so nothing is kept. Makes its own users and household.
-- Expect: templates=6 first="Babysitter" first_uses=4 first_amount=20000 first_cat=Kids second="market" second_uses=3
--         has_gym=f has_zara=f has_shufersal=f refund_counted=f
--         sug_merchant=Groceries/merchant sug_history=Kids/history sug_branch=Groceries/history
--         sug_similar=Kids/similar sug_none=null sug_archived=null sug_short=null stranger_templates=0 stranger_sug=null anon=f
do $$
declare
  u uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); h uuid;
  c_groc uuid; c_din uuid; c_kids uuid; c_shop uuid; mer uuid;
  t jsonb; ts jsonb;
  s_mer jsonb; s_hist jsonb; s_branch jsonb; s_sim jsonb; s_none jsonb; s_arch jsonb; s_short jsonb; s_str jsonb;
begin
  insert into auth.users (id, email, aud, role) values
    (u, u || '@test.local', 'authenticated', 'authenticated'),
    (stranger, stranger || '@test.local', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  h := public.create_household('T Quick', 'ILS', 'Tester');
  select id into c_groc from public.categories where household_id = h and name = 'Groceries';
  select id into c_din  from public.categories where household_id = h and name = 'Dining';
  select id into c_kids from public.categories where household_id = h and name = 'Kids';
  select id into c_shop from public.categories where household_id = h and name = 'Shopping';

  -- Babysitter: 4 uses, the latest at ₪200; a refund and a deleted one must not count
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency, occurred_at) values
    (h, u, 'manual', 'Babysitter', c_kids, 15000, 'ILS', now() - interval '20 days'),
    (h, u, 'manual', 'Babysitter', c_kids, 18000, 'ILS', now() - interval '13 days'),
    (h, u, 'manual', 'babysitter', c_kids, 18000, 'ILS', now() - interval '6 days'),
    (h, u, 'manual', 'Babysitter', c_kids, 20000, 'ILS', now() - interval '2 days'),
    (h, u, 'manual', 'Babysitter', c_kids, -5000, 'ILS', now() - interval '1 day');
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency, occurred_at, deleted_at)
    values (h, u, 'manual', 'Babysitter', c_kids, 99900, 'ILS', now() - interval '3 hours', now());
  -- market: 3 uses across spellings and branch numbers
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency, occurred_at) values
    (h, u, 'manual', 'Market 042', c_groc, 6000, 'ILS', now() - interval '15 days'),
    (h, u, 'manual', 'MARKET', c_groc, 7000, 'ILS', now() - interval '8 days'),
    (h, u, 'manual', 'market', c_groc, 6500, 'ILS', now() - interval '4 days');
  -- five one-offs (only four fit after the top two), an old gym, an archived category
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency, occurred_at) values
    (h, u, 'manual', 'Coffee', c_din, 1400, 'ILS', now() - interval '1 day'),
    (h, u, 'manual', 'Pharmacy', c_groc, 3000, 'ILS', now() - interval '2 days'),
    (h, u, 'manual', 'Parking', c_groc, 1200, 'ILS', now() - interval '3 days'),
    (h, u, 'manual', 'Bakery', c_groc, 2500, 'ILS', now() - interval '5 days'),
    (h, u, 'manual', 'Laundry', c_groc, 4000, 'ILS', now() - interval '30 days'),
    (h, u, 'manual', 'Gym', c_groc, 25000, 'ILS', now() - interval '90 days'),
    (h, u, 'manual', 'Gym', c_groc, 25000, 'ILS', now() - interval '120 days'),
    (h, u, 'manual', 'Zara', c_shop, 30000, 'ILS', now() - interval '3 days'),
    (h, u, 'manual', 'Zara', c_shop, 30000, 'ILS', now() - interval '9 days');
  reset role;
  update public.categories set archived_at = now() where id = c_shop;
  -- Apple Pay purchases are already automatic: not offered as manual templates
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency, occurred_at)
  select h, u, 'apple_pay', 'Shufersal', c_groc, 10000, 'ILS', now() - make_interval(days => g) from generate_series(1, 5) g;
  -- a merchant the Shortcut learned
  insert into public.merchants (household_id, display_name, default_category_id) values (h, 'Super Farm', c_groc) returning id into mer;
  insert into public.merchant_aliases (household_id, normalized, merchant_id, source) values (h, 'super farm', mer, 'user');
  set local role authenticated;

  t := public.recent_expense_templates();
  s_mer    := public.suggest_category('SUPER FARM');
  s_hist   := public.suggest_category('babysitter');
  s_branch := public.suggest_category('Market 777');
  s_sim    := public.suggest_category('Babysitters');
  s_none   := public.suggest_category('Electricity');
  s_arch   := public.suggest_category('Zara');
  s_short  := public.suggest_category('a');
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.create_household('T Other', 'ILS', 'Stranger');
  ts := public.recent_expense_templates();
  s_str := public.suggest_category('babysitter');
  reset role;

  raise exception 'TEST_ROLLBACK templates=% first="%" first_uses=% first_amount=% first_cat=% second="%" second_uses=% has_gym=% has_zara=% has_shufersal=% refund_counted=% sug_merchant=% sug_history=% sug_branch=% sug_similar=% sug_none=% sug_archived=% sug_short=% stranger_templates=% stranger_sug=% anon=%',
    jsonb_array_length(t), t->0->>'title', t->0->>'uses', t->0->>'amount_minor',
    (select name from public.categories where id = (t->0->>'category_id')::uuid),
    t->1->>'title', t->1->>'uses',
    t::text ilike '%gym%', t::text ilike '%zara%', t::text ilike '%shufersal%', (t->0->>'uses')::int > 4,
    (select name from public.categories where id = (s_mer->>'category_id')::uuid) || '/' || (s_mer->>'source'),
    (select name from public.categories where id = (s_hist->>'category_id')::uuid) || '/' || (s_hist->>'source'),
    (select name from public.categories where id = (s_branch->>'category_id')::uuid) || '/' || (s_branch->>'source'),
    (select name from public.categories where id = (s_sim->>'category_id')::uuid) || '/' || (s_sim->>'source'),
    coalesce(s_none::text, 'null'), coalesce(s_arch::text, 'null'), coalesce(s_short::text, 'null'),
    jsonb_array_length(ts), coalesce(s_str::text, 'null'),
    has_function_privilege('anon', 'public.suggest_category(text)', 'execute');
end $$;
