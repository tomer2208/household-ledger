-- Hardening next to R6: the nightly job runs as the cron owner, so nobody else needs EXECUTE.
-- (Functions get EXECUTE for PUBLIC by default; the app schema isn't exposed through the API,
-- so this closes a door no one could reach, rather than one that was open.)
revoke execute on function app.daily_maintenance() from public, anon, authenticated;
