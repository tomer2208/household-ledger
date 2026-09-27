-- Phase 1 smoke test. Runs everything inside one DO block and ends by raising an
-- exception carrying the report, so every row it created is rolled back.
-- Run as postgres (SQL editor or execute_sql). Every line must read PASS.

do $$
declare
  r   text[] := '{}';
  u1  uuid := gen_random_uuid();   -- household A
  u2  uuid := gen_random_uuid();   -- household A (partner)
  u3  uuid := gen_random_uuid();   -- household B (stranger)
  ha  uuid; hb uuid;
  code text; tok text; tokhash text; tok_id uuid; dev record;
  c_groc uuid; c_dining uuid; c_savings uuid; c_other uuid;
  n int; v bigint; j jsonb; tx1 uuid; tx_prev uuid; ok boolean;
  cur date; prev date;
begin
  insert into auth.users (id, email, aud, role) values
    (u1, u1 || '@test.local', 'authenticated', 'authenticated'),
    (u2, u2 || '@test.local', 'authenticated', 'authenticated'),
    (u3, u3 || '@test.local', 'authenticated', 'authenticated');

  -- ── as u1: create household A, invite ──
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  ha := public.create_household('Home', 'ILS', 'Tomer');
  code := public.create_invite();
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.join_household(lower(code), 'Partner');
  select count(*) into n from public.categories where household_id = ha;
  r := r || format('%s partner joins and sees 16 categories (got %s)', case when n = 16 then 'PASS' else 'FAIL' end, n);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  hb := public.create_household('Other', 'ILS', 'Stranger');
  select count(*) into n from public.categories where household_id = ha;
  r := r || format('%s RLS: stranger sees 0 of A''s categories (got %s)', case when n = 0 then 'PASS' else 'FAIL' end, n);
  update public.categories set name = 'hacked' where household_id = ha;
  get diagnostics n = row_count;
  r := r || format('%s RLS: stranger updates 0 of A''s categories (got %s)', case when n = 0 then 'PASS' else 'FAIL' end, n);
  begin
    perform public.join_household(code, 'Again');
    r := r || 'FAIL invite code is single-use'::text;
  exception when others then
    r := r || 'PASS invite code is single-use'::text;
  end;
  begin
    perform public.capture_match(ha, 'x');
    r := r || 'FAIL capture RPCs are closed to app users'::text;
  exception when insufficient_privilege then
    r := r || 'PASS capture RPCs are closed to app users'::text;
  end;
  begin
    perform public.review_transaction(gen_random_uuid(), 'Dining', null, 'x');
    r := r || 'FAIL stranger cannot review A''s transactions'::text;
  exception when sqlstate 'P0002' then
    r := r || 'PASS stranger cannot review A''s transactions'::text;
  end;
  execute 'reset role';

  select id into c_groc    from public.categories where household_id = ha and name = 'Groceries';
  select id into c_dining  from public.categories where household_id = ha and name = 'Dining';
  select id into c_savings from public.categories where household_id = ha and kind = 'savings';
  select id into c_other   from public.categories where household_id = ha and name = 'Other';
  cur  := app.local_month(ha, now());
  prev := (cur - interval '1 month')::date;

  -- ── as u1: budgets, transactions, alerts ──
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  perform public.set_category_budget(c_groc, 100000);     -- ₪1,000
  perform public.set_category_budget(c_dining, 100000);

  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency)
  values (ha, u1, 'manual', 'Shufersal', c_groc, 10000, 'ILS') returning id into tx1;
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency)
  values (ha, u1, 'manual', 'Rami Levy', c_groc, 80000, 'ILS');
  select count(*) into n from public.budget_alerts where category_id = c_groc;
  r := r || format('%s alert at exactly 90%% (rows %s)', case when n = 1 then 'PASS' else 'FAIL' end, n);

  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency)
  values (ha, u1, 'manual', 'Market', c_groc, 10000, 'ILS');
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency)
  values (ha, u1, 'manual', 'Market 2', c_groc, 5000, 'ILS');
  select count(*) into n from public.budget_alerts where category_id = c_groc;
  r := r || format('%s 100%% fires once, later spend adds nothing (rows %s)', case when n = 2 then 'PASS' else 'FAIL' end, n);

  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency)
  values (ha, u1, 'manual', 'Wedding dinner', c_dining, 120000, 'ILS');
  select count(*) into n from public.budget_alerts where category_id = c_dining;
  r := r || format('%s jump past 100%% records both thresholds (rows %s)', case when n = 2 then 'PASS' else 'FAIL' end, n);

  begin
    insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency)
    values (ha, u1, 'apple_pay', 'Fake', c_groc, 100, 'ILS');
    r := r || 'FAIL app cannot insert apple_pay rows'::text;
  exception when insufficient_privilege then
    r := r || 'PASS app cannot insert apple_pay rows'::text;
  end;

  begin
    insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency)
    values (ha, u1, 'manual', 'Oops', c_savings, 100, 'ILS');
    r := r || 'FAIL Savings category rejects expenses'::text;
  exception when check_violation then
    r := r || 'PASS Savings category rejects expenses'::text;
  end;

  begin
    insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency)
    values (ha, u1, 'manual', 'Amazon', c_other, 1000, 'JPY');   -- fx-sync never fetches JPY
    r := r || 'FAIL currency without a rate is refused'::text;
  exception when sqlstate 'P0002' then
    r := r || 'PASS currency without a rate is refused'::text;
  end;

  j := public.month_overview();
  r := r || format('%s month_overview totals: spent %s (expect 225000), net %s (expect -25000)',
    case when (j->>'total_spent')::bigint = 225000 and (j->>'net')::bigint = -25000 then 'PASS' else 'FAIL' end,
    j->>'total_spent', j->>'net');

  begin
    update public.households set base_currency = 'USD' where id = ha;
    r := r || 'FAIL base currency locked after first transaction'::text;
  exception when check_violation then
    r := r || 'PASS base currency locked after first transaction'::text;
  end;
  execute 'reset role';

  -- partner sees everything
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.transactions where household_id = ha;
  r := r || format('%s partner sees all 5 transactions (got %s)', case when n = 5 then 'PASS' else 'FAIL' end, n);
  execute 'reset role';

  -- ── FX ──
  insert into public.fx_rates (rate_date, base, quote, rate, source)
  values ((now() at time zone 'Asia/Jerusalem')::date, 'ILS', 'USD', 3.7, 'test')
  on conflict (rate_date, base, quote) do update set rate = 3.7;
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency)
  values (ha, u1, 'manual', 'Amazon', c_other, 1000, 'USD') returning amount_base_minor into v;
  r := r || format('%s $10.00 at 3.7 = ₪37.00 (got %s)', case when v = 3700 then 'PASS' else 'FAIL' end, v);

  -- ── month close + late adjustment (as system) ──
  insert into public.category_budgets (category_id, household_id, effective_month, cap_minor)
  values (c_groc, ha, prev, 150000);
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency, occurred_at)
  values (ha, u1, 'manual', 'Electricity', c_other, 40000, 'ILS', (prev + 10)::timestamp at time zone 'Asia/Jerusalem')
  returning id into tx_prev;
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency, occurred_at)
  values (ha, u1, 'manual', 'Groceries prev', c_groc, 90000, 'ILS', (prev + 12)::timestamp at time zone 'Asia/Jerusalem');

  v := app.close_month(ha, prev);
  r := r || format('%s close: 150000 cap − 130000 spent = 20000 net (got %s)', case when v = 20000 then 'PASS' else 'FAIL' end, v);
  v := app.close_month(ha, prev);
  select count(*) into n from public.savings_ledger where household_id = ha and entry_type = 'month_close';
  r := r || format('%s close is idempotent (second call %s, entries %s)', case when v is null and n = 1 then 'PASS' else 'FAIL' end, coalesce(v::text, 'null'), n);

  update public.transactions set amount_minor = 48400 where id = tx_prev;   -- estimate 400 → real 484
  select amount_minor into v from public.savings_ledger where household_id = ha and entry_type = 'late_adjustment';
  r := r || format('%s late adjustment 400→484 posts −8400 (got %s)', case when v = -8400 then 'PASS' else 'FAIL' end, v);
  v := app.savings_balance(ha);
  r := r || format('%s savings balance 20000 − 8400 = 11600 (got %s)', case when v = 11600 then 'PASS' else 'FAIL' end, v);

  begin
    update public.category_budgets set cap_minor = 1 where category_id = c_groc and effective_month = prev;
    r := r || 'FAIL budgets of closed months are locked'::text;
  exception when check_violation then
    r := r || 'PASS budgets of closed months are locked'::text;
  end;

  -- ── recurring: day 31, catch-up, no duplicates ──
  -- next_run_date set explicitly: simulates a rule whose cron runs were missed since January
  insert into public.recurring_rules (household_id, title, category_id, amount_minor, currency, amount_kind,
                                      interval_months, day_of_month, start_date, next_run_date)
  values (ha, 'Rent', c_other, 500000, 'ILS', 'fixed', 1, 31, date '2026-01-01', date '2026-01-31');
  n := app.run_recurring(ha, date '2026-04-15');
  select string_agg(to_char(recurring_period, 'MM-DD'), ',' order by recurring_period) into code
  from public.transactions where household_id = ha and source = 'recurring';
  r := r || format('%s recurring catch-up on day 31: %s (expect 01-31,02-28,03-31)',
    case when code = '01-31,02-28,03-31' then 'PASS' else 'FAIL' end, code);
  n := app.run_recurring(ha, date '2026-04-15');
  r := r || format('%s recurring re-run creates nothing (got %s)', case when n = 0 then 'PASS' else 'FAIL' end, n);

  insert into public.recurring_rules (household_id, title, category_id, amount_minor, currency, amount_kind,
                                      interval_months, day_of_month, start_date)
  values (ha, 'Gym since 2024', c_other, 20000, 'ILS', 'fixed', 1, 5, date '2024-01-05')
  returning next_run_date into cur;
  r := r || format('%s past start date does not backfill (next run %s)',
    case when cur >= app.local_today(ha) then 'PASS' else 'FAIL' end, cur);

  -- ── normalizer ──
  r := r || format('%s normalize "SHUFERSAL DEAL 123 TLV" → "%s"',
    case when app.normalize_merchant('SHUFERSAL DEAL 123 TLV') = 'shufersal deal tlv' then 'PASS' else 'FAIL' end,
    app.normalize_merchant('SHUFERSAL DEAL 123 TLV'));
  r := r || format('%s normalize Hebrew with RLM and בע"מ → "%s"',
    case when app.normalize_merchant(E'‏שופרסל בע"מ 0442') = 'שופרסל' then 'PASS' else 'FAIL' end,
    app.normalize_merchant(E'‏שופרסל בע"מ 0442'));
  r := r || format('%s normalize "PAZ YELLOW-0442, LTD." → "%s"',
    case when app.normalize_merchant('PAZ YELLOW-0442, LTD.') = 'paz yellow' then 'PASS' else 'FAIL' end,
    app.normalize_merchant('PAZ YELLOW-0442, LTD.'));

  -- ── capture flow (as the Edge Function / service_role) ──
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select t.id, t.token into tok_id, tok from public.create_device_token('Tomer''s iPhone') t;
  execute 'reset role';
  tokhash := app.sha256_hex(tok);   -- the Edge Function hashes in Deno; service_role can't call app.*

  perform set_config('request.jwt.claims', '', true);
  execute 'set local role service_role';
  select * into dev from public.capture_auth(tokhash);
  r := r || format('%s device token authenticates', case when dev.household_id = ha then 'PASS' else 'FAIL' end);

  j := public.capture_match(ha, 'AROMA ESPRESSO BAR 0231');
  r := r || format('%s unknown merchant: no exact match, fallback = Other',
    case when j->'exact' = 'null'::jsonb and (j->>'fallback_category_id')::uuid = c_other then 'PASS' else 'FAIL' end);

  j := public.capture_record(jsonb_build_object(
    'device_id', dev.device_id, 'household_id', ha, 'user_id', dev.user_id, 'status', 'pending_review',
    'title', 'Aroma Espresso Bar', 'raw_merchant', 'AROMA ESPRESSO BAR 0231', 'category_id', c_other,
    'amount_minor', 3200, 'currency', 'ILS', 'occurred_at', now(), 'idempotency_key', 'k1',
    'classification', '{"method":"none"}'::jsonb));
  tx1 := (j->>'transaction_id')::uuid;
  j := public.capture_record(jsonb_build_object(
    'device_id', dev.device_id, 'household_id', ha, 'user_id', dev.user_id, 'status', 'pending_review',
    'title', 'Aroma Espresso Bar', 'raw_merchant', 'AROMA ESPRESSO BAR 0231', 'category_id', c_other,
    'amount_minor', 3200, 'currency', 'ILS', 'occurred_at', now(), 'idempotency_key', 'k1'));
  r := r || format('%s repeat capture is deduplicated', case when (j->>'duplicate')::boolean and (j->>'transaction_id')::uuid = tx1 then 'PASS' else 'FAIL' end);

  j := public.capture_confirm(dev.device_id, ha, tx1, null, 'Coffee', 'Aroma');
  select budget_acknowledged, created_via into ok, code from public.categories where household_id = ha and name = 'Coffee';
  r := r || format('%s new category from the Shortcut: created, flagged No budget',
    case when (j->>'created_category')::boolean and ok = false and code = 'shortcut' then 'PASS' else 'FAIL' end);

  j := public.capture_match(ha, 'AROMA ESPRESSO BAR 0877');
  r := r || format('%s other branch of the same merchant is now an exact match (%s)',
    case when j->'exact'->>'display_name' = 'Aroma' then 'PASS' else 'FAIL' end, j->'exact'->>'display_name');

  j := public.capture_record(jsonb_build_object(
    'device_id', dev.device_id, 'household_id', ha, 'user_id', dev.user_id, 'status', 'pending_review',
    'title', 'Cafe Cafe', 'raw_merchant', 'CAFE CAFE', 'category_id', c_other,
    'amount_minor', 4100, 'currency', 'ILS', 'occurred_at', now(), 'idempotency_key', 'k2'));
  tx_prev := (j->>'transaction_id')::uuid;
  execute 'reset role';

  -- in-app review path: same learning, actor = user
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.review_transaction(tx_prev, 'coffee', null, 'Cafe Cafe');
  execute 'reset role';
  select count(*) into n from public.categories where household_id = ha and lower(name) = 'coffee';
  r := r || format('%s in-app review: "coffee" reuses "Coffee" (created %s, count %s)',
    case when not (j->>'created_category')::boolean and n = 1 then 'PASS' else 'FAIL' end, j->>'created_category', n);
  select count(*) into n from public.merchant_aliases where household_id = ha and normalized = 'cafe cafe' and source = 'user';
  r := r || format('%s in-app review teaches the merchant alias (%s)', case when n = 1 then 'PASS' else 'FAIL' end, n);

  select count(*) into n from public.audit_log where household_id = ha and actor_type = 'device';
  r := r || format('%s capture writes are audited as device (%s rows)', case when n > 0 then 'PASS' else 'FAIL' end, n);

  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.revoke_device_token(tok_id);
  execute 'reset role';
  select count(*) into n from public.capture_auth(tokhash);
  r := r || format('%s revoked token no longer authenticates', case when n = 0 then 'PASS' else 'FAIL' end);

  raise exception E'SMOKE REPORT (rolled back)\n%', array_to_string(r, E'\n');
end $$;
