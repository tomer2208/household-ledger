/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { budgetStatus, forecastSummary, headingToSavings, trendSummary, incomePlan, perDay, shortOfTarget, suggestBudgets, SUGGESTED_SHARE_PCT } from './budget';

test('budgetStatus: left, over, no budget', () => {
  assert.deepEqual(budgetStatus(200000, 138000), { kind: 'left', spent: 138000, cap: 200000, amount: 62000, pct: 69 });
  assert.deepEqual(budgetStatus(80000, 89000), { kind: 'over', spent: 89000, cap: 80000, amount: 9000, pct: 111 });
  assert.deepEqual(budgetStatus(null, 34000), { kind: 'none', spent: 34000 });
  assert.deepEqual(budgetStatus(0, 34000), { kind: 'none', spent: 34000 });
});

test('perDay splits what is left over the days to go, rounded down to whole units', () => {
  assert.equal(perDay(150000, 2), 75000);
  assert.equal(perDay(100000, 3), 33300);
  assert.equal(perDay(150000, 0), 150000); // never divides by zero
});

test('incomePlan: unassigned income is planned savings', () => {
  const p = incomePlan(1000000, 750000);
  assert.equal(p.kind, 'unassigned');
  assert.equal(p.unassigned, 250000);
  assert.equal(p.savingsPct, 25);
  assert.equal(p.health, 'good');
  assert.equal(shortOfTarget(p), 0);
});

test('incomePlan: thin and over', () => {
  const thin = incomePlan(1000000, 950000);
  assert.equal(thin.kind !== 'none' && thin.health, 'thin');
  assert.equal(shortOfTarget(thin), 150000); // 20% of 10,000 = 2,000; 500 already unassigned
  const over = incomePlan(1000000, 1100000);
  assert.equal(over.kind, 'over');
  assert.equal(over.health, 'over');
  assert.equal(incomePlan(null, 5).kind, 'none');
});

test('suggestBudgets: shares of income, rounded down to ₪50, 20% left for savings (P1-7)', () => {
  const names = Object.keys(SUGGESTED_SHARE_PCT);
  const s = suggestBudgets(1500000, names); // ₪15,000
  assert.equal(s.house, 450000); // Housing
  assert.equal(s.cart, 180000); // Groceries
  assert.equal(s['arrow.triangle.2.circlepath'], 15000); // Subscriptions
  const total = Object.values(s).reduce((a, b) => a + b, 0);
  assert.ok(total <= 1200000, `total ${total} is at most 80% of income`);
  assert.ok(Object.values(s).every((v) => v % 5000 === 0));
  // an odd income rounds every line down, never up
  const odd = suggestBudgets(1234567, names);
  assert.equal(odd.house, 370000); // 30% = 3,703.70 → 3,700
  assert.ok(Object.values(odd).reduce((a, b) => a + b, 0) <= 1234567 * 0.8);
  // unknown categories start empty; no income, no suggestions
  assert.deepEqual(suggestBudgets(1500000, ['pawprint']), {});
  assert.deepEqual(suggestBudgets(null, names), {});
  assert.deepEqual(suggestBudgets(0, names), {});
});

test('forecastSummary: over, under, no budgets, nothing to go on', () => {
  const f = { total: 864000, spent: 300000, upcoming: 500000 };
  assert.deepEqual(forecastSummary(f, 800000), { kind: 'over', amount: 64000, total: 864000 });
  assert.deepEqual(forecastSummary(f, 1000000), { kind: 'under', amount: 136000, total: 864000 });
  assert.deepEqual(forecastSummary(f, 864000), { kind: 'under', amount: 0, total: 864000 });
  assert.deepEqual(forecastSummary(f, 0), { kind: 'spend', total: 864000 });
  assert.equal(forecastSummary({ total: 0, spent: 0, upcoming: 0 }, 800000), null);
  assert.equal(forecastSummary(null, 800000), null);
});

test('trendSummary: this month against the average of the months before', () => {
  const m = (spent: number) => ({ month: '2026-01-01', spent, cap: null });
  assert.deepEqual(trendSummary([m(100000), m(140000), m(120000), m(156000)]), { now: 156000, avg: 120000, pct: 30 });
  assert.deepEqual(trendSummary([m(0), m(0), m(50000)]), { now: 50000, avg: 0, pct: null });
  assert.deepEqual(trendSummary([m(50000)]), { now: 50000, avg: 0, pct: null });
  assert.deepEqual(trendSummary([]), { now: 0, avg: 0, pct: null });
});

test('headingToSavings: a rollover category keeps its remainder; an overspend carries unless turned off', () => {
  const cat = (id: string, cap: number | null, spent: number, rollover: boolean, base_cap = cap) => ({ id, cap, base_cap, spent, rollover });
  // net = (1,300 + 500 + 400) − (700 + 600 + 100) = 800; unassigned 8,100
  const o = {
    net: 80000,
    unassigned: 810000,
    categories: [
      cat('g', 130000, 70000, true, 100000), // 600 left, rolls over
      cat('f', 50000, 60000, true), // 100 over
      cat('s', 40000, 10000, false), // 300 left, to savings
      cat('k', null, 5000, true), // no budget: nothing carries
    ],
  };
  // f's overspend carries: savings get 8,900 − 600 + 100
  assert.equal(headingToSavings(o, () => true), 890000 - 60000 + 10000);
  // f's overspend is covered by savings
  assert.equal(headingToSavings(o, (id) => id !== 'f'), 890000 - 60000);
  // nothing rolls over: the same as before P1-14
  assert.equal(headingToSavings({ ...o, categories: o.categories.map((c) => ({ ...c, rollover: false })) }, () => true), 890000);
});
