-- Monthly household income: the pool every category budget is carved out of.
-- Zero-based: income − Σ caps is what's still unassigned; anything left unassigned is,
-- in effect, planned savings. Versioned like category_budgets so past months keep the
-- income they were planned against.

create table public.household_income (
  household_id    uuid not null references public.households(id),
  effective_month date not null check (effective_month = date_trunc('month', effective_month)::date),
  amount_minor    bigint not null check (amount_minor >= 0),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (household_id, effective_month)
);

alter table public.household_income enable row level security;
revoke all on public.household_income from anon;
-- Written only through set_monthly_income(), so the month is always the household's current one.
revoke insert, update, delete, truncate, references, trigger on public.household_income from authenticated;
grant select on public.household_income to authenticated;
create policy member_select on public.household_income for select to authenticated
  using (app.is_member(household_id));

-- Income of closed months is frozen, same rule as budgets.
create function app.household_income_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_last date;
begin
  select max(c.budget_month) into v_last from public.month_closes c
  where c.household_id = coalesce(new.household_id, old.household_id);
  if v_last is not null and coalesce(new.effective_month, old.effective_month) <= v_last then
    raise exception 'income of closed months is locked' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;

create trigger household_income_guard before insert or update on public.household_income
  for each row execute function app.household_income_guard();

create trigger audit after insert or update or delete on public.household_income
  for each row execute function app.audit();

-- The income for month M is the row with the greatest effective_month <= M. 0 means "not set".
create function app.income_for(p_household uuid, p_month date) returns bigint
language sql stable set search_path = '' as $$
  select nullif(i.amount_minor, 0) from public.household_income i
  where i.household_id = p_household and i.effective_month <= p_month
  order by i.effective_month desc limit 1;
$$;

-- Changing income never rewrites the past: it writes the row for the current month.
-- 0 clears it (budgets go back to standing on their own).
create function public.set_monthly_income(p_amount_minor bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
  v_month date := app.local_month(v_household, now());
begin
  if p_amount_minor is null or p_amount_minor < 0 then
    raise exception 'income must be zero or more' using errcode = '22023';
  end if;
  insert into public.household_income (household_id, effective_month, amount_minor, created_by)
  values (v_household, v_month, p_amount_minor, auth.uid())
  on conflict (household_id, effective_month) do update
    set amount_minor = excluded.amount_minor, created_by = excluded.created_by, created_at = now();
end $$;

revoke execute on function public.set_monthly_income(bigint) from public, anon;
grant execute on function public.set_monthly_income(bigint) to authenticated;

-- month_overview gains 'income' (null when not set) and 'unassigned' = income − Σ caps
-- (negative when budgets promise more than comes in).
create or replace function public.month_overview(p_month date default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
  v_month date := coalesce(date_trunc('month', p_month)::date, app.local_month(v_household, now()));
  v_income bigint := app.income_for(v_household, v_month);
  v_result jsonb;
begin
  with cats as (
    select c.id, c.name, c.sf_symbol, c.sort_order, c.budget_acknowledged,
           app.cap_for(c.id, v_month) as cap,
           app.spent_for(c.id, v_month) as spent
    from public.categories c
    where c.household_id = v_household and c.kind = 'expense'
      and (c.archived_at is null or app.spent_for(c.id, v_month) <> 0)
  )
  select jsonb_build_object(
    'month', to_char(v_month, 'YYYY-MM-DD'),
    'closed', app.is_month_closed(v_household, v_month),
    'currency', (select h.base_currency from public.households h where h.id = v_household),
    'income', v_income,
    'unassigned', v_income - coalesce(sum(coalesce(cap, 0)), 0),
    'total_cap', coalesce(sum(coalesce(cap, 0)), 0),
    'total_spent', coalesce(sum(spent), 0),
    'net', coalesce(sum(coalesce(cap, 0)), 0) - coalesce(sum(spent), 0),
    'savings_balance', app.savings_balance(v_household),
    'pending_review', (select count(*) from public.transactions t
                       where t.household_id = v_household and t.status = 'pending_review' and t.deleted_at is null),
    'categories', coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'sf_symbol', sf_symbol,
        'cap', cap, 'spent', spent,
        'pct', case when coalesce(cap, 0) > 0 then round(spent * 100.0 / cap) end,
        'no_budget', cap is null and not budget_acknowledged
      ) order by sort_order, name), '[]'::jsonb)
  ) into v_result
  from cats;
  return v_result;
end $$;

-- ───────── month close ─────────

-- Unassigned income is savings too. Month close already moves Σ caps − Σ spent (what the
-- budgets didn't use); with income set it also moves income − Σ caps (what was never put
-- in a budget, negative when over-assigned). Together: savings grow by income − spent.
alter table public.savings_ledger drop constraint savings_ledger_entry_type_check;
alter table public.savings_ledger add constraint savings_ledger_entry_type_check
  check (entry_type in ('month_close','late_adjustment','manual','unassigned_income'));
create unique index one_unassigned_entry on public.savings_ledger (household_id, budget_month)
  where entry_type = 'unassigned_income';

create or replace function app.close_month(p_household uuid, p_month date) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_snapshot jsonb;
  v_cap   bigint;
  v_spent bigint;
  v_net   bigint;
  v_income bigint;
  v_inserted boolean;
begin
  with cats as (
    select c.id, c.name,
           case when c.archived_at is not null and c.archived_at < p_month then 0
                else coalesce(app.cap_for(c.id, p_month), 0) end as cap,
           app.spent_for(c.id, p_month) as spent
    from public.categories c
    where c.household_id = p_household and c.kind = 'expense'
  )
  select coalesce(jsonb_agg(jsonb_build_object('category_id', id, 'name', name, 'cap', cap, 'spent', spent)
                            order by name) filter (where cap <> 0 or spent <> 0), '[]'::jsonb),
         coalesce(sum(cap), 0)::bigint, coalesce(sum(spent), 0)::bigint
  into v_snapshot, v_cap, v_spent
  from cats;

  v_net := v_cap - v_spent;

  insert into public.month_closes (household_id, budget_month, total_cap_minor, total_spent_minor, net_minor, snapshot)
  values (p_household, p_month, v_cap, v_spent, v_net, v_snapshot)
  on conflict do nothing
  returning true into v_inserted;

  if not coalesce(v_inserted, false) then
    return null;  -- already closed: idempotent
  end if;

  insert into public.savings_ledger (household_id, entry_type, budget_month, amount_minor, reason)
  values (p_household, 'month_close', p_month, v_net, 'Month close ' || to_char(p_month, 'YYYY-MM'));

  v_income := app.income_for(p_household, p_month);
  if v_income is not null and v_income <> v_cap then
    insert into public.savings_ledger (household_id, entry_type, budget_month, amount_minor, reason)
    values (p_household, 'unassigned_income', p_month, v_income - v_cap,
            'Unassigned income ' || to_char(p_month, 'YYYY-MM'));
  end if;

  return v_net;
end $$;

-- Account deletion must take income rows with it.
create or replace function app.purge_household(p_household uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
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

-- The partner sees a change to income at once, like any budget change.
alter publication supabase_realtime add table public.household_income;
