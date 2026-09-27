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
