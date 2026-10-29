-- The Shortcut's notification says what's left in the envelope a purchase went to ("Aroma ·
-- ₪25 → Eating out · ₪340 left"). What's left is the month's budget as Overview counts it (the
-- budget set, what carried in from last month, what spread payments set aside or release)
-- less what was spent, the purchase included. Null when the category has no budget this month.
create function public.capture_left(p_household uuid, p_category uuid) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare
  v_month date := app.local_month(p_household, now());
  v_cap bigint;
begin
  if not exists (select 1 from public.categories c where c.id = p_category and c.household_id = p_household) then
    return null;
  end if;
  v_cap := coalesce(app.cap_for(p_category, v_month), 0) + app.carry_for(p_category, v_month)
         + coalesce((select sum(x.reserve) from app.rule_reserves(p_household, v_month) x where x.category_id = p_category), 0);
  if v_cap <= 0 then return null; end if;
  return v_cap - app.spent_for(p_category, v_month);
end $$;

revoke execute on function public.capture_left(uuid, uuid) from public, anon, authenticated;
grant execute on function public.capture_left(uuid, uuid) to service_role;
