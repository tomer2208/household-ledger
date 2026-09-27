-- FX rates, recurring rules, transactions.

-- 1 unit of quote = rate units of base.
create table public.fx_rates (
  rate_date date not null,
  base      char(3) not null,
  quote     char(3) not null,
  rate      numeric(18,8) not null check (rate > 0),
  source    text not null,
  primary key (rate_date, base, quote)
);

-- ───────── recurring ─────────

-- Day 31 in a 30-day month lands on the 30th (US-R1 AC2).
create function app.clamp_day(p_month date, p_day int) returns date
language sql immutable set search_path = '' as $$
  select p_month + (least(p_day,
    extract(day from (date_trunc('month', p_month) + interval '1 month - 1 day'))::int) - 1);
$$;

create function app.first_occurrence(p_from date, p_day int) returns date
language sql immutable set search_path = '' as $$
  select case
    when app.clamp_day(date_trunc('month', p_from)::date, p_day) >= p_from
      then app.clamp_day(date_trunc('month', p_from)::date, p_day)
    else app.clamp_day((date_trunc('month', p_from) + interval '1 month')::date, p_day)
  end;
$$;

create function app.next_occurrence(p_date date, p_interval int, p_day int) returns date
language sql immutable set search_path = '' as $$
  select app.clamp_day((date_trunc('month', p_date) + make_interval(months => p_interval))::date, p_day);
$$;

create table public.recurring_rules (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id),
  title           text not null check (length(btrim(title)) between 1 and 60),
  merchant_id     uuid,
  category_id     uuid not null,
  amount_minor    bigint not null check (amount_minor > 0),
  currency        char(3) not null,
  amount_kind     text not null check (amount_kind in ('fixed','estimated')),
  interval_months smallint not null default 1 check (interval_months in (1,2,3,6,12)),
  day_of_month    smallint not null check (day_of_month between 1 and 31),
  start_date      date not null,
  end_date        date,
  next_run_date   date,               -- filled by trigger
  paused          boolean not null default false,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (id, household_id),
  foreign key (category_id, household_id) references public.categories (id, household_id),
  foreign key (merchant_id, household_id) references public.merchants (id, household_id),
  check (end_date is null or end_date >= start_date)
);

-- ───────── transactions ─────────

create table public.transactions (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households(id),
  created_by         uuid references auth.users(id) on delete set null,
  source             text not null check (source in ('apple_pay','manual','recurring')),
  status             text not null default 'confirmed'
                     check (status in ('confirmed','pending_review','estimated')),
  title              text not null check (length(btrim(title)) between 1 and 80),
  raw_merchant       text,
  merchant_id        uuid,
  category_id        uuid not null,                -- H3: every transaction has a category
  amount_minor       bigint not null check (amount_minor <> 0),   -- < 0 is a refund (H5)
  currency           char(3) not null,
  fx_rate            numeric(18,8) not null default 1,
  fx_source          text not null default 'identity' check (fx_source in ('identity','daily','manual')),
  amount_base_minor  bigint not null default 0,    -- set by trigger, never re-priced
  occurred_at        timestamptz not null default now(),
  budget_month       date not null default '1970-01-01',  -- set by trigger (H6)
  recurring_rule_id  uuid,
  recurring_period   date,
  card_label         text,
  classification     jsonb,
  idempotency_key    text,
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  unique (household_id, idempotency_key),
  unique (recurring_rule_id, recurring_period),
  foreign key (category_id, household_id)       references public.categories (id, household_id),
  foreign key (merchant_id, household_id)       references public.merchants (id, household_id),
  foreign key (recurring_rule_id, household_id) references public.recurring_rules (id, household_id)
);
create index tx_budget   on public.transactions (household_id, budget_month, category_id) where deleted_at is null;
create index tx_merchant on public.transactions (merchant_id, occurred_at desc) where deleted_at is null;
create index tx_recent   on public.transactions (household_id, occurred_at desc) where deleted_at is null;

create function app.tx_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_base char(3);
  v_tz   text;
  v_kind text;
  v_rate numeric;
begin
  select h.base_currency, h.timezone into v_base, v_tz
  from public.households h where h.id = new.household_id;

  select c.kind into v_kind from public.categories c where c.id = new.category_id;
  if v_kind = 'savings' then
    raise exception 'transactions cannot use the Savings category' using errcode = 'check_violation';
  end if;

  new.budget_month := date_trunc('month', new.occurred_at at time zone v_tz)::date;

  if new.currency = v_base then
    new.fx_rate := 1;
    new.fx_source := 'identity';
  elsif new.fx_source = 'manual' then
    if new.fx_rate is null or new.fx_rate <= 0 then
      raise exception 'manual fx_rate must be positive' using errcode = 'check_violation';
    end if;
  elsif tg_op = 'INSERT' or new.currency is distinct from old.currency or old.fx_source = 'identity' then
    select r.rate into v_rate from public.fx_rates r
    where r.base = v_base and r.quote = new.currency
      and r.rate_date <= (new.occurred_at at time zone v_tz)::date
    order by r.rate_date desc limit 1;
    if v_rate is null then
      raise exception 'no exchange rate for % to %', new.currency, v_base
        using errcode = 'P0002', hint = 'send fx_source = manual with fx_rate';
    end if;
    new.fx_rate := v_rate;
    new.fx_source := 'daily';
  end if;
  -- otherwise the rate captured at creation is kept: history is never re-priced (§3.8)

  new.amount_base_minor := round(new.amount_minor * new.fx_rate);
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end $$;

create trigger tx_before_write before insert or update on public.transactions
  for each row execute function app.tx_before_write();

create function app.recurring_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_next date;
begin
  if (select c.kind from public.categories c where c.id = new.category_id) = 'savings' then
    raise exception 'recurring rules cannot use the Savings category' using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    new.next_run_date := coalesce(new.next_run_date, app.first_occurrence(new.start_date, new.day_of_month));
  else
    new.updated_at := now();
    if (new.day_of_month, new.interval_months, new.start_date)
       is distinct from (old.day_of_month, old.interval_months, old.start_date) then
      v_next := app.first_occurrence(greatest(new.start_date, app.local_today(new.household_id)), new.day_of_month);
      -- moving the day inside a month that already has an occurrence must not create a second one
      if exists (select 1 from public.transactions t
                 where t.recurring_rule_id = new.id
                   and date_trunc('month', t.recurring_period) = date_trunc('month', v_next)) then
        v_next := app.next_occurrence(v_next, new.interval_months, new.day_of_month);
      end if;
      new.next_run_date := v_next;
    end if;
  end if;
  return new;
end $$;

create trigger recurring_before_write before insert or update on public.recurring_rules
  for each row execute function app.recurring_before_write();

create function app.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger merchants_touch before update on public.merchants
  for each row execute function app.touch_updated_at();
