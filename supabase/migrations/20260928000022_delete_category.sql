-- Delete a category from the swipe action (docs/DESIGN_PLAN.md §7).
-- A category nobody ever used is removed together with its budgets. One with history
-- (expenses, recurring rules, merchants, alerts, closed months, AI proposals) is archived
-- instead, so past expenses and reports keep it. Active recurring rules block both: they
-- would keep posting into a category the household can no longer see.
-- p_dry_run reports what would happen, for the confirmation text, without changing anything.

create function public.delete_category(p_category_id uuid, p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
  v_kind text;
  v_tx int;
  v_active_rules int;
  v_history boolean;
  v_last_closed date;
  v_action text;
begin
  select c.kind into v_kind from public.categories c
  where c.id = p_category_id and c.household_id = v_household;
  if not found then
    raise exception 'unknown category' using errcode = 'P0002';
  end if;
  if v_kind = 'savings' then
    raise exception 'the Savings category cannot be deleted' using errcode = '42501';
  end if;

  select count(*) into v_tx from public.transactions t
  where t.category_id = p_category_id and t.deleted_at is null;

  select count(*) into v_active_rules from public.recurring_rules r
  where r.category_id = p_category_id and r.deleted_at is null and not r.paused
    and (r.end_date is null or r.end_date >= current_date);

  select max(m.budget_month) into v_last_closed from public.month_closes m where m.household_id = v_household;

  v_history :=
       exists (select 1 from public.transactions t where t.category_id = p_category_id)
    or exists (select 1 from public.recurring_rules r where r.category_id = p_category_id)
    or exists (select 1 from public.merchants m where m.default_category_id = p_category_id)
    or exists (select 1 from public.budget_alerts a where a.category_id = p_category_id)
    or exists (select 1 from public.category_budgets b
               where b.category_id = p_category_id and b.effective_month <= v_last_closed)
    or exists (select 1 from public.month_closes m, jsonb_array_elements(m.snapshot) e
               where m.household_id = v_household and e->>'category_id' = p_category_id::text)
    or exists (select 1 from public.agent_proposals p
               where p.household_id = v_household and p.payload->>'category_id' = p_category_id::text);

  v_action := case when v_active_rules > 0 then 'blocked' when v_history then 'archive' else 'delete' end;

  if not p_dry_run then
    if v_action = 'blocked' then
      raise exception 'move or pause % recurring expense(s) first', v_active_rules using errcode = '23503';
    elsif v_action = 'delete' then
      delete from public.category_budgets b where b.category_id = p_category_id;
      delete from public.categories c where c.id = p_category_id;
    else
      update public.categories set archived_at = now() where id = p_category_id and archived_at is null;
    end if;
  end if;

  return jsonb_build_object('action', v_action, 'transactions', v_tx, 'recurring', v_active_rules);
end $$;

revoke execute on function public.delete_category(uuid, boolean) from public, anon;
grant execute on function public.delete_category(uuid, boolean) to authenticated;
