-- P1-15 (docs/PRODUCT_ROADMAP.md): savings goals ("Vacation ₪12,000 by July").
--
-- A goal earmarks part of the savings balance; money doesn't move anywhere. Its balance is the
-- sum of its moves (savings_goal_moves: + set aside, − released), so every change has a row,
-- like the savings ledger itself. What is earmarked across open goals can't be more than the
-- balance when setting money aside; a withdrawal from savings is real spending and is never
-- blocked, so "free" can go below zero, and the app says so.
-- list_goals() works out each goal's progress: for a goal with a month, what to set aside each
-- month from now to reach it, and how far behind an even plan from when it was created it is.
-- Closing a goal releases what it holds back to free savings. Writes go through the functions.

create table public.savings_goals (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id),
  name          text not null check (length(btrim(name)) between 1 and 40),
  sf_symbol     text not null default 'star',
  target_minor  bigint not null check (target_minor > 0),
  target_month  date check (target_month = date_trunc('month', target_month)::date),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  closed_at     timestamptz,
  unique (id, household_id)
);
create index savings_goals_household on public.savings_goals (household_id) where closed_at is null;

create table public.savings_goal_moves (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id),
  goal_id       uuid not null,
  amount_minor  bigint not null check (amount_minor <> 0),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  foreign key (goal_id, household_id) references public.savings_goals (id, household_id)
);
create index savings_goal_moves_goal on public.savings_goal_moves (goal_id);
create index savings_goal_moves_household on public.savings_goal_moves (household_id);

alter table public.savings_goals enable row level security;
alter table public.savings_goal_moves enable row level security;
create policy member_select on public.savings_goals for select to authenticated using (app.is_member(household_id));
create policy member_select on public.savings_goal_moves for select to authenticated using (app.is_member(household_id));
revoke insert, update, delete on public.savings_goals, public.savings_goal_moves from authenticated, anon;

create trigger audit after insert or update or delete on public.savings_goals
  for each row execute function app.audit();
create trigger audit after insert or update or delete on public.savings_goal_moves
  for each row execute function app.audit();
alter publication supabase_realtime add table public.savings_goals, public.savings_goal_moves;

-- Account deletion takes goals with it (before the household row).
create or replace function app.purge_household(p_household uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.savings_goal_moves where household_id = p_household;
  delete from public.savings_goals      where household_id = p_household;
  delete from public.savings_ledger     where household_id = p_household;
  delete from public.budget_alerts      where household_id = p_household;
  delete from public.month_closes       where household_id = p_household; -- unlocks category_budgets, household_income
  delete from public.monthly_reports    where household_id = p_household;
  delete from public.agent_proposals    where household_id = p_household;
  delete from public.agent_runs         where household_id = p_household;
  delete from app.advisor_dismissals    where household_id = p_household;
  delete from public.transactions       where household_id = p_household;
  delete from public.recurring_rules    where household_id = p_household;
  delete from public.merchant_aliases   where household_id = p_household;
  delete from public.merchants          where household_id = p_household;
  delete from public.category_budgets   where household_id = p_household;
  delete from public.household_income   where household_id = p_household;
  delete from public.categories         where household_id = p_household;
  delete from public.device_tokens      where household_id = p_household;
  delete from public.household_invites  where household_id = p_household;
  delete from public.household_members  where household_id = p_household;
  delete from public.households         where id = p_household;
  -- Last, because every delete above wrote an audit row.
  delete from public.audit_log          where household_id = p_household;
end $$;
revoke execute on function app.purge_household(uuid) from public, anon, authenticated;

-- What open goals hold, together.
create function app.goals_allocated(p_household uuid) returns bigint
language sql stable set search_path = '' as $$
  select coalesce(sum(m.amount_minor), 0)::bigint
  from public.savings_goal_moves m join public.savings_goals g on g.id = m.goal_id
  where m.household_id = p_household and g.closed_at is null;
$$;

create function app.check_goal(p_name text, p_target bigint, p_month date) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_name is null or length(btrim(p_name)) not between 1 and 40 then
    raise exception 'goal names are 1 to 40 characters' using errcode = '22023';
  end if;
  if p_target is null or p_target <= 0 then
    raise exception 'a goal needs an amount above zero' using errcode = '22023';
  end if;
end $$;

create function public.list_goals() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
  v_now date := app.local_month(v_household, now());
  v_balance bigint := app.savings_balance(v_household);
  v_allocated bigint := app.goals_allocated(v_household);
begin
  return jsonb_build_object(
    'balance', v_balance,
    'allocated', v_allocated,
    'free', v_balance - v_allocated,
    'goals', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', g.id, 'name', g.name, 'sf_symbol', g.sf_symbol,
          'target_minor', g.target_minor,
          'target_month', to_char(g.target_month, 'YYYY-MM-DD'),
          'saved', x.saved,
          'done', x.saved >= g.target_minor,
          -- months still to go, this one included (0 once the month has passed)
          'months_left', x.left_months,
          'monthly_needed', case
            when g.target_month is null or x.saved >= g.target_minor then null
            else ceil((g.target_minor - x.saved)::numeric / greatest(x.left_months, 1))::bigint end,
          -- an even plan from the month it was created: what should be set aside by this month's end
          'behind_by', case
            when g.target_month is null or x.saved >= g.target_minor then 0
            else greatest(0, round(g.target_minor * least(1, x.elapsed::numeric / greatest(x.plan_months, 1)))::bigint - x.saved) end
        ) order by g.target_month nulls last, g.created_at)
      from public.savings_goals g
      cross join lateral (
        select coalesce((select sum(m.amount_minor) from public.savings_goal_moves m where m.goal_id = g.id), 0)::bigint as saved,
               greatest(0, app.month_diff(v_now, g.target_month) + 1) as left_months,
               app.month_diff(app.local_month(v_household, g.created_at), g.target_month) + 1 as plan_months,
               app.month_diff(app.local_month(v_household, g.created_at), v_now) + 1 as elapsed
      ) x
      where g.household_id = v_household and g.closed_at is null), '[]'::jsonb)
  );
end $$;

-- Whole months from a to b (b - a), on 1sts of months; null when b is null.
create function app.month_diff(a date, b date) returns int
language sql immutable set search_path = '' as $$
  select (extract(year from b) * 12 + extract(month from b) - extract(year from a) * 12 - extract(month from a))::int
$$;

create function public.save_goal(p_id uuid, p_name text, p_symbol text, p_target_minor bigint, p_target_month date)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
  v_month date := date_trunc('month', p_target_month)::date;
  v_id uuid := p_id;
begin
  perform app.check_goal(p_name, p_target_minor, v_month);
  perform set_config('app.actor_type', 'user', true);
  if v_id is null then
    insert into public.savings_goals (household_id, name, sf_symbol, target_minor, target_month, created_by)
    values (v_household, btrim(p_name), coalesce(nullif(btrim(p_symbol), ''), 'star'), p_target_minor, v_month, auth.uid())
    returning id into v_id;
  else
    update public.savings_goals
    set name = btrim(p_name), sf_symbol = coalesce(nullif(btrim(p_symbol), ''), sf_symbol),
        target_minor = p_target_minor, target_month = v_month
    where id = v_id and household_id = v_household and closed_at is null;
    if not found then
      raise exception 'unknown goal' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end $$;

-- + sets money aside for the goal, − releases it back to free savings.
create function public.move_goal(p_id uuid, p_amount_minor bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
  v_saved bigint;
  v_free bigint;
begin
  if p_amount_minor is null or p_amount_minor = 0 then
    raise exception 'the amount must not be zero' using errcode = '22023';
  end if;
  -- one goal move at a time per household, so two phones can't both spend the same free money
  perform 1 from public.households h where h.id = v_household for update;
  if not exists (select 1 from public.savings_goals g where g.id = p_id and g.household_id = v_household and g.closed_at is null) then
    raise exception 'unknown goal' using errcode = 'P0002';
  end if;
  v_saved := coalesce((select sum(m.amount_minor) from public.savings_goal_moves m where m.goal_id = p_id), 0);
  v_free := app.savings_balance(v_household) - app.goals_allocated(v_household);
  if p_amount_minor > 0 and p_amount_minor > v_free then
    raise exception 'not enough free savings for that' using errcode = '22023';
  end if;
  if p_amount_minor < 0 and -p_amount_minor > v_saved then
    raise exception 'the goal holds less than that' using errcode = '22023';
  end if;
  perform set_config('app.actor_type', 'user', true);
  insert into public.savings_goal_moves (household_id, goal_id, amount_minor, created_by)
  values (v_household, p_id, p_amount_minor, auth.uid());
  return jsonb_build_object('saved', v_saved + p_amount_minor, 'free', v_free - p_amount_minor);
end $$;

-- Closes a goal (reached, or given up); what it held goes back to free savings.
create function public.close_goal(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
  v_saved bigint;
begin
  perform set_config('app.actor_type', 'user', true);
  update public.savings_goals set closed_at = now()
  where id = p_id and household_id = v_household and closed_at is null;
  if not found then
    raise exception 'unknown goal' using errcode = 'P0002';
  end if;
  v_saved := coalesce((select sum(m.amount_minor) from public.savings_goal_moves m where m.goal_id = p_id), 0);
  if v_saved <> 0 then
    insert into public.savings_goal_moves (household_id, goal_id, amount_minor, created_by)
    values (v_household, p_id, -v_saved, auth.uid());
  end if;
end $$;

revoke execute on function app.goals_allocated(uuid), app.check_goal(text, bigint, date), app.month_diff(date, date)
  from public, anon, authenticated;
revoke execute on function public.list_goals(), public.save_goal(uuid, text, text, bigint, date),
  public.move_goal(uuid, bigint), public.close_goal(uuid) from public, anon;
grant execute on function public.list_goals(), public.save_goal(uuid, text, text, bigint, date),
  public.move_goal(uuid, bigint), public.close_goal(uuid) to authenticated;
