// P1-9: what Expenses is filtered by. It lives in the screen's URL params, so a refresh, the
// back button from an expense, or a link from Overview all land on the same list. The server
// reads it as the filter of find_transactions / summarize_transactions (migration 36).

import { addMonths, monthOfDay, todayYmd } from './dates';

export const PERIODS = ['this_month', 'last_month', '3_months', 'this_year'] as const;
export type Preset = (typeof PERIODS)[number];
// 'month' is one budget month (a past month on Overview); 'custom' is a range of days.
export type Period = Preset | 'month' | 'custom';
export const SOURCES = ['apple_pay', 'manual', 'recurring'] as const;
export type Source = (typeof SOURCES)[number];
export const KINDS = ['expense', 'refund', 'review'] as const;
export type Kind = (typeof KINDS)[number];

export type TxFilter = {
  categories: string[];
  period: Period | null;
  month: string | null; // period 'month': 'YYYY-MM-01'
  from: string | null; // period 'custom': calendar days, both included, either may be open
  to: string | null;
  min: number | null; // size of the amount in the base currency, minor units
  max: number | null;
  members: string[];
  sources: Source[];
  kind: Kind | null;
};

export const EMPTY_FILTER: TxFilter = {
  categories: [],
  period: null,
  month: null,
  from: null,
  to: null,
  min: null,
  max: null,
  members: [],
  sources: [],
  kind: null,
};

// The screen's params. `category` and `month` are the names Overview has always linked with.
export const PARAM_KEYS = ['category', 'period', 'month', 'from', 'to', 'min', 'max', 'who', 'source', 'kind'] as const;
export type FilterParams = Partial<Record<(typeof PARAM_KEYS)[number], string | string[]>>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const list = (v: string | string[] | undefined) => [...new Set(one(v).split(',').filter(Boolean))];
const day = (v: string | string[] | undefined) => (DAY.test(one(v)) ? one(v) : null);
const minor = (v: string | string[] | undefined) => (/^\d{1,13}$/.test(one(v)) ? Number(one(v)) : null);
const oneOf = <T extends string>(all: readonly T[], v: string) => (all.includes(v as T) ? (v as T) : null);

// Anything malformed in a hand-edited or stale link is dropped, never sent to the server.
export function filterFromParams(p: FilterParams): TxFilter {
  const month = day(p.month);
  const from = day(p.from);
  const to = day(p.to);
  let period: Period | null = oneOf(PERIODS, one(p.period));
  if (!period && month) period = 'month';
  if (!period && (from || to)) period = 'custom';
  return {
    categories: list(p.category).filter((x) => UUID.test(x)),
    period,
    month: period === 'month' ? monthOfDay(month!) : null,
    from: period === 'custom' ? from : null,
    to: period === 'custom' ? to : null,
    min: minor(p.min),
    max: minor(p.max),
    members: list(p.who).filter((x) => UUID.test(x)),
    sources: list(p.source).flatMap((x) => oneOf(SOURCES, x) ?? []),
    kind: oneOf(KINDS, one(p.kind)),
  };
}

// Every key is present; an unused one is undefined, which router.setParams removes.
export function filterToParams(f: TxFilter): Record<(typeof PARAM_KEYS)[number], string | undefined> {
  const join = (xs: string[]) => (xs.length ? xs.join(',') : undefined);
  return {
    category: join(f.categories),
    period: f.period && f.period !== 'month' && f.period !== 'custom' ? f.period : undefined,
    month: f.period === 'month' ? (f.month ?? undefined) : undefined,
    from: f.period === 'custom' ? (f.from ?? undefined) : undefined,
    to: f.period === 'custom' ? (f.to ?? undefined) : undefined,
    min: f.min != null ? String(f.min) : undefined,
    max: f.max != null ? String(f.max) : undefined,
    who: join(f.members),
    source: join(f.sources),
    kind: f.kind ?? undefined,
  };
}

// The budget months a preset covers, ending with the current one, as Overview counts them.
export function presetMonths(p: Preset, today = todayYmd()): { from: string; to: string } {
  const now = monthOfDay(today);
  switch (p) {
    case 'this_month':
      return { from: now, to: now };
    case 'last_month':
      return { from: addMonths(now, -1), to: addMonths(now, -1) };
    case '3_months':
      return { from: addMonths(now, -2), to: now };
    case 'this_year':
      return { from: `${now.slice(0, 4)}-01-01`, to: now };
  }
}

export type ServerFilter = Record<string, string | number | string[]>;

// The request body: only what is set, so equal filters make equal cache keys.
export function serverFilter(f: TxFilter, q: string, today = todayYmd()): ServerFilter {
  const out: ServerFilter = {};
  if (q.trim()) out.q = q.trim();
  if (f.categories.length) out.categories = f.categories;
  if (f.period === 'month' && f.month) {
    out.month_from = f.month;
    out.month_to = f.month;
  } else if (f.period === 'custom') {
    if (f.from) out.from = f.from;
    if (f.to) out.to = f.to;
  } else if (f.period && f.period !== 'month') {
    const m = presetMonths(f.period, today);
    out.month_from = m.from;
    out.month_to = m.to;
  }
  // Typed the wrong way round, the two ends still mean the range between them.
  const [lo, hi] = f.min != null && f.max != null && f.min > f.max ? [f.max, f.min] : [f.min, f.max];
  if (lo != null) out.min = lo;
  if (hi != null) out.max = hi;
  if (f.members.length) out.members = f.members;
  if (f.sources.length) out.sources = f.sources;
  if (f.kind) out.kind = f.kind;
  return out;
}

export const isEmptyFilter = (f: TxFilter) =>
  !f.categories.length && !f.period && f.min == null && f.max == null && !f.members.length && !f.sources.length && !f.kind;

// How many groups are set, for the badge on the Filter button.
export const activeGroups = (f: TxFilter) =>
  [f.categories.length, f.period, f.min != null || f.max != null, f.members.length, f.sources.length, f.kind].filter(Boolean).length;

const toggle = <T>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
export const toggleIn = {
  categories: (f: TxFilter, id: string): TxFilter => ({ ...f, categories: toggle(f.categories, id) }),
  members: (f: TxFilter, id: string): TxFilter => ({ ...f, members: toggle(f.members, id) }),
  sources: (f: TxFilter, s: Source): TxFilter => ({ ...f, sources: toggle(f.sources, s) }),
};
export const withoutPeriod = (f: TxFilter): TxFilter => ({ ...f, period: null, month: null, from: null, to: null });
export const withoutAmount = (f: TxFilter): TxFilter => ({ ...f, min: null, max: null });
