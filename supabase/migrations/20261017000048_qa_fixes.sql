-- QA-1 (docs/QA_REPORT.md): migrations 46 and 47 added color, icon and hidden to categories, but
-- members may only update the columns migration 6 granted one by one. Saving a category from the
-- app (which always sends its colour and icon) was refused with "permission denied".
grant update (color, icon, hidden) on public.categories to authenticated;

-- QA-10: a recurring expense made in the app was saved without who made it (the app doesn't send
-- it, and nothing filled it in). Whoever inserts the row is its author unless one is given.
alter table public.recurring_rules alter column created_by set default auth.uid();
