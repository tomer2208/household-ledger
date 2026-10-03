import { lang, t } from './i18n';

// P1-6: what a failed request says to a person, in their language. The server's messages
// (raise exception in supabase/migrations) are written for developers in English; each known
// one maps to a sentence here. errors.test.ts fails when a migration adds a message this
// list doesn't know. Anything else reads as the generic line in Hebrew, and as itself in
// English, where it is at least readable.

type Rule = [RegExp, (m: RegExpMatchArray) => string];

const SERVER: Rule[] = [
  [/^not signed in$/, () => t.errors.notSignedIn],
  [/^not a member of (any|this) household$/, () => t.errors.notMember],
  [/^already a member of a household$/, () => t.errors.alreadyMember],
  [/^use leave_household to leave$/, () => t.errors.useLeave],
  [/^invalid or expired invite code$/, () => t.errors.badInvite],
  [/^too many invite attempts, try again later$/, () => t.errors.tooManyInvites],
  [/^unknown time zone$/, () => t.errors.badTimeZone],
  [/^currency must be a three-letter code$/, () => t.errors.badCurrency],
  [/^base currency is locked after the first transaction$/, () => t.errors.currencyLocked],
  [/^unknown category( .+)?$/, () => t.errors.unknownCategory],
  [/^category name too long$/, () => t.errors.categoryNameLong],
  [/^a category appears twice$/, () => t.errors.categoryTwice],
  [/^the Savings category cannot be deleted$/, () => t.errors.savingsDelete],
  [/^(Savings cannot hold expenses|transactions cannot use the Savings category)$/, () => t.errors.savingsExpense],
  [/^recurring rules cannot use the Savings category$/, () => t.errors.savingsRecurring],
  [/^move or pause (\d+) recurring expense\(s\) first$/, (m) => t.errors.recurringBlocks(Number(m[1]))],
  [/^send exactly one of category_name or new_category_name$/, () => t.errors.oneCategory],
  [/^(transaction not found|unknown expense)$/, () => t.errors.expenseGone],
  [/^proposal not found$/, () => t.errors.proposalGone],
  [/^budgets of closed months are locked$/, () => t.errors.budgetsLocked],
  [/^income of closed months is locked$/, () => t.errors.incomeLocked],
  [/^income must be zero or more$/, () => t.errors.incomeNegative],
  [/^budgets must be a list$/, () => t.errors.generic],
  [/^language must be en or he$/, () => t.errors.generic],
  [/^every budget must be a whole amount of zero or more$/, () => t.errors.budgetWhole],
  [/^amount and reason are required$/, () => t.errors.amountReason],
  [/^manual fx_rate must be positive$/, () => t.errors.fxPositive],
  [/^no exchange rate for (\w+) to (\w+)$/, (m) => t.errors.noRate(m[1], m[2])],
  [/^reports are written for closed months$/, () => t.errors.reportOpenMonth],
  [/^a refund cannot be split into installments$/, () => t.errors.refundSplit],
  [/^installments must be between 2 and 36$/, () => t.errors.installmentRange],
  [/^this expense is already part of a recurring payment$/, () => t.errors.alreadyRecurring],
  [/^the amount is too small for that many payments$/, () => t.errors.tooSmallSplit],
];

// The browser and the auth server, which speak for themselves.
const NETWORK = /failed to fetch|network request failed|load failed|networkerror|network error/i;
const CLIENT: Rule[] = [
  [NETWORK, () => t.errors.network],
  [/invalid login credentials/i, () => t.errors.badLogin],
  [/token has expired or is invalid|otp.*expired/i, () => t.errors.codeExpired],
  [/rate limit|only request this after|too many requests/i, () => t.errors.tooMany],
  [/email not confirmed/i, () => t.errors.emailNotConfirmed],
  // PostgREST's "no such row" for a single item (PGRST116): usually deleted meanwhile
  [/multiple \(or no\) rows returned/i, () => t.errors.notFound],
];

export const SERVER_RULES = SERVER.map(([re]) => re);

export function errorMessage(e: unknown): string {
  const raw = (e instanceof Error ? e.message : typeof e === 'string' ? e : '').trim();
  for (const [re, say] of [...SERVER, ...CLIENT]) {
    const m = raw.match(re);
    if (m) return say(m);
  }
  return lang() === 'en' && raw ? raw : t.errors.generic;
}

// P1-12: which failed reads are worth asking again. A network blip or a busy server often
// clears up; a refusal from the database (a known message above) or a missing permission
// will say the same thing every time, so retrying only delays the message.
const PERMANENT = /permission denied|not authorized|jwt|row-level security/i;
// With a code, it decides: lost connection (08), out of resources (53), a timeout or restart
// (57), a conflict between transactions (40), or PostgREST unable to reach the database
// (PGRST000-003) can pass; anything else (bad input, not found, no permission) won't.
const TRANSIENT_CODE = /^(08|53|57|40)|^PGRST00[0-3]$/;

export function isTransient(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && code) return TRANSIENT_CODE.test(code);
  const raw = (e instanceof Error ? e.message : typeof e === 'string' ? e : '').trim();
  if (NETWORK.test(raw)) return true; // the network itself failed
  if (SERVER.some(([re]) => re.test(raw))) return false;
  return !PERMANENT.test(raw);
}

// TanStack Query's retry policy for reads: up to 3 more tries for transient errors only,
// waiting 1s, 2s, 4s (capped at 8s) so a struggling server isn't hammered.
export const MAX_RETRIES = 3;
export const shouldRetry = (failures: number, e: unknown) => failures < MAX_RETRIES && isTransient(e);
export const retryDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 8000);
