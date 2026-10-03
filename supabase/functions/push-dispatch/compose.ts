// Notification copy and keys for push-dispatch, kept free of npm imports so Node can test it:
//   node --test supabase/functions/push-dispatch/compose.test.ts

export type Alert = {
  // Missing from databases before migration 40, where every item is a budget alert.
  kind?: "budget";
  category_id: string;
  budget_month: string;
  threshold: 90 | 100;
  spent_minor: number;
  cap_minor: number;
  category_name: string;
  currency: string;
  days_left: number;
  suppressed: boolean;
  tokens: string[];
  // P1-6 (migration 34): each recipient's language; missing means English.
  token_lang?: Record<string, Lang>;
  web: WebSub[];
};

// P1-19: a month's report was written; it goes to the members who keep report notices on.
export type Report = {
  kind: "report";
  report_id: string;
  budget_month: string;
  currency: string;
  spent_minor: number;
  cap_minor: number;
  suppressed: false;
  tokens: string[];
  token_lang?: Record<string, Lang>;
  web: WebSub[];
};

export type Item = Alert | Report;
export const isReport = (x: Item): x is Report => x.kind === "report";

export type Lang = "en" | "he";
export type WebSub = { endpoint: string; p256dh: string; auth: string; lang?: Lang };

export type Status = "sent" | "suppressed" | "failed";
export type Result =
  | { category_id: string; budget_month: string; threshold: number; status: Status }
  | { report_id: string; status: Status };

// What finish_push_alerts matches a result on.
export const keyOf = (x: Item) =>
  isReport(x) ? { report_id: x.report_id } : { category_id: x.category_id, budget_month: x.budget_month, threshold: x.threshold };
export const sameKey = (r: Result, x: Item) => JSON.stringify({ ...r, status: undefined }) === JSON.stringify({ ...keyOf(x), status: undefined });

function money(minor: number, currency: string, lang: Lang) {
  try {
    return new Intl.NumberFormat(lang === "he" ? "he-IL" : "en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

function monthName(month: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === "he" ? "he-IL" : "en-US", { month: "long", timeZone: "UTC" }).format(
    new Date(`${month}T00:00:00Z`),
  );
}

// P1-19: the month in a line, in the recipient's language: spent against the budgets, or just
// what was spent when there were none.
export function composeReport(r: Report, lang: Lang = "en") {
  const month = monthName(r.budget_month, lang);
  const spent = money(r.spent_minor, r.currency, lang);
  const cap = money(r.cap_minor, r.currency, lang);
  const diff = money(Math.abs(r.cap_minor - r.spent_minor), r.currency, lang);
  const under = r.spent_minor <= r.cap_minor;
  if (lang === "he") {
    const body = r.cap_minor > 0 ? `${spent} מתוך ${cap} · ${diff} ${under ? "מתחת לתקציב" : "מעל התקציב"}` : `הוצאתם ${spent}`;
    return { title: `הדוח של ${month} מוכן`, body };
  }
  const body = r.cap_minor > 0 ? `${spent} of ${cap} · ${diff} ${under ? "under budget" : "over budget"}` : `${spent} spent`;
  return { title: `Your ${month} report is ready`, body };
}

// Where tapping it goes, and the tag that replaces an older notice of the same thing.
export const urlOf = (x: Item) => (isReport(x) ? `/reports/${x.budget_month}` : `/transactions?category=${x.category_id}`);
export const tagOf = (x: Item) => (isReport(x) ? `report-${x.budget_month}` : `budget-${x.category_id}`);
export const textOf = (x: Item, lang: Lang) => (isReport(x) ? composeReport(x, lang) : compose(x, lang));

// Copy per BLUEPRINT US-S2 AC4: what happened, the numbers, and how much month is left,
// in the recipient's language (P1-6).
export function compose(a: Alert, lang: Lang = "en") {
  const spent = money(a.spent_minor, a.currency, lang);
  const cap = money(a.cap_minor, a.currency, lang);
  const n = a.days_left;
  if (lang === "he") {
    const title = a.threshold >= 100 ? `${a.category_name}: חריגה מהתקציב` : `${a.category_name}: הגעתם ל-90% מהתקציב`;
    const days = n === 0 ? "היום האחרון בחודש" : n === 1 ? "נשאר יום אחד" : n === 2 ? "נשארו יומיים" : `נשארו ${n} ימים`;
    return { title, body: `${spent} מתוך ${cap} · ${days}` };
  }
  const title = a.threshold >= 100 ? `${a.category_name} is over budget` : `${a.category_name} is at 90%`;
  const days = n === 0 ? "last day of the month" : n === 1 ? "1 day left" : `${n} days left`;
  return { title, body: `${spent} of ${cap} · ${days}` };
}
