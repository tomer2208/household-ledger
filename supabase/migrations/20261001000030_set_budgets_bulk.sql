-- P1-7 (docs/PRODUCT_ROADMAP.md): the setup wizard saves the monthly income and every
-- suggested budget in one call, all or nothing. Same rules as set_category_budget and
-- set_monthly_income (current month on, the caller's own household, budget acknowledged),
-- applied to a list; one bad entry rejects the whole call, so setup never ends half-saved.
-- p_budgets: [{"category_id": uuid, "cap_minor": bigint}, ...]; p_income null leaves it alone.

create function public.set_budgets_bulk(p_budgets jsonb, p_income bigint default null) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
  v_month date := app.local_month(v_household, now());
  v_count int;
begin
  if p_budgets is null or jsonb_typeof(p_budgets) <> 'array' then
    raise exception 'budgets must be a list' using errcode = '22023';
  end if;
  if p_income is not null and p_income < 0 then
    raise exception 'income must be zero or more' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_budgets) b
             where jsonb_typeof(b->'cap_minor') <> 'number' or (b->>'cap_minor')::numeric < 0
                or (b->>'cap_minor')::numeric <> trunc((b->>'cap_minor')::numeric)) then
    raise exception 'every budget must be a whole amount of zero or more' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_budgets) b
             left join public.categories c
               on c.id = (b->>'category_id')::uuid and c.household_id = v_household and c.kind = 'expense'
             where c.id is null) then
    raise exception 'unknown category' using errcode = 'P0002';
  end if;
  if (select count(*) <> count(distinct b->>'category_id') from jsonb_array_elements(p_budgets) b) then
    raise exception 'a category appears twice' using errcode = '22023';
  end if;

  insert into public.category_budgets (category_id, household_id, effective_month, cap_minor, created_by)
  select (b->>'category_id')::uuid, v_household, v_month, (b->>'cap_minor')::bigint, auth.uid()
  from jsonb_array_elements(p_budgets) b
  on conflict (category_id, effective_month) do update set cap_minor = excluded.cap_minor;
  get diagnostics v_count = row_count;

  update public.categories set budget_acknowledged = true
  where household_id = v_household
    and id in (select (b->>'category_id')::uuid from jsonb_array_elements(p_budgets) b);

  if p_income is not null then
    insert into public.household_income (household_id, effective_month, amount_minor, created_by)
    values (v_household, v_month, p_income, auth.uid())
    on conflict (household_id, effective_month) do update
      set amount_minor = excluded.amount_minor, created_by = excluded.created_by, created_at = now();
  end if;

  return v_count;
end $$;

revoke execute on function public.set_budgets_bulk(jsonb, bigint) from public, anon;
grant execute on function public.set_budgets_bulk(jsonb, bigint) to authenticated;
