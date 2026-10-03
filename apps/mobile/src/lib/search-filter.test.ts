/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  activeGroups,
  EMPTY_FILTER,
  filterFromParams,
  filterToParams,
  isEmptyFilter,
  presetMonths,
  serverFilter,
  toggleIn,
  withoutPeriod,
} from './search-filter';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

test('Overview links (category, month) still open that category in that month', () => {
  const f = filterFromParams({ category: A, month: '2026-08-15' });
  assert.deepEqual(f.categories, [A]);
  assert.equal(f.period, 'month');
  assert.equal(f.month, '2026-08-01');
  assert.deepEqual(serverFilter(f, '', '2026-10-03'), { categories: [A], month_from: '2026-08-01', month_to: '2026-08-01' });
});

test('params round-trip, and unused keys are cleared', () => {
  const f = {
    ...EMPTY_FILTER,
    categories: [A, B],
    period: 'custom' as const,
    from: '2026-01-01',
    to: '2026-02-15',
    min: 5000,
    members: [B],
    sources: ['apple_pay' as const],
    kind: 'refund' as const,
  };
  const p = filterToParams(f);
  assert.equal(p.month, undefined);
  assert.equal(p.max, undefined);
  assert.deepEqual(filterFromParams(Object.fromEntries(Object.entries(p).filter(([, v]) => v)) as never), f);
  assert.deepEqual(filterFromParams({}), EMPTY_FILTER);
  assert.ok(Object.values(filterToParams(EMPTY_FILTER)).every((v) => v === undefined));
});

test('malformed params are dropped, never sent', () => {
  const f = filterFromParams({
    category: `${A},nope,${A}`,
    period: 'forever',
    min: '-5',
    max: '1e9',
    who: 'x',
    source: 'card,manual',
    kind: 'all',
    from: '2026-13',
  });
  assert.deepEqual(f, { ...EMPTY_FILTER, categories: [A], sources: ['manual'] });
});

test('presets are budget months ending with the current one', () => {
  assert.deepEqual(presetMonths('this_month', '2026-01-31'), { from: '2026-01-01', to: '2026-01-01' });
  assert.deepEqual(presetMonths('last_month', '2026-01-31'), { from: '2025-12-01', to: '2025-12-01' });
  assert.deepEqual(presetMonths('3_months', '2026-02-10'), { from: '2025-12-01', to: '2026-02-01' });
  assert.deepEqual(presetMonths('this_year', '2026-10-03'), { from: '2026-01-01', to: '2026-10-01' });
});

test('serverFilter sends only what is set; amounts typed backwards still mean the range', () => {
  assert.deepEqual(serverFilter(EMPTY_FILTER, '  '), {});
  assert.deepEqual(serverFilter({ ...EMPTY_FILTER, min: 50000, max: 10000 }, ' cafe '), { q: 'cafe', min: 10000, max: 50000 });
  assert.deepEqual(serverFilter({ ...EMPTY_FILTER, period: 'custom', from: '2026-05-01' }, ''), { from: '2026-05-01' });
});

test('toggles, counts and clearing', () => {
  let f = toggleIn.categories(EMPTY_FILTER, A);
  f = toggleIn.categories(f, B);
  f = toggleIn.categories(f, A);
  assert.deepEqual(f.categories, [B]);
  f = { ...f, period: 'this_year', min: 100 };
  assert.equal(activeGroups(f), 3);
  assert.equal(isEmptyFilter(withoutPeriod({ ...EMPTY_FILTER, period: 'this_year' })), true);
  assert.equal(isEmptyFilter(f), false);
});
