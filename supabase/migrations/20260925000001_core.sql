-- Core: households, members, categories, budgets, audit log.
-- See docs/BLUEPRINT.md §3.3. Money is always bigint minor units.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists pg_net   with schema extensions;
create extension if not exists pg_cron;

-- Internal helpers; not exposed through PostgREST.
create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- anon never touches data: the app always has a session, the Shortcut goes through Edge Functions.
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;
-- app.* functions are private unless granted explicitly (RLS helpers are).
alter default privileges in schema app revoke execute on functions from anon, public;

create table public.households (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(btrim(name)) between 1 and 60),
  base_currency  char(3) not null default 'ILS',
  timezone       text not null default 'Asia/Jerusalem',
  ai_consent_at  timestamptz,
  settings       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create table public.household_members (
  household_id  uuid not null references public.households(id),
  user_id       uuid not null references auth.users(id) on delete cascade,
  display_name  text not null check (length(btrim(display_name)) between 1 and 40),
  joined_at     timestamptz not null default now(),
  removed_at    timestamptz,
  primary key (household_id, user_id)
);
-- H12: one active household per user in the MVP.
create unique index one_active_household_per_user
  on public.household_members (user_id) where removed_at is null;

create table public.household_invites (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id),
  code_hash    text not null unique,
  created_by   uuid references auth.users(id) on delete set null,
  expires_at   timestamptz not null,
  used_by      uuid references auth.users(id) on delete set null,
  used_at      timestamptz
);

create table public.categories (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references public.households(id),
  name                text not null check (length(btrim(name)) between 1 and 30),
  sf_symbol           text not null default 'tag',
  kind                text not null default 'expense' check (kind in ('expense','savings')),
  sort_order          int  not null default 0,
  archived_at         timestamptz,
  created_via         text not null default 'app' check (created_via in ('seed','app','shortcut')),
  -- false for categories created at the register: shows the "No budget" badge until handled.
  budget_acknowledged boolean not null default true,
  -- target of composite FKs, so a row can never point at another household's category.
  unique (id, household_id)
);
create unique index category_name_ci on public.categories (household_id, lower(name));
create unique index one_savings_category on public.categories (household_id) where kind = 'savings';

-- The cap for month M is the row with the greatest effective_month <= M.
-- Changing a cap inserts a new row for the current month; old months keep theirs.
create table public.category_budgets (
  category_id     uuid not null,
  household_id    uuid not null references public.households(id),
  effective_month date not null check (effective_month = date_trunc('month', effective_month)::date),
  cap_minor       bigint not null check (cap_minor >= 0),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (category_id, effective_month),
  foreign key (category_id, household_id) references public.categories (id, household_id)
);

create table public.audit_log (
  id           bigint generated always as identity primary key,
  household_id uuid not null,
  actor_type   text not null check (actor_type in ('user','device','agent','system')),
  actor_id     uuid,
  action       text not null,
  entity       text not null,
  entity_id    uuid,
  before       jsonb,
  after        jsonb,
  at           timestamptz not null default now()
);
create index audit_log_household on public.audit_log (household_id, at desc);

-- ───────── helpers ─────────

create function app.is_member(p_household uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = p_household
      and m.user_id = (select auth.uid())
      and m.removed_at is null
  );
$$;

create function app.current_household() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.household_id from public.household_members m
  where m.user_id = (select auth.uid()) and m.removed_at is null
  limit 1;
$$;

-- H6: month boundaries follow the household's timezone, not UTC.
create function app.local_month(p_household uuid, p_ts timestamptz) returns date
language sql stable set search_path = '' as $$
  select date_trunc('month', p_ts at time zone h.timezone)::date
  from public.households h where h.id = p_household;
$$;

create function app.local_today(p_household uuid) returns date
language sql stable set search_path = '' as $$
  select (now() at time zone h.timezone)::date from public.households h where h.id = p_household;
$$;

create function app.sha256_hex(p text) returns text
language sql immutable set search_path = '' as $$
  select encode(pg_catalog.sha256(convert_to(p, 'UTF8')), 'hex');
$$;

revoke all on all functions in schema app from public, anon;
grant execute on function app.is_member(uuid), app.current_household(), app.local_month(uuid, timestamptz)
  to authenticated, service_role;
