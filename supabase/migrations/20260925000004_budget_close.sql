-- Budget math, threshold alerts, month close, savings ledger, late adjustments.
-- Every money number the app or the AI shows comes from these functions.

create function app.cap_for(p_category uuid, p_month date) returns bigint
language sql stable set search_path = '' as $$
  select b.cap_minor from public.category_budgets b
  where b.category_id = p_category and b.effective_month <= p_month
  order by b.effective_month desc limit 1;
$$;

-- Every non-deleted transaction counts, including pending_review (at its suggested
-- category) and estimated (at the estimate), so the budget never lags reality.
create function app.spent_for(p_category uuid, p_month date) returns bigint
language sql stable set search_path = '' as $$
  select coalesce(sum(t.amount_base_minor), 0)::bigint from public.transactions t
  where t.category_id = p_category and t.budget_month = p_month and t.deleted_at is null;
$$;

create table public.budget_alerts (
  household_id uuid not null references public.households(id),
  category_id  uuid not null references public.categories(id),
  budget_month date not null,
  threshold    smallint not null check (threshold in (90,100)),
  spent_minor  bigint not null,
  cap_minor    bigint not null,
  fired_at     timestamptz not null default now(),
  push_status  text not null default 'queued' check (push_status in ('queued','sent','suppressed','failed')),
  primary key (category_id, budget_month, threshold)   -- "once per category per month"
);
create index budget_alerts_household on public.budget_alerts (household_id, budget_month);

create table public.month_closes (
  household_id      uuid not null references public.households(id),
  budget_month      date not null,
  total_cap_minor   bigint not null,
  total_spent_minor bigint not null,
  net_minor         bigint not null,
  snapshot          jsonb not null,
  closed_at         timestamptz not null default now(),
  primary key (household_id, budget_month)
);

create table public.savings_ledger (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id),
  entry_type     text not null check (entry_type in ('month_close','late_adjustment','manual')),
  budget_month   date not null,
  amount_minor   bigint not null,
  reason         text not null,
  transaction_id uuid references public.transactions(id),
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create unique index one_close_entry on public.savings_ledger (household_id, budget_month)
  where entry_type = 'month_close';
create index savings_ledger_household on public.savings_ledger (household_id, created_at);

create function app.is_month_closed(p_household uuid, p_month date) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.month_closes c
                 where c.household_id = p_household and c.budget_month = p_month);
$$;

-- ───────── alerts ─────────

-- Inserts every threshold the category has crossed this month. The primary key turns
-- repeat crossings into no-ops; H7 (skip 90 when 100 fired together) is push-dispatch's job.
create function app.check_budget(p_category uuid, p_month date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid;
  v_cap   bigint;
  v_spent bigint;
begin
  select c.household_id into v_household
  from public.categories c where c.id = p_category and c.kind = 'expense';
  if v_household is null then return; end if;

  -- H8: only the running month alerts
  if p_month <> app.local_month(v_household, now()) then return; end if;

  v_cap := coalesce(app.cap_for(p_category, p_month), 0);
  if v_cap = 0 then return; end if;

  v_spent := app.spent_for(p_category, p_month);

  insert into public.budget_alerts (household_id, category_id, budget_month, threshold, spent_minor, cap_minor)
  select v_household, p_category, p_month, t, v_spent, v_cap
  from unnest(array[90, 100]) as t
  where v_spent * 100 >= v_cap * t
  on conflict do nothing;
end $$;

-- ───────── close ─────────

-- Net offset (Batch 2): net = Σ caps − Σ spent over all expense categories, so an overrun
-- in one category is covered by what was left in another. H3: no cap counts as 0.
create function app.close_month(p_household uuid, p_month date) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_snapshot jsonb;
  v_cap   bigint;
  v_spent bigint;
  v_net   bigint;
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

  return v_net;
end $$;

-- Budgets of closed months are frozen; a new cap is a new row for the current month.
create function app.category_budgets_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_last date;
begin
  select max(c.budget_month) into v_last from public.month_closes c
  where c.household_id = coalesce(new.household_id, old.household_id);
  if v_last is not null then
    if tg_op in ('UPDATE','DELETE') and old.effective_month <= v_last then
      raise exception 'budgets of closed months are locked' using errcode = 'check_violation';
    end if;
    if tg_op in ('INSERT','UPDATE') and new.effective_month <= v_last then
      raise exception 'budgets of closed months are locked' using errcode = 'check_violation';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger category_budgets_guard before insert or update or delete on public.category_budgets
  for each row execute function app.category_budgets_guard();

-- ───────── after-write on transactions ─────────

create function app.tx_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_month date;
  v_delta bigint;
begin
  if new.deleted_at is null then
    perform app.check_budget(new.category_id, new.budget_month);
  end if;

  -- US-B2: a change that lands in a closed month moves the savings ledger by the delta.
  for v_month in
    select distinct m from unnest(array[case when tg_op = 'UPDATE' then old.budget_month end,
                                        new.budget_month]) as m
    where m is not null
  loop
    if app.is_month_closed(new.household_id, v_month) then
      v_delta :=
          (case when new.deleted_at is null and new.budget_month = v_month then new.amount_base_minor else 0 end)
        - (case when tg_op = 'UPDATE' and old.deleted_at is null and old.budget_month = v_month
                then old.amount_base_minor else 0 end);
      if v_delta <> 0 then
        insert into public.savings_ledger (household_id, entry_type, budget_month, amount_minor, reason, transaction_id)
        values (new.household_id, 'late_adjustment', v_month, -v_delta,
                'Late change: ' || new.title, new.id);
      end if;
    end if;
  end loop;

  return null;
end $$;

create trigger tx_after_write after insert or update on public.transactions
  for each row execute function app.tx_after_write();

create function app.savings_balance(p_household uuid) returns bigint
language sql stable set search_path = '' as $$
  select coalesce(sum(s.amount_minor), 0)::bigint from public.savings_ledger s
  where s.household_id = p_household;
$$;
