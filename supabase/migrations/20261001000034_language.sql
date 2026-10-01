-- P1-6 (docs/PRODUCT_ROADMAP.md): Hebrew or English, per person.
--
-- The app chooses its language on the phone (Settings → Language). The server needs it too,
-- because some of what it writes is read later, outside the app: push alerts, the Shortcut's
-- menu and reply, the monthly report and the advisor's cards. Each member's language is kept
-- on their membership, and the app sets it with set_my_language() whenever it differs.
--
-- - push: claim_push_alerts() says which language each token and browser belongs to, so two
--   partners can get the same alert in two languages.
-- - Shortcut: capture_auth() returns the device owner's language.
-- - reports and advisor cards are shared by the household; the Edge Functions write one per
--   member language (monthly_reports.narratives, rationale.texts) and the app shows the
--   reader's. `narrative` / `text` stay as the household's main language (its first member).
-- - a household created in Hebrew starts with Hebrew category names. The icons are the same in
--   both languages, which is what the setup wizard's suggested budgets key on.

alter table public.household_members
  add column language text not null default 'en' check (language in ('en', 'he'));

alter table public.monthly_reports add column narratives jsonb;

create function public.set_my_language(p_language text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_language is null or p_language not in ('en', 'he') then
    raise exception 'language must be en or he' using errcode = '22023';
  end if;
  update public.household_members set language = p_language
  where user_id = auth.uid() and removed_at is null and language is distinct from p_language;
end $$;

revoke execute on function public.set_my_language(text) from public, anon;
grant execute on function public.set_my_language(text) to authenticated;

-- create_household (migration 7) with the language of the person creating it.
drop function public.create_household(text, text, text);

create function public.create_household(p_name text, p_base_currency text, p_display_name text, p_language text default 'en')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_lang text := case when p_language = 'he' then 'he' else 'en' end;
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

  insert into public.household_members (household_id, user_id, display_name, language)
  values (v_id, auth.uid(), btrim(p_display_name), v_lang);

  insert into public.categories (household_id, name, sf_symbol, kind, sort_order, created_via)
  select v_id, case when v_lang = 'he' then c.he else c.en end, c.symbol, c.kind, c.ord, 'seed'
  from (values
    ('Groceries', 'סופרמרקט', 'cart', 'expense', 1), ('Dining', 'אוכל בחוץ', 'fork.knife', 'expense', 2),
    ('Transport', 'תחבורה', 'car', 'expense', 3), ('Fuel', 'דלק', 'fuelpump', 'expense', 4),
    ('Housing', 'דיור', 'house', 'expense', 5), ('Utilities', 'חשבונות', 'bolt', 'expense', 6),
    ('Health', 'בריאות', 'cross.case', 'expense', 7), ('Kids', 'ילדים', 'figure.and.child.holdinghands', 'expense', 8),
    ('Shopping', 'קניות', 'bag', 'expense', 9), ('Entertainment', 'בילויים', 'popcorn', 'expense', 10),
    ('Subscriptions', 'מנויים', 'arrow.triangle.2.circlepath', 'expense', 11), ('Travel', 'חופשות', 'airplane', 'expense', 12),
    ('Gifts', 'מתנות', 'gift', 'expense', 13), ('Education', 'חינוך', 'graduationcap', 'expense', 14),
    ('Other', 'אחר', 'ellipsis.circle', 'expense', 99), ('Savings', 'חיסכון', 'banknote', 'savings', 100)
  ) as c(en, he, symbol, kind, ord);

  return v_id;
end $$;

revoke execute on function public.create_household(text, text, text, text) from public, anon;
grant execute on function public.create_household(text, text, text, text) to authenticated;

-- capture_auth (migration 8) also returns the device owner's language.
drop function public.capture_auth(text);

create function public.capture_auth(p_token_hash text)
returns table (device_id uuid, household_id uuid, user_id uuid, base_currency char(3), ai_enabled boolean, language text)
language sql security definer set search_path = '' as $$
  update public.device_tokens d set last_used_at = now()
  from public.households h, public.household_members m
  where d.token_hash = p_token_hash and d.revoked_at is null
    and h.id = d.household_id and h.deleted_at is null
    and m.household_id = d.household_id and m.user_id = d.user_id and m.removed_at is null
  returning d.id, d.household_id, d.user_id, h.base_currency, h.ai_consent_at is not null, m.language;
$$;

revoke execute on function public.capture_auth(text) from public, anon, authenticated;
grant execute on function public.capture_auth(text) to service_role;

-- claim_push_alerts (migration 17) with each recipient's language: `token_lang` maps an Expo
-- token to its owner's language, and each browser in `web` carries `lang`.
create or replace function public.claim_push_alerts() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
begin
  with claimed as (
    update public.budget_alerts a
    set push_status = 'sending', push_claimed_at = now()
    where a.push_status = 'queued'
       or (a.push_status = 'sending' and a.push_claimed_at < now() - interval '10 minutes')
    returning a.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'category_id', c.category_id,
    'budget_month', c.budget_month,
    'threshold', c.threshold,
    'spent_minor', c.spent_minor,
    'cap_minor', c.cap_minor,
    'category_name', cat.name,
    'currency', h.base_currency,
    'days_left', (date_trunc('month', now() at time zone h.timezone) + interval '1 month - 1 day')::date
                 - (now() at time zone h.timezone)::date,
    -- H7: a 90% alert that fired together with (or after) its 100% sibling stays silent
    'suppressed', c.threshold = 90 and exists (
        select 1 from public.budget_alerts b
        where b.category_id = c.category_id and b.budget_month = c.budget_month and b.threshold = 100),
    'tokens', (select coalesce(jsonb_agg(p.expo_push_token), '[]'::jsonb)
               from public.household_members m
               join public.push_tokens p on p.user_id = m.user_id
               where m.household_id = c.household_id and m.removed_at is null),
    'token_lang', (select coalesce(jsonb_object_agg(p.expo_push_token, m.language), '{}'::jsonb)
                   from public.household_members m
                   join public.push_tokens p on p.user_id = m.user_id
                   where m.household_id = c.household_id and m.removed_at is null),
    'web', (select coalesce(jsonb_agg(jsonb_build_object('endpoint', w.endpoint, 'p256dh', w.p256dh, 'auth', w.auth,
                                                         'lang', m.language)), '[]'::jsonb)
            from public.household_members m
            join public.web_push_subscriptions w on w.user_id = m.user_id
            where m.household_id = c.household_id and m.removed_at is null)
  )), '[]'::jsonb) into v
  from claimed c
  join public.categories cat on cat.id = c.category_id
  join public.households h on h.id = c.household_id;
  return v;
end $$;
