-- Checks for migration 37 (T8 + T9). One block, ends by raising TEST_ROLLBACK with its findings,
-- so nothing is kept. Makes its own user and household.
-- month_overview now adds up a month in one pass; every category it shows must still match
-- app.spent_for and app.cap_for (what it called before), in the current, a past and an empty
-- month, with refunds, an item to review, a deleted expense, a budget changed over time, and
-- archived categories (shown only while they have spend that month).
-- Expect: months_checked=3 mismatches=0 now_spent_total_ok=t archived_with_spend=t archived_without_spend=f
--         deleted_ignored=t empty_month_total=0 indexes=16 tx_recent_gone=t
do $$
declare
  u uuid := gen_random_uuid(); h uuid; cats uuid[]; cur date; m date; o jsonb; e jsonb; ms date[]; os jsonb[] := '{}'; i int;
  bad int := 0; checked int := 0; total_ok boolean; arch_with boolean; arch_without boolean; del_ok boolean; empty_total bigint;
  gone uuid;
begin
  insert into auth.users (id, email, aud, role) values (u, u || '@test.local', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  h := public.create_household('T Perf', 'ILS', 'Me');
  reset role;
  select array_agg(id order by sort_order) into cats from public.categories where household_id = h and kind = 'expense';
  cur := app.local_month(h, now());

  insert into public.transactions (household_id, created_by, source, status, title, category_id, amount_minor, currency, occurred_at)
  select h, u, 'manual', case when g % 17 = 0 then 'pending_review' else 'confirmed' end, 'Shop ' || g,
         cats[1 + g % 6], case when g % 9 = 0 then -(200 + g) else 1000 + g * 13 end, 'ILS',
         now() - make_interval(hours => g * 7)
  from generate_series(1, 400) g;
  -- two per category at this instant, so the current month has spend whatever day CI runs on
  insert into public.transactions (household_id, created_by, source, title, category_id, amount_minor, currency, occurred_at)
  select h, u, 'manual', 'Now ' || n, cats[1 + n % 6], 700 + n, 'ILS', now() from generate_series(0, 11) n;
  update public.transactions set deleted_at = now()
  where id = (select id from public.transactions where household_id = h and category_id = cats[2] and budget_month = cur limit 1)
  returning id into gone;

  insert into public.category_budgets (category_id, household_id, effective_month, cap_minor, created_by)
  select cats[n], h, (cur - interval '6 months')::date, 50000 * n, u from generate_series(1, 4) n;
  insert into public.category_budgets (category_id, household_id, effective_month, cap_minor, created_by)
  values (cats[2], h, cur, 99000, u);
  -- archived: cats[5] keeps its spend, cats[7] never had any
  update public.categories set archived_at = now() where id in (cats[5], cats[7]);

  -- read as the member, check as the owner (app.spent_for and app.cap_for are internal)
  ms := array[cur, (cur - interval '1 month')::date, (cur + interval '2 months')::date];
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  foreach m in array ms loop os := os || public.month_overview(m); end loop;
  reset role;

  for i in 1 .. array_length(ms, 1) loop
    m := ms[i];
    o := os[i];
    checked := checked + 1;
    for e in select * from jsonb_array_elements(o->'categories') loop
      if (e->>'spent')::bigint is distinct from app.spent_for((e->>'id')::uuid, m)
         or (e->>'cap')::bigint is distinct from app.cap_for((e->>'id')::uuid, m) then
        bad := bad + 1;
      end if;
    end loop;
    if m = cur then
      total_ok := (o->>'total_spent')::bigint = (select coalesce(sum(amount_base_minor), 0) from public.transactions
                                                 where household_id = h and budget_month = cur and deleted_at is null);
      arch_with := exists (select 1 from jsonb_array_elements(o->'categories') x where (x->>'id')::uuid = cats[5]);
      arch_without := exists (select 1 from jsonb_array_elements(o->'categories') x where (x->>'id')::uuid = cats[7]);
      del_ok := (select (x->>'spent')::bigint from jsonb_array_elements(o->'categories') x where (x->>'id')::uuid = cats[2])
                = (select coalesce(sum(amount_base_minor), 0) from public.transactions
                   where category_id = cats[2] and budget_month = cur and id <> gone);
    elsif m > cur then
      empty_total := (o->>'total_spent')::bigint;
    end if;
  end loop;

  raise exception 'TEST_ROLLBACK months_checked=% mismatches=% now_spent_total_ok=% archived_with_spend=% archived_without_spend=% deleted_ignored=% empty_month_total=% indexes=% tx_recent_gone=%',
    checked, bad, total_ok, arch_with, arch_without, del_ok, empty_total,
    (select count(*) from pg_indexes where schemaname = 'public' and indexname in (
      'tx_category_month', 'tx_merchant', 'tx_created_by', 'recurring_rules_household', 'recurring_rules_category',
      'recurring_rules_merchant', 'merchants_household', 'merchants_default_category', 'category_budgets_household',
      'device_tokens_household', 'device_tokens_user', 'household_invites_household', 'savings_ledger_transaction',
      'agent_proposals_run', 'monthly_reports_run', 'tx_keyset')),
    not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'tx_recent');
end $$;
