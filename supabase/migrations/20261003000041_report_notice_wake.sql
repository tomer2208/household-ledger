-- Migration 40 woke push-dispatch from a trigger on "update of push_status". A column list
-- counts only the columns an UPDATE names, and push_status is set by the before-trigger when a
-- report's status changes, so the wake never fired and notices waited for the next run. The
-- trigger now runs on every insert and update; app.report_notice_wake already wakes only when
-- a notice has just been queued.
drop trigger report_notice_wake on public.monthly_reports;
create trigger report_notice_wake after insert or update on public.monthly_reports
  for each row execute function app.report_notice_wake();

-- The 5-minute backstop (migration 13) wakes push-dispatch for alerts left queued or stuck; report
-- notices are drained by the same run, so they count too.
create or replace function app.push_backstop() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.budget_alerts where push_status in ('queued', 'sending'))
     or exists (select 1 from public.monthly_reports where push_status in ('queued', 'sending')) then
    perform app.wake('push-dispatch');
  end if;
end $$;
