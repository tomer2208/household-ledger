// R10: every date the app shows or saves is read on the household's clock (households.timezone),
// the same one the server uses for budget_month, not the phone's. A phone abroad or with a
// wrong clock then agrees with the server on which day and month it is. The root layout sets
// the zone once the household loads; until then (sign-in, onboarding) it is the phone's own.

let TZ: string | undefined;
export function setAppTimeZone(tz: string | null | undefined) {
  TZ = tz || undefined;
}
export const appTimeZone = () => TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(opts: Intl.DateTimeFormatOptions, utc = false) {
  const zone = utc ? 'UTC' : appTimeZone();
  const key = zone + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) cache.set(key, (f = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: zone })));
  return f;
}

const pad = (n: number) => String(n).padStart(2, '0');
// 'YYYY-MM-DD' strings (budget_month, next_run_date) are calendar days, not instants.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const calendarUtc = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

// Wall-clock parts of an instant on the household clock.
function parts(t: Date) {
  const p = Object.fromEntries(
    fmt({ year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(t)
      .map((x) => [x.type, x.value]),
  );
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}

// How far the household clock is ahead of UTC at instant t, in ms.
function offset(t: number) {
  const p = parts(new Date(t));
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000;
}

const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// ───────── calendar days ('YYYY-MM-DD') ─────────

// The calendar day an instant falls on.
export function ymd(t: Date) {
  const p = parts(t);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}
export const todayYmd = () => ymd(new Date());
export function addDays(day: string, n: number) {
  const d = calendarUtc(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const yesterdayYmd = () => addDays(todayYmd(), -1);

// The instant on calendar day `day` at the clock time `time` shows, so a back-dated expense
// still sorts sensibly within its day. Resolved twice so a daylight-saving change between
// `time` and `day` still lands on the right hour.
export function onDay(day: string, time: Date = new Date()) {
  const [y, m, d] = day.split('-').map(Number);
  const c = parts(time);
  const wall = Date.UTC(y, m - 1, d, c.h, c.mi, c.s) + (time.getTime() % 1000);
  const first = wall - offset(wall);
  return new Date(wall - offset(first)).toISOString();
}

// First of the month a calendar day belongs to, in budget_month's 'YYYY-MM-01' form.
export const monthOfDay = (day: string) => `${day.slice(0, 7)}-01`;

// ───────── labels ─────────

export function dayLabel(iso: string) {
  const day = ymd(new Date(iso));
  const today = todayYmd();
  if (day === today) return 'Today';
  if (day === addDays(today, -1)) return 'Yesterday';
  return fmt({ weekday: 'long', month: 'short', day: 'numeric' }, true).format(calendarUtc(day));
}

// budget_month comes as 'YYYY-MM-DD'; it is a calendar month, so no zone can shift it.
export const monthLabel = (day: string) => fmt({ month: 'long', year: 'numeric' }, true).format(calendarUtc(day));

export const timeLabel = (iso: string) => fmt({ hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

export const shortDate = (value: string) =>
  DATE_ONLY.test(value)
    ? fmt({ month: 'short', day: 'numeric', year: 'numeric' }, true).format(calendarUtc(value))
    : fmt({ month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));

export const dayChipLabel = (day: string) => fmt({ weekday: 'short', month: 'short', day: 'numeric' }, true).format(calendarUtc(day));

// ───────── the month so far ─────────

export function daysLeftInMonth(now = new Date()) {
  const p = parts(now);
  return daysIn(p.y, p.m) - p.d;
}

// Days still to spend in, today included: on the 28th of a 30-day month that's 3.
export function daysToGo(now = new Date()) {
  return daysLeftInMonth(now) + 1;
}

// How far through the current month we are, 0-100: the pace marker on budget bars.
export function monthPace(now = new Date()) {
  const p = parts(now);
  return Math.round((p.d * 100) / daysIn(p.y, p.m));
}
