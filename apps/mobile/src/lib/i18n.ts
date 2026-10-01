// P1-6: the app speaks Hebrew or English. Everything a person reads comes from `t`, typed by
// the English dictionary, so a key missing in Hebrew fails `tsc` instead of showing English.
//
// The language is set once, before the first render (root layout), and changing it reloads
// the app (lib/lang-store), so screens can read `t` and `locale()` like constants. No React
// here: lib/money and lib/dates import it, and so do their unit tests under Node.

import { en, type Dict } from '../i18n/en';
import { he } from '../i18n/he';

export type Lang = 'en' | 'he';
// What the person chose in Settings; 'system' follows the phone's language.
export type LangChoice = Lang | 'system';

const DICTS: Record<Lang, Dict> = { en, he };
let current: Lang = 'en';

// Sections are replaced whole, so `t.section.key` always reads the current language.
export const t: Dict = { ...en };

export function applyLang(l: Lang) {
  current = l;
  Object.assign(t, DICTS[l]);
}

export const lang = () => current;
export const isRTL = () => current === 'he';
// For Intl: money and dates are written the way the language writes them.
export const locale = () => (current === 'he' ? 'he-IL' : 'en-US');

// The first of the phone's languages that the app speaks; "iw" is the old code for Hebrew.
export function langFromTags(tags: readonly (string | null | undefined)[]): Lang {
  for (const tag of tags) {
    const code = tag?.toLowerCase().split(/[-_]/)[0];
    if (code === 'he' || code === 'iw') return 'he';
    if (code === 'en') return 'en';
  }
  return 'en';
}

export const isLangChoice = (v: unknown): v is LangChoice => v === 'en' || v === 'he' || v === 'system';

// Plurals: Hebrew and English differ (one / two / many), so each phrase picks its own form.
export function plural(n: number, forms: { one: string; two?: string; other: string }) {
  const form = n === 1 ? forms.one : n === 2 && forms.two ? forms.two : forms.other;
  return form.replace('#', String(n));
}
