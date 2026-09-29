-- Checks for migration 23 (R6): a household whose month close fails doesn't stop the others.
-- One block, ends by raising TEST_ROLLBACK with its findings, so nothing is kept (including the
-- test trigger). Makes its own two households; needs no fixture.
-- Expect: run1_failures>=1 a_closed=t b_closed=f b_failure_logged=1 b_recurring_kept=1
--         run2_b_closed=t b_failure_resolved=t b_report_queued=t
do $$
declare
  a uuid; b uuid; b_cat uuid; prev date; r1 jsonb; r2 jsonb;
  a_closed boolean; b_closed boolean; b_fail int; b_rec int; b_closed2 boolean; b_resolved boolean; b_report boolean;
begin
  insert into public.households (name, base_currency, timezone, created_at)
  values ('T Iso A', 'ILS', 'Asia/Jerusalem', now() - interval '40 days') returning id into a;
  insert into public.households (name, base_currency, timezone, created_at)
  values ('T Iso B', 'ILS', 'Asia/Jerusalem', now() - interval '40 days') returning id into b;
  prev := (date_trunc('month', now() at time zone 'Asia/Jerusalem') - interval '1 month')::date;

  -- B has a standing order due today: it must be posted even though B's close fails.
  insert into public.categories (household_id, name, sf_symbol, kind) values (b, 'T Rent', 'house', 'expense') returning id into b_cat;
  insert into public.recurring_rules (household_id, title, category_id, amount_minor, currency, amount_kind,
                                      interval_months, day_of_month, start_date)
  values (b, 'T Rent', b_cat, 100000, 'ILS', 'fixed', 1,
          extract(day from now() at time zone 'Asia/Jerusalem')::int, (now() at time zone 'Asia/Jerusalem')::date);

  -- Make B's month close fail.
  create function pg_temp.fail_b() returns trigger language plpgsql as $f$
  begin
    if new.household_id = (select id from public.households where name = 'T Iso B') then
      raise exception 'simulated close failure';
    end if;
    return new;
  end $f$;
  create trigger t_fail_b before insert on public.month_closes for each row execute function pg_temp.fail_b();

  r1 := app.daily_maintenance();
  a_closed := exists (select 1 from public.month_closes where household_id = a and budget_month = prev);
  b_closed := exists (select 1 from public.month_closes where household_id = b and budget_month = prev);
  select count(*) into b_fail from app.maintenance_failures
    where household_id = b and step = 'close' and budget_month = prev and resolved_at is null and error like '%simulated%';
  select count(*) into b_rec from public.transactions where household_id = b and source = 'recurring';

  -- The problem is fixed; the next night's run closes B and resolves its failure.
  drop trigger t_fail_b on public.month_closes;
  r2 := app.daily_maintenance();
  b_closed2 := exists (select 1 from public.month_closes where household_id = b and budget_month = prev);
  b_resolved := exists (select 1 from app.maintenance_failures where household_id = b and step = 'close' and resolved_at is not null);
  b_report := exists (select 1 from public.monthly_reports where household_id = b and budget_month = prev);

  raise exception 'TEST_ROLLBACK run1_failures=% a_closed=% b_closed=% b_failure_logged=% b_recurring_kept=% run2_b_closed=% b_failure_resolved=% b_report_queued=% run1=% run2=%',
    r1->>'failures', a_closed, b_closed, b_fail, b_rec, b_closed2, b_resolved, b_report, r1, r2;
end $$;
