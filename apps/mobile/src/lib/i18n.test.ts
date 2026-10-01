/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { en } from '../i18n/en';
import { he } from '../i18n/he';
import { applyLang, isLangChoice, isRTL, lang, langFromTags, locale, plural, t } from './i18n';

// Every leaf with its path; functions are called with sample arguments of the right kinds.
function leaves(obj: unknown, path = ''): [string, unknown][] {
  if (obj && typeof obj === 'object') return Object.entries(obj).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  return [[path, obj]];
}
// Each function is called with as many arguments as it takes: a count first (1, 2 and 5, for the
// plural forms), then text; and once with 'left' third, for the left/over branch.
type Fn = (...a: unknown[]) => unknown;
const args = (f: Fn, first: unknown) => [first, 'X', 'left', 'Y'].slice(0, Math.max(1, f.length));
const render = (v: unknown) => (typeof v === 'function' ? (v as Fn)(...args(v as Fn, 3)) : v);
const renderAll = (v: unknown) =>
  typeof v === 'function' ? [1, 2, 5, 'A'].map((first) => (v as Fn)(...args(v as Fn, first))) : [v];

test('Hebrew has exactly the English keys, each of the same kind (P1-6)', () => {
  const e = new Map(leaves(en));
  const h = new Map(leaves(he));
  assert.deepEqual([...h.keys()].sort(), [...e.keys()].sort());
  for (const [k, v] of e) assert.equal(typeof h.get(k), typeof v, k);
});

test('no Hebrew text is empty, English, or broken by a missing argument', () => {
  // Brand and iOS names that are the same in both languages.
  const SAME = new Set(['tx.source.apple_pay']);
  for (const [k, v] of leaves(he)) {
    for (const out of renderAll(v)) {
      assert.equal(typeof out, 'string', k);
      const s = out as string;
      assert.ok(s.trim().length > 0, `${k} is empty`);
      assert.ok(!/undefined|NaN|\[object/.test(s), `${k} renders "${s}"`);
      if (!SAME.has(k) && s.length > 2) assert.ok(/[֐-׿]/.test(s), `${k} has no Hebrew: "${s}"`);
    }
  }
});

test('Hebrew arrows point the way Hebrew reads', () => {
  // "Shortcut Input › Merchant" is the iOS menu path, written as iOS shows it.
  for (const [k, v] of leaves(he)) {
    const s = String(render(v));
    if (k === 'devices.build.3') continue;
    assert.ok(!/[›→]/.test(s), `${k} points left-to-right: "${s}"`);
  }
});

test('applyLang switches every section, and the locale and direction with it', () => {
  applyLang('he');
  assert.equal(lang(), 'he');
  assert.equal(isRTL(), true);
  assert.equal(locale(), 'he-IL');
  assert.equal(t.common.save, 'שמירה');
  assert.equal(t.overview.daysToGo(2), 'עוד יומיים');
  applyLang('en');
  assert.equal(t.common.save, 'Save');
  assert.equal(isRTL(), false);
  assert.equal(locale(), 'en-US');
});

test('the phone language picks Hebrew only for Hebrew', () => {
  assert.equal(langFromTags(['he-IL']), 'he');
  assert.equal(langFromTags(['iw']), 'he');
  assert.equal(langFromTags(['en-US', 'he-IL']), 'en');
  assert.equal(langFromTags(['fr-FR', 'he-IL']), 'he');
  assert.equal(langFromTags(['ru-RU']), 'en');
  assert.equal(langFromTags([]), 'en');
  assert.equal(langFromTags([null, undefined]), 'en');
  assert.ok(isLangChoice('system') && isLangChoice('he') && !isLangChoice('fr') && !isLangChoice(null));
});

test('plural picks one, two and many', () => {
  const days = { one: 'יום אחד', two: 'יומיים', other: '# ימים' };
  assert.equal(plural(1, days), 'יום אחד');
  assert.equal(plural(2, days), 'יומיים');
  assert.equal(plural(5, days), '5 ימים');
  assert.equal(plural(2, { one: '# day', other: '# days' }), '2 days');
});
