-- Public-launch readiness (NEXT_SESSION G4, G10): leaving a household, removing a member,
-- and deleting an account with everything that belongs only to it.

-- Hard-deletes a household and all of its rows, children first (FKs have no cascade on
-- purpose: nothing else should ever delete a household by accident). Only reachable
-- through leave_household (last member) and account deletion.
create function app.purge_household(p_household uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.savings_ledger     where household_id = p_household;
  delete from public.budget_alerts      where household_id = p_household;
  delete from public.month_closes       where household_id = p_household; -- unlocks category_budgets
  delete from public.monthly_reports    where household_id = p_household;
  delete from public.agent_proposals    where household_id = p_household;
  delete from public.agent_runs         where household_id = p_household;
  delete from app.advisor_dismissals    where household_id = p_household;
  delete from public.transactions       where household_id = p_household;
  delete from public.recurring_rules    where household_id = p_household;
  delete from public.merchant_aliases   where household_id = p_household;
  delete from public.merchants          where household_id = p_household;
  delete from public.category_budgets   where household_id = p_household;
  delete from public.categories         where household_id = p_household;
  delete from public.device_tokens      where household_id = p_household;
  delete from public.household_invites  where household_id = p_household;
  delete from public.household_members  where household_id = p_household;
  delete from public.households         where id = p_household;
  -- Last, because every delete above wrote an audit row.
  delete from public.audit_log          where household_id = p_household;
end $$;
revoke execute on function app.purge_household(uuid) from public, anon, authenticated;

-- A person stops being a member. Their Shortcut tokens stop working at once; their past
-- expenses stay (created_by keeps pointing at them until the account itself is deleted).
create function app.detach_member(p_household uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.household_members set removed_at = now()
  where household_id = p_household and user_id = p_user and removed_at is null;
  update public.device_tokens set revoked_at = now()
  where household_id = p_household and user_id = p_user and revoked_at is null;
end $$;
revoke execute on function app.detach_member(uuid, uuid) from public, anon, authenticated;

-- Leave the current household. The last member leaving deletes it: nobody could reach
-- that data again anyway. Returns 'left' or 'deleted' so the app can say which happened.
create function public.leave_household() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
begin
  perform 1 from public.households where id = v_household for update;
  if exists (select 1 from public.household_members
             where household_id = v_household and removed_at is null and user_id <> auth.uid()) then
    perform app.detach_member(v_household, auth.uid());
    return 'left';
  end if;
  perform app.purge_household(v_household);
  return 'deleted';
end $$;

-- Equal rights (Batch 2): any member can remove another. Removing yourself is leaving.
create function public.remove_member(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
begin
  if p_user_id = auth.uid() then
    raise exception 'use leave_household to leave' using errcode = '22023';
  end if;
  if not exists (select 1 from public.household_members
                 where household_id = v_household and user_id = p_user_id and removed_at is null) then
    raise exception 'not a member of this household' using errcode = 'P0002';
  end if;
  perform app.detach_member(v_household, p_user_id);
end $$;

revoke execute on function public.leave_household(), public.remove_member(uuid) from public, anon;
grant execute on function public.leave_household(), public.remove_member(uuid) to authenticated;

-- Account deletion, step 1 of 2 (the delete-account function then removes the auth user,
-- which cascades memberships, devices and push subscriptions). A household this person is
-- the only member of goes with them; a shared one stays with the partner.
create function public.prepare_account_deletion(p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid;
begin
  select household_id into v_household from public.household_members
  where user_id = p_user and removed_at is null limit 1;
  if v_household is null then
    return 'no_household';
  end if;
  if exists (select 1 from public.household_members
             where household_id = v_household and removed_at is null and user_id <> p_user) then
    perform app.detach_member(v_household, p_user);
    return 'left';
  end if;
  perform app.purge_household(v_household);
  return 'deleted';
end $$;
revoke execute on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
