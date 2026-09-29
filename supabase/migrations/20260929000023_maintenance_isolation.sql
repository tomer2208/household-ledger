-- R6 (docs/PRODUCT_ROADMAP.md): one household's failure no longer stops the nightly run for all.
--
-- daily_maintenance ran every household in one transaction and only run_recurring caught its
-- own errors. A failing close_month or queue_monthly_report aborted the whole run: no month
-- closed, no report queued, no proposal expired, anywhere, and the same failure every night.
--
-- Now each household's recurring step, and each of its months (close + report together, so a
-- month is never closed without its report), runs in its own block. A failure is recorded in
-- app.maintenance_failures and raised as a WARNING, the rest carries on, and the next night
-- retries it: every step is idempotent. A month that later closes marks its failure resolved.

create table app.maintenance_failures (
  id           bigint generated always as identity primary key,
  household_id uuid references public.households(id) on delete cascade,
  step         text not null check (step in ('recurring','close','expire','advisor')),
  budget_month date,
  error        text not null,
  failed_at    timestamptz not null default now(),
  resolved_at  timestamptz
);
create index maintenance_failures_open on app.maintenance_failures (household_id, step, budget_month)
  where resolved_at is null;
revoke all on app.maintenance_failures from public, anon, authenticated;

create or replace function app.record_maintenance_failure(p_household uuid, p_step text, p_month date, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into app.maintenance_failures (household_id, step, budget_month, error)
  values (p_household, p_step, p_month, left(p_error, 2000));
  raise warning 'daily_maintenance % failed for household % month %: %', p_step, p_household, p_month, p_error;
end $$;
revoke execute on function app.record_maintenance_failure(uuid, text, date, text) from public, anon, authenticated;

create or replace function app.daily_maintenance() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  h record;
  v_today date;
  v_month date;
  v_created int := 0;
  v_closed int := 0;
  v_expired int := 0;
  v_failed int := 0;
begin
  perform set_config('app.actor_type', 'system', true);

  for h in select id, created_at, timezone from public.households where deleted_at is null loop
    -- Recurring first, so the last day's standing orders land before their month closes.
    begin
      v_today := (now() at time zone h.timezone)::date;
      v_created := v_created + app.run_recurring(h.id, v_today);
    exception when others then
      perform app.record_maintenance_failure(h.id, 'recurring', null, sqlerrm);
      v_failed := v_failed + 1;
      -- Without a trustworthy "today" (e.g. a broken timezone) no month can be judged closed.
      continue;
    end;

    for v_month in
      select generate_series(date_trunc('month', h.created_at at time zone h.timezone),
                             date_trunc('month', v_today::timestamp) - interval '1 month',
                             interval '1 month')::date
    loop
      if app.is_month_closed(h.id, v_month) then
        continue;
      end if;
      begin
        perform app.close_month(h.id, v_month);
        perform app.queue_monthly_report(h.id, v_month);
        v_closed := v_closed + 1;
        update app.maintenance_failures set resolved_at = now()
        where household_id = h.id and step = 'close' and budget_month = v_month and resolved_at is null;
      exception when others then
        perform app.record_maintenance_failure(h.id, 'close', v_month, sqlerrm);
        v_failed := v_failed + 1;
      end;
    end loop;
  end loop;

  begin
    update public.agent_proposals set status = 'expired'
    where status = 'pending' and expires_at < now();
    get diagnostics v_expired = row_count;
  exception when others then
    perform app.record_maintenance_failure(null, 'expire', null, sqlerrm);
    v_failed := v_failed + 1;
  end;

  if v_closed > 0 then
    begin
      perform app.wake('advisor-run');
    exception when others then
      perform app.record_maintenance_failure(null, 'advisor', null, sqlerrm);
      v_failed := v_failed + 1;
    end;
  end if;

  return jsonb_build_object('recurring_created', v_created, 'months_closed', v_closed,
                            'proposals_expired', v_expired, 'failures', v_failed);
end $$;
