/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { budgetStatus, incomePlan, perDay, shortOfTarget, suggestBudgets, SUGGESTED_SHARE_PCT } from './budget';

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
  assert.equal(s.Housing, 450000);
  assert.equal(s.Groceries, 180000);
  assert.equal(s.Subscriptions, 15000);
  const total = Object.values(s).reduce((a, b) => a + b, 0);
  assert.ok(total <= 1200000, `total ${total} is at most 80% of income`);
  assert.ok(Object.values(s).every((v) => v % 5000 === 0));
  // an odd income rounds every line down, never up
  const odd = suggestBudgets(1234567, names);
  assert.equal(odd.Housing, 370000); // 30% = 3,703.70 → 3,700
  assert.ok(Object.values(odd).reduce((a, b) => a + b, 0) <= 1234567 * 0.8);
  // unknown categories start empty; no income, no suggestions
  assert.deepEqual(suggestBudgets(1500000, ['Pets']), {});
  assert.deepEqual(suggestBudgets(null, names), {});
  assert.deepEqual(suggestBudgets(0, names), {});
});
