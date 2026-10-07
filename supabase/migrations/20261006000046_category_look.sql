-- P1 of the design plan (docs/DESIGN_GANTT.md): a category's own colour and icon, so a household
-- can choose them (P2). Both are ids, not hex or symbol names: the app turns `color` into its
-- light and dark values (docs/design/foundations/categories.md) and `icon` into a Phosphor icon
-- (icons.md), so a shade can change later without touching the data.
--
-- New rows get both from the trigger below, so create_household, capture and review_confirm
-- (which only know sf_symbol) need no change. sf_symbol stays until the app reads only `icon`.

alter table public.categories
  add column color text check (color in ('teal','sand','blue','ocean','clay','olive','indigo','sage','violet','rose')),
  add column icon  text check (icon ~ '^[a-z]{2,20}$');

-- The SF Symbol each category has today, as an icon id (icons.md).
create function public.category_icon_from_sf(p_sf text)
returns text language sql immutable set search_path = '' as $$
  select case p_sf
    when 'cart' then 'supermarket' when 'fork.knife' then 'dining' when 'cup.and.saucer' then 'coffee'
    when 'car' then 'car' when 'fuelpump' then 'fuel' when 'bus' then 'bus' when 'house' then 'housing'
    when 'building.columns' then 'mortgage' when 'bolt' then 'electricity' when 'drop' then 'water'
    when 'wifi' then 'internet' when 'arrow.triangle.2.circlepath' then 'subscriptions'
    when 'cross.case' then 'health' when 'pills' then 'pharmacy' when 'dumbbell' then 'fitness'
    when 'figure.and.child.holdinghands' then 'kids' when 'graduationcap' then 'education'
    when 'bag' then 'shopping' when 'tshirt' then 'clothes' when 'scissors' then 'grooming'
    when 'popcorn' then 'entertainment' when 'gamecontroller' then 'games' when 'airplane' then 'travel'
    when 'gift' then 'gifts' when 'heart' then 'donations' when 'pawprint' then 'pets'
    when 'wrench.and.screwdriver' then 'repairs' when 'banknote' then 'savings' when 'creditcard' then 'card'
    when 'tag' then 'tag' when 'ellipsis.circle' then 'other'
    else 'tag'
  end
$$;

-- The seeded categories' colours (categories.md), so the first eight on screen are eight
-- different ones. Anything else takes the colour least used in its household, oldest first on a tie.
create function public.category_color_default(p_household uuid, p_icon text)
returns text language sql stable set search_path = '' as $$
  select coalesce(
    case p_icon
      when 'supermarket' then 'teal' when 'dining' then 'sand' when 'car' then 'blue' when 'fuel' then 'ocean'
      when 'housing' then 'clay' when 'electricity' then 'olive' when 'health' then 'indigo' when 'kids' then 'sage'
      when 'shopping' then 'violet' when 'entertainment' then 'rose' when 'subscriptions' then 'olive'
      when 'travel' then 'teal' when 'gifts' then 'rose' when 'education' then 'blue' when 'other' then 'sand'
    end,
    (select c.color from unnest(array['teal','sand','blue','ocean','clay','olive','indigo','sage','violet','rose'])
                       with ordinality as c(color, n)
     left join public.categories k on k.household_id = p_household and k.color = c.color and k.archived_at is null
     group by c.color, c.n
     order by count(k.id), c.n
     limit 1)
  )
$$;

create function public.categories_fill_look()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.icon is null then new.icon := public.category_icon_from_sf(new.sf_symbol); end if;
  if new.color is null then new.color := public.category_color_default(new.household_id, new.icon); end if;
  return new;
end $$;

create trigger categories_fill_look before insert on public.categories
  for each row execute function public.categories_fill_look();

-- Existing categories: the icon from their symbol, then the colours in sort order, so within a
-- household the "least used" fallback sees the ones already given.
update public.categories set icon = public.category_icon_from_sf(sf_symbol) where icon is null;
do $$
declare r record;
begin
  for r in select id, household_id, icon from public.categories where color is null order by household_id, sort_order, id loop
    update public.categories set color = public.category_color_default(r.household_id, r.icon) where id = r.id;
  end loop;
end $$;

alter table public.categories alter column color set not null, alter column icon set not null;

revoke execute on function public.category_icon_from_sf(text) from public, anon;
revoke execute on function public.category_color_default(uuid, text) from public, anon;
revoke execute on function public.categories_fill_look() from public, anon, authenticated;
