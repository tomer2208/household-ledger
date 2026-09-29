-- R9 (docs/PRODUCT_ROADMAP.md, BLUEPRINT §6 risk table): notice when a Shortcut goes quiet.
--
-- An iOS update, a switched-off automation or a changed Wallet field can stop Apple Pay
-- purchases from being logged, and nothing tells anyone: a failed request shows a
-- notification, an automation that never runs shows nothing. capture_health() says, per active
-- device, whether it has gone quiet compared with its own habit, so the app can say so.
--
-- A capture is a transaction the device inserted (audit_log, actor_type 'device'); last_used_at
-- is not used because the Shortcut's own ▶ test touches it without logging anything.
-- silent: no capture for longer than both 72 hours and 3× the device's median gap between
--         captures over the last 30 days (24 h until it has 3 captures to judge by). A daily
--         shopper is flagged after 3 days, a weekly one only after 3 weeks.
-- setup:  created more than 24 hours ago and has never captured.

create index audit_device_captures on public.audit_log (actor_id, at)
  where actor_type = 'device' and entity = 'transactions' and action = 'insert';

create function public.capture_health() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'device_id', d.id,
             'label', d.label,
             'user_id', d.user_id,
             'created_at', d.created_at,
             'last_capture_at', s.last_at,
             'captures_30d', s.n30,
             'median_gap_hours', round(s.median_gap_h::numeric, 1),
             'silent_hours', case when s.last_at is null then null
                                  else floor(extract(epoch from now() - s.last_at) / 3600)::int end,
             'status', case
               when s.last_at is null then
                 case when d.created_at < now() - interval '24 hours' then 'setup' else 'ok' end
               when now() - s.last_at > greatest(interval '72 hours',
                                                 3 * make_interval(secs => coalesce(s.median_gap_h, 24) * 3600))
                 then 'silent'
               else 'ok' end
           ) order by d.created_at)
    from public.device_tokens d
    cross join lateral (
      select max(a.at) as last_at,
             count(*) filter (where a.at > now() - interval '30 days') as n30,
             (select case when count(*) >= 2 then percentile_cont(0.5) within group (order by g.gap_h) end
              from (select extract(epoch from a2.at - lag(a2.at) over (order by a2.at)) / 3600 as gap_h
                    from public.audit_log a2
                    where a2.actor_type = 'device' and a2.actor_id = d.id
                      and a2.entity = 'transactions' and a2.action = 'insert'
                      and a2.at > now() - interval '30 days') g
              where g.gap_h is not null) as median_gap_h
      from public.audit_log a
      where a.actor_type = 'device' and a.actor_id = d.id
        and a.entity = 'transactions' and a.action = 'insert'
    ) s
    where d.household_id = v_household and d.revoked_at is null
  ), '[]'::jsonb);
end $$;

revoke execute on function public.capture_health() from public, anon;
grant execute on function public.capture_health() to authenticated;
