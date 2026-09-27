-- G8: fixed-window rate limits for the public capture API. A leaked Shortcut token (or a
-- Shortcut stuck in a loop) can't flood a household or run up AI calls.

create table app.rate_windows (
  key          text not null,
  window_start timestamptz not null,
  hits         int not null default 0,
  primary key (key, window_start)
);

-- Counts one hit for p_key in the current p_window_seconds window; false once p_max is
-- passed. Atomic under concurrency (single upsert).
create function public.rate_hit(p_key text, p_window_seconds int, p_max int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits int;
begin
  insert into app.rate_windows as w (key, window_start, hits) values (p_key, v_start, 1)
  on conflict (key, window_start) do update set hits = w.hits + 1
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;
revoke execute on function public.rate_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_hit(text, int, int) to service_role;

select cron.schedule('rate-windows-cleanup', '17 3 * * *',
  $$delete from app.rate_windows where window_start < now() - interval '2 days'$$);
