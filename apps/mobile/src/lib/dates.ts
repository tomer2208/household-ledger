const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const shortFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return dayFmt.format(d);
}

// budget_month comes as 'YYYY-MM-DD'; parse as a local date so it never shifts a day.
export function monthLabel(ymd: string) {
  const [y, m] = ymd.split('-').map(Number);
  return monthFmt.format(new Date(y, m - 1, 1));
}

export const timeLabel = (iso: string) => timeFmt.format(new Date(iso));
export const shortDate = (iso: string) => shortFmt.format(new Date(iso));

export function daysLeftInMonth() {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return last - now.getDate();
}

// How far through the current month we are, 0-100: the pace marker on budget bars.
export function monthPace() {
  const now = new Date();
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.round((now.getDate() * 100) / days);
}

// Calendar days as 'YYYY-MM-DD' in the phone's local time: what a date picker shows and returns.
const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayYmd = () => ymd(new Date());
export const yesterdayYmd = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return ymd(d);
};

// The instant `time` would be on calendar day `day`, keeping its clock time so a back-dated
// expense still sorts sensibly within its day.
export function onDay(day: string, time: Date = new Date()) {
  const [y, m, d] = day.split('-').map(Number);
  const out = new Date(time);
  out.setFullYear(y, m - 1, d);
  return out.toISOString();
}

// First of the month a calendar day belongs to, in budget_month's 'YYYY-MM-01' form.
export const monthOfDay = (day: string) => `${day.slice(0, 7)}-01`;

export const dayChipLabel = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(y, m - 1, d));
};
