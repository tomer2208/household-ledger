// Renders agent text: every number in it is a {{path}} into data computed by SQL
// (BLUEPRINT §4.1). Must flatten exactly like supabase/functions/_shared/ai.ts.

import { isolate } from './bidi';
import { formatMoney } from './money';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export function flatten(obj: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => {
      const k = v && typeof v === 'object' && !Array.isArray(v) && typeof (v as any).key === 'string' ? (v as any).key : String(i);
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    });
  } else if (obj && typeof obj === 'object') {
    if (Object.keys(obj).length === 1 && 'money' in (obj as object)) {
      out[prefix] = obj;
      return out;
    }
    for (const [k, v] of Object.entries(obj as Record<string, Json>)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out[prefix] = obj;
  }
  return out;
}

// The last path segment says what kind of number it is; anything else numeric is money.
const COUNT_KEYS = /(^|_)(count|months|times|bills|days|threshold)$|^(over|under)_months$|days_in_month$/;

function format(path: string, v: unknown, currency: string): string {
  if (v && typeof v === 'object' && 'money' in (v as object)) return formatMoney(Number((v as any).money), currency);
  if (typeof v === 'string') return v;
  if (typeof v !== 'number') return '';
  const leaf = path.split('.').pop() ?? '';
  if (leaf === 'pct') return `${v}%`;
  if (COUNT_KEYS.test(leaf)) return String(v);
  return formatMoney(v, currency);
}

// Each value is isolated (P1-6), so "114%" or "₪840" keeps its shape inside a Hebrew sentence
// instead of the % or the sign jumping to the other side.
export function fill(text: string, values: Record<string, unknown>, currency: string): string {
  return text.replace(/\{\{\s*([\w.\-]+)\s*\}\}/g, (_, path: string) =>
    path in values ? isolate(format(path, values[path], currency)) : '—',
  );
}
