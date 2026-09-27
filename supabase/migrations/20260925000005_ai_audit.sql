-- AI tables (filled in Phase 4) and the generic audit trigger.

create table public.agent_runs (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid references public.households(id),
  agent         text not null check (agent in ('classifier','monthly_report','advisor')),
  model         text not null,
  status        text not null check (status in ('ok','timeout','error','invalid_output','fallback')),
  input_tokens  int,
  output_tokens int,
  latency_ms    int,
  error         text,
  created_at    timestamptz not null default now()
);
create index agent_runs_household on public.agent_runs (household_id, created_at desc);

create table public.monthly_reports (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id),
  budget_month  date not null,
  metrics       jsonb not null,
  narrative     jsonb,
  status        text not null check (status in ('pending','ready','fallback','failed')),
  agent_run_id  uuid references public.agent_runs(id),
  created_at    timestamptz not null default now(),
  unique (household_id, budget_month)
);

create table public.agent_proposals (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id),
  kind         text not null check (kind in
               ('create_recurring','update_estimate','adjust_budget','recategorize_merchant','flag_duplicate')),
  payload      jsonb not null,
  rationale    jsonb not null,
  dedupe_key   text not null,
  status       text not null default 'pending'
               check (status in ('pending','approved','rejected','expired','failed')),
  agent_run_id uuid references public.agent_runs(id),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '14 days',
  decided_by   uuid references auth.users(id) on delete set null,
  decided_at   timestamptz,
  result       jsonb,
  unique (household_id, dedupe_key)
);

-- ───────── audit ─────────

-- Actor: RPCs acting for a device or the agent set app.actor_type / app.actor_id for the
-- transaction; otherwise a JWT means a user and no JWT means the system (cron).
create function app.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_new  jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old  jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_row  jsonb := coalesce(v_new, v_old);
  v_type text  := nullif(current_setting('app.actor_type', true), '');
  v_id   uuid  := nullif(current_setting('app.actor_id', true), '')::uuid;
  v_action text;
begin
  if v_type is null then
    v_type := case when auth.uid() is not null then 'user' else 'system' end;
  end if;
  v_id := coalesce(v_id, auth.uid());

  -- never copy secrets into the log
  v_new := v_new - 'token_hash' - 'code_hash';
  v_old := v_old - 'token_hash' - 'code_hash';

  v_action := case
    when tg_op = 'INSERT' then 'insert'
    when tg_op = 'DELETE' then 'delete'
    when v_old ? 'deleted_at' and (v_old->>'deleted_at') is null and (v_new->>'deleted_at') is not null then 'soft_delete'
    else 'update' end;

  if tg_op = 'UPDATE' and v_new = v_old then
    return null;
  end if;

  insert into public.audit_log (household_id, actor_type, actor_id, action, entity, entity_id, before, after)
  values (
    coalesce((v_row->>'household_id')::uuid, (v_row->>'id')::uuid),
    v_type, v_id, v_action, tg_table_name,
    case when v_row ? 'id' then (v_row->>'id')::uuid end,
    v_old, v_new
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'households','household_members','categories','category_budgets','merchants','merchant_aliases',
    'recurring_rules','transactions','device_tokens','savings_ledger','agent_proposals'
  ] loop
    execute format('create trigger audit after insert or update or delete on public.%I
                    for each row execute function app.audit()', t);
  end loop;
end $$;
