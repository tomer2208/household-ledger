// The only place that turns minor units into text. Math never happens here: every
// total the app shows comes from SQL (BLUEPRINT §4.1), this file only formats.

export function formatMoney(minor: number | null | undefined, currency: string, opts: { cents?: boolean } = {}) {
  const value = (minor ?? 0) / 100;
  const showCents = opts.cents ?? value % 1 !== 0;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: showCents ? 2 : 0,
      maximumFractionDigits: showCents ? 2 : 0,
    }).format(value);
  } catch {
    return `${value.toFixed(showCents ? 2 : 0)} ${currency}`;
  }
}

// "45", "45.9", "45,90", "1,234.50" → minor units. Null when it isn't a positive amount.
export function parseMoneyInput(text: string): number | null {
  const t = text.replace(/[^\d.,]/g, '');
  if (!/\d/.test(t)) return null;
  const lastSep = Math.max(t.lastIndexOf('.'), t.lastIndexOf(','));
  let whole = t;
  let frac = '';
  if (lastSep >= 0 && t.length - lastSep - 1 <= 2) {
    whole = t.slice(0, lastSep);
    frac = t.slice(lastSep + 1);
  }
  whole = whole.replace(/[.,]/g, '');
  const minor = Number(whole || '0') * 100 + Number((frac + '00').slice(0, 2));
  return Number.isFinite(minor) && minor > 0 ? minor : null;
}

export function minorToInput(minor: number): string {
  const v = Math.abs(minor) / 100;
  return v % 1 === 0 ? String(v) : v.toFixed(2);
}

export const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP'] as const;
