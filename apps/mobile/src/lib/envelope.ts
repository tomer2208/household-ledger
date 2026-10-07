import { envelope } from './tokens';

// K1, direction D (design-system/finpace/MASTER.md): every budget is an envelope in one of three
// states, said in words. Fine up to 80% of the budget, close to the limit from 80%, over past it.
// Nothing about pace: the pace is a sentence ("at this rate it runs out on the 18th"), see runsOutOn.

export type EnvelopeState = 'none' | 'ok' | 'close' | 'over';

export type EnvelopeStatus =
  | { state: 'none'; spent: number }
  | { state: 'ok' | 'close' | 'over'; spent: number; cap: number; left: number; pct: number };

export function envelopeStatus(cap: number | null | undefined, spent: number): EnvelopeStatus {
  if (cap == null || cap <= 0) return { state: 'none', spent };
  const left = cap - spent;
  const pct = (spent * 100) / cap;
  const state = left < 0 ? 'over' : pct >= envelope.closeAt ? 'close' : 'ok';
  return { state, spent, cap, left, pct };
}

// The day of the month an envelope empties at the rate so far, when that's before the month
// ends. Only said while the envelope is still fine: once it's close or over, the words say it.
// `day` is today's day of the month (1-based), `days` the month's length.
export function runsOutOn(cap: number | null | undefined, spent: number, day: number, days: number): number | null {
  const st = envelopeStatus(cap, spent);
  if (st.state !== 'ok' || spent <= 0 || day < 1) return null;
  const perDay = spent / day;
  const on = Math.ceil(st.cap / perDay);
  return on > day && on < days ? on : null;
}

// Whole shekels on envelopes and the month's total (F3): never round "what's left" up past
// what's really there, and never round an overspend down to nothing.
export function wholeUnits(minor: number) {
  return minor >= 0 ? Math.floor(minor / 100) * 100 : -Math.ceil(-minor / 100) * 100;
}
