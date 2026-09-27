-- A rule created with a past start date (e.g. "rent since 2024") must not backfill every
-- month at once. Catch-up stays for runs the cron missed after creation (US-R1 AC3).
create or replace function app.recurring_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_next date;
begin
  if (select c.kind from public.categories c where c.id = new.category_id) = 'savings' then
    raise exception 'recurring rules cannot use the Savings category' using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    new.next_run_date := coalesce(new.next_run_date,
      app.first_occurrence(greatest(new.start_date, app.local_today(new.household_id)), new.day_of_month));
  else
    new.updated_at := now();
    if (new.day_of_month, new.interval_months, new.start_date)
       is distinct from (old.day_of_month, old.interval_months, old.start_date) then
      v_next := app.first_occurrence(greatest(new.start_date, app.local_today(new.household_id)), new.day_of_month);
      if exists (select 1 from public.transactions t
                 where t.recurring_rule_id = new.id
                   and date_trunc('month', t.recurring_period) = date_trunc('month', v_next)) then
        v_next := app.next_occurrence(v_next, new.interval_months, new.day_of_month);
      end if;
      new.next_run_date := v_next;
    end if;
  end if;
  return new;
end $$;
