-- P2 of the design plan (docs/design/ROLLOUT.md 2.3): hide a category that isn't relevant now
-- ("no dog this year"), apart from archive and delete. A hidden category keeps its history and
-- budget; the app leaves it out of the add sheet and Overview unless it has spending this month.
alter table public.categories add column hidden boolean not null default false;
