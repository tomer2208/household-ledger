-- RPCs the app calls (authenticated). Each one checks the caller itself.

-- H11: the base currency is fixed once money has been recorded against it.
create function app.households_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.base_currency is distinct from old.base_currency
     and exists (select 1 from public.transactions t where t.household_id = old.id) then
    raise exception 'base currency is locked after the first transaction' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger households_guard before update on public.households
  for each row execute function app.households_guard();

create function app.require_household() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v uuid := app.current_household();
begin
  if v is null then
    raise exception 'not a member of any household' using errcode = '42501';
  end if;
  return v;
end $$;

-- Readable invite code alphabet: no 0/O/1/I.
create function app.random_code(p_len int) returns text
language sql volatile set search_path = '' as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (get_byte(b, i) % 32) + 1, 1), '')
  from (select extensions.gen_random_bytes(p_len) as b) r, generate_series(0, p_len - 1) as i;
$$;

create function public.create_household(p_name text, p_base_currency text, p_display_name text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if app.current_household() is not null then
    raise exception 'already a member of a household' using errcode = 'unique_violation';
  end if;

  insert into public.households (name, base_currency)
  values (btrim(p_name), upper(coalesce(nullif(btrim(p_base_currency), ''), 'ILS')))
  returning id into v_id;

  insert into public.household_members (household_id, user_id, display_name)
  values (v_id, auth.uid(), btrim(p_display_name));

  insert into public.categories (household_id, name, sf_symbol, kind, sort_order, created_via)
  select v_id, c.name, c.symbol, c.kind, c.ord, 'seed'
  from (values
    ('Groceries','cart','expense',1), ('Dining','fork.knife','expense',2),
    ('Transport','car','expense',3), ('Fuel','fuelpump','expense',4),
    ('Housing','house','expense',5), ('Utilities','bolt','expense',6),
    ('Health','cross.case','expense',7), ('Kids','figure.and.child.holdinghands','expense',8),
    ('Shopping','bag','expense',9), ('Entertainment','popcorn','expense',10),
    ('Subscriptions','arrow.triangle.2.circlepath','expense',11), ('Travel','airplane','expense',12),
    ('Gifts','gift','expense',13), ('Education','graduationcap','expense',14),
    ('Other','ellipsis.circle','expense',99), ('Savings','banknote','savings',100)
  ) as c(name, symbol, kind, ord);

  return v_id;
end $$;

create function public.create_invite() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
  v_code text := app.random_code(8);
begin
  insert into public.household_invites (household_id, code_hash, created_by, expires_at)
  values (v_household, app.sha256_hex(v_code), auth.uid(), now() + interval '72 hours');
  return substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4);
end $$;

create function public.join_household(p_code text, p_display_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_invite public.household_invites;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if app.current_household() is not null then
    raise exception 'already a member of a household' using errcode = 'unique_violation';
  end if;

  select * into v_invite from public.household_invites i
  where i.code_hash = app.sha256_hex(upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g')))
    and i.used_at is null and i.expires_at > now()
  for update;
  if not found then
    raise exception 'invalid or expired invite code' using errcode = 'P0002';
  end if;

  insert into public.household_members (household_id, user_id, display_name)
  values (v_invite.household_id, auth.uid(), btrim(p_display_name))
  on conflict (household_id, user_id) do update set removed_at = null, display_name = excluded.display_name;

  update public.household_invites set used_by = auth.uid(), used_at = now() where id = v_invite.id;
  return v_invite.household_id;
end $$;

-- Returns the plaintext token exactly once (US-C5 AC3).
create function public.create_device_token(p_label text)
returns table (id uuid, token text)
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
  v_token text := 'hl_dev_' || encode(extensions.gen_random_bytes(24), 'hex');
  v_id uuid;
begin
  insert into public.device_tokens (household_id, user_id, label, token_hash)
  values (v_household, auth.uid(), btrim(p_label), app.sha256_hex(v_token))
  returning device_tokens.id into v_id;
  return query select v_id, v_token;
end $$;

create function public.revoke_device_token(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.device_tokens set revoked_at = now()
  where id = p_id and household_id = app.require_household() and revoked_at is null;
end $$;

-- Changing a cap never rewrites the past: it writes the row for the current month.
create function public.set_category_budget(p_category_id uuid, p_cap_minor bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
  v_month date := app.local_month(v_household, now());
begin
  if not exists (select 1 from public.categories c
                 where c.id = p_category_id and c.household_id = v_household and c.kind = 'expense') then
    raise exception 'unknown category' using errcode = 'P0002';
  end if;
  insert into public.category_budgets (category_id, household_id, effective_month, cap_minor, created_by)
  values (p_category_id, v_household, v_month, p_cap_minor, auth.uid())
  on conflict (category_id, effective_month) do update set cap_minor = excluded.cap_minor;
  update public.categories set budget_acknowledged = true where id = p_category_id;
end $$;

create function public.add_savings_entry(p_amount_minor bigint, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
  v_id uuid;
begin
  if p_amount_minor = 0 or length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'amount and reason are required' using errcode = '22023';
  end if;
  insert into public.savings_ledger (household_id, entry_type, budget_month, amount_minor, reason, created_by)
  values (v_household, 'manual', app.local_month(v_household, now()), p_amount_minor, btrim(p_reason), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- One call for the Overview screen: every number already computed in SQL.
create function public.month_overview(p_month date default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
  v_month date := coalesce(date_trunc('month', p_month)::date, app.local_month(v_household, now()));
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

revoke execute on function public.create_household(text, text, text), public.create_invite(),
  public.join_household(text, text), public.create_device_token(text), public.revoke_device_token(uuid),
  public.set_category_budget(uuid, bigint), public.add_savings_entry(bigint, text), public.month_overview(date)
from public, anon;
grant execute on function public.create_household(text, text, text), public.create_invite(),
  public.join_household(text, text), public.create_device_token(text), public.revoke_device_token(uuid),
  public.set_category_budget(uuid, bigint), public.add_savings_entry(bigint, text), public.month_overview(date)
to authenticated;
