-- Merchants, aliases (the classifier's memory), device tokens, push tokens.

-- One normalizer shared by the DB and the Edge Function (via RPC), so a merchant string
-- can never be normalized two different ways. Hebrew is kept; only noise is removed.
create function app.normalize_merchant(p_raw text) returns text
language plpgsql immutable parallel safe set search_path = '' as $$
declare
  s text := lower(normalize(coalesce(p_raw, ''), NFKC));
begin
  -- bidi controls and non-breaking spaces that Wallet may embed
  s := regexp_replace(s, '[‎‏‪-‮⁦-⁩  ]', ' ', 'g');
  -- gershayim/quotes inside abbreviations: בע"מ → בעמ
  s := regexp_replace(s, '["''׳״]', '', 'g');
  -- everything that is not a letter we care about or a digit becomes a space
  s := regexp_replace(s, '[^a-z0-9à-ÿא-ת ]', ' ', 'g');
  -- branch / terminal numbers
  s := regexp_replace(s, '[0-9]{3,}', ' ', 'g');
  -- legal suffixes (padded so they only match whole words, applied twice for neighbours)
  s := ' ' || regexp_replace(s, '\s+', ' ', 'g') || ' ';
  s := regexp_replace(s, ' (ltd|inc|llc|co|בעמ) ', ' ', 'g');
  s := regexp_replace(s, ' (ltd|inc|llc|co|בעמ) ', ' ', 'g');
  s := btrim(regexp_replace(s, '\s+', ' ', 'g'));
  return nullif(s, '');
end $$;

create table public.merchants (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references public.households(id),
  display_name        text not null check (length(btrim(display_name)) between 1 and 60),
  default_category_id uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, household_id),
  foreign key (default_category_id, household_id) references public.categories (id, household_id)
);

create table public.merchant_aliases (
  household_id uuid not null references public.households(id),
  normalized   text not null,
  merchant_id  uuid not null,
  source       text not null check (source in ('user','fuzzy','llm')),
  created_at   timestamptz not null default now(),
  primary key (household_id, normalized),
  foreign key (merchant_id, household_id) references public.merchants (id, household_id)
);
create index merchant_aliases_trgm on public.merchant_aliases
  using gin (normalized extensions.gin_trgm_ops);
create index merchant_aliases_merchant on public.merchant_aliases (merchant_id);

create table public.device_tokens (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id),
  user_id      uuid not null references auth.users(id) on delete cascade,
  label        text not null check (length(btrim(label)) between 1 and 40),
  token_hash   text not null unique,     -- sha256 hex; the plaintext is shown once and never stored
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create table public.push_tokens (
  user_id         uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null,
  updated_at      timestamptz not null default now(),
  primary key (user_id, expo_push_token)
);
