// What the E2E tests share: the language of the run (the Playwright project, "en" or "he"),
// its dictionary, people made for one test (the local stack's admin API, never the live
// project), and signing them in. The local stack's address and keys come from scripts/e2e.sh.
import { test as base, expect, type Page } from '@playwright/test';
import { createClient, type Session } from '@supabase/supabase-js';

import { en } from '../src/i18n/en';
import { he } from '../src/i18n/he';
import { applyLang } from '../src/lib/i18n';

const API_URL = need('E2E_API_URL');
const ANON_KEY = need('E2E_ANON_KEY');
const SERVICE_KEY = need('E2E_SERVICE_KEY');

function need(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set: run the tests with scripts/e2e.sh`);
  return v;
}

// supabase-js keeps the web session in localStorage under sb-<first label of the host>-auth-token
const SESSION_KEY = `sb-${new URL(API_URL).hostname.split('.')[0]}-auth-token`;
const admin = createClient(API_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// The app wraps amounts and names in direction isolates (U+2068/U+2069) and Hebrew amounts carry
// direction marks; spaces can be no-break ones. A test matches the words regardless.
export function loose(text: string) {
  const part = (ch: string) =>
    /\s/.test(ch) ? '\\s' : /[\u200e\u200f]/.test(ch) ? '' : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp([...text].map(part).filter(Boolean).join('[\u2068\u2069\u200e\u200f]*'));
}

export const uniqueEmail = (tag: string) => `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;

// A person with a password (only the sign-in test goes through the emailed code).
export async function newPerson(tag: string) {
  const email = uniqueEmail(tag);
  const password = `pw-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error) throw made.error;
  const client = createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) throw signed.error ?? new Error('no session');
  return { email, client, session: signed.data.session };
}

// A person with a household of their own, set up the way the app does it.
export async function newHousehold(tag: string, name: string, lang: 'en' | 'he') {
  const p = await newPerson(tag);
  const { data, error } = await p.client.rpc('create_household', {
    p_name: name,
    p_base_currency: 'ILS',
    p_display_name: tag,
    p_language: lang,
  });
  if (error) throw error;
  return { ...p, householdId: data as string };
}

// The household's first expense category, with a monthly budget (in agorot).
export async function budgetedCategory(p: Awaited<ReturnType<typeof newHousehold>>, capMinor: number) {
  const { data, error } = await p.client
    .from('categories')
    .select('id,name')
    .eq('household_id', p.householdId)
    .eq('kind', 'expense')
    .order('sort_order')
    .limit(1)
    .single();
  if (error) throw error;
  const set = await p.client.rpc('set_category_budget', { p_category_id: data.id, p_cap_minor: capMinor });
  if (set.error) throw set.error;
  return data as { id: string; name: string };
}

// Opens the app already signed in as this person.
export async function signIn(page: Page, session: Session) {
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [SESSION_KEY, JSON.stringify(session)]);
}

// A valid sign-in code for this address, as the email would carry it (the admin API issues the
// address's current one-time code, so the test needn't read mail).
export async function signInCode(email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  return data.properties.email_otp;
}

type Fixtures = { lang: 'en' | 'he'; t: typeof en };

// Every test gets the run's language and dictionary, and the app opens in that language.
export const test = base.extend<Fixtures>({
  lang: async ({}, use, info) => use(info.project.name === 'he' ? 'he' : 'en'),
  // formatMoney and the dates follow the language, as they do in the app
  t: async ({ lang }, use) => {
    applyLang(lang);
    await use(lang === 'he' ? he : en);
  },
  page: async ({ page, lang }, use) => {
    await page.addInitScript((l) => window.localStorage.setItem('app-language', l), lang);
    await use(page);
  },
});

export { expect };
