-- G6: a monthly AI spending cap per household, so a public app can't run up an unbounded
-- Anthropic bill. Past the cap every agent takes its built-in (non-AI) path until the
-- month turns, exactly as when AI is switched off.
--
-- Cost is estimated from agent_runs tokens × list prices below. Prices are per million
-- tokens in USD; verify them against the Anthropic pricing page when models change (E4).

create table app.ai_model_prices (
  model              text primary key,
  input_usd_per_mtok  numeric not null,
  output_usd_per_mtok numeric not null
);
insert into app.ai_model_prices values
  ('claude-haiku-4-5', 1, 5),
  ('claude-sonnet-5',  3, 15);

-- Operator-only overrides (not in households.settings: members can write that column).
create table app.household_ai_caps (
  household_id uuid primary key references public.households(id) on delete cascade,
  cap_usd      numeric not null check (cap_usd >= 0)
);

insert into app.config (key, value) values ('ai_monthly_cap_usd', '1.00')
on conflict (key) do nothing;

-- This household's AI cost so far in its local month, and its cap.
create function app.ai_usage(p_household uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'cost_usd', coalesce(round(sum(
        coalesce(r.input_tokens, 0)  * p.input_usd_per_mtok  / 1e6 +
        coalesce(r.output_tokens, 0) * p.output_usd_per_mtok / 1e6), 4), 0),
    'cap_usd', coalesce(
        (select c.cap_usd from app.household_ai_caps c where c.household_id = p_household),
        (select value::numeric from app.config where key = 'ai_monthly_cap_usd'),
        1))
  from public.agent_runs r
  left join app.ai_model_prices p on p.model = r.model
  where r.household_id = p_household
    and r.created_at >= (date_trunc('month', now() at time zone
          (select h.timezone from public.households h where h.id = p_household))
        at time zone (select h.timezone from public.households h where h.id = p_household))
$$;
revoke execute on function app.ai_usage(uuid) from public, anon, authenticated;

-- For the edge functions: may this household make another AI call this month?
create function public.ai_under_cap(p_household uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (u->>'cost_usd')::numeric < (u->>'cap_usd')::numeric from (select app.ai_usage(p_household) u) x
$$;
revoke execute on function public.ai_under_cap(uuid) from public, anon, authenticated;
grant execute on function public.ai_under_cap(uuid) to service_role;

-- For the AI Activity screen: the member's own household only.
create function public.my_ai_usage() returns jsonb
language sql stable security definer set search_path = '' as $$
  select app.ai_usage(app.require_household())
$$;
revoke execute on function public.my_ai_usage() from public, anon;
grant execute on function public.my_ai_usage() to authenticated;
