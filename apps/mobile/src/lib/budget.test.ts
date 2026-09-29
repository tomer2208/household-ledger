/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { budgetStatus, incomePlan, perDay, shortOfTarget } from './budget';

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
