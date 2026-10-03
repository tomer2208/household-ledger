/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { QueryClient } from '@tanstack/query-core';

import type { Overview, Transaction } from '../api/types';
import { adjustOverview, applyTxChange, findTx, insertIntoPages, restoreTxCaches, spendOf } from './optimistic';

const tx = (id: string, at: string, over: Partial<Transaction> = {}): Transaction =>
  ({
    id, title: id, raw_merchant: null, amount_minor: 1000, currency: 'ILS', amount_base_minor: 1000, fx_rate: 1, fx_source: 'identity',
    occurred_at: at, budget_month: at.slice(0, 7) + '-01', status: 'confirmed', source: 'manual', category_id: 'food', note: null,
    card_label: null, created_by: 'u', recurring_rule_id: null, classification: null, categories: { name: 'Food', sf_symbol: 'cart' },
    ...over,
  }) as Transaction;

const overview = (): Overview => ({
  month: '2026-10-01', closed: false, currency: 'ILS', income: null, unassigned: null, total_cap: 10000, total_spent: 3000, net: 7000,
  savings_balance: 0, pending_review: 1,
  categories: [
    { id: 'food', name: 'Food', sf_symbol: 'cart', cap: 10000, spent: 3000, pct: 30, no_budget: false },
    { id: 'fun', name: 'Fun', sf_symbol: 'star', cap: null, spent: 0, pct: null, no_budget: true },
  ],
});

const pages = (...ps: Transaction[][]) => ({ pages: ps, pageParams: ps.map(() => null) });
const ids = (d: { pages: Transaction[][] }) => d.pages.map((p) => p.map((x) => x.id));

test('a new expense lands in date order, and waits for paging if it is older than what is loaded', () => {
  const d = pages([tx('c', '2026-10-03T10:00:00Z'), tx('a', '2026-10-01T10:00:00Z')]);
  assert.deepEqual(ids(insertIntoPages(d, tx('b', '2026-10-02T10:00:00Z'), true)), [['c', 'b', 'a']]);
  assert.deepEqual(ids(insertIntoPages(d, tx('z', '2026-09-01T10:00:00Z'), true)), [['c', 'a']]);
  assert.deepEqual(ids(insertIntoPages(d, tx('z', '2026-09-01T10:00:00Z'), false)), [['c', 'a', 'z']]);
  assert.deepEqual(ids(insertIntoPages(pages([]), tx('n', '2026-10-03T10:00:00Z'), false)), [['n']]);
});

test('Overview moves with the expense: bars, totals and the review count', () => {
  const added = adjustOverview(overview(), null, spendOf(tx('n', '2026-10-02T10:00:00Z', { amount_base_minor: 2000 })));
  assert.equal(added.total_spent, 5000);
  assert.equal(added.net, 5000);
  assert.deepEqual([added.categories[0].spent, added.categories[0].pct], [5000, 50]);

  // moved to another category: out of one bar, into the other
  const before = tx('m', '2026-10-02T10:00:00Z');
  const moved = adjustOverview(overview(), spendOf(before), spendOf({ ...before, category_id: 'fun' }));
  assert.deepEqual([moved.categories[0].spent, moved.categories[1].spent, moved.total_spent], [2000, 1000, 3000]);

  // another month's Overview is untouched; deleting an item to review lowers the count
  assert.deepEqual(adjustOverview(overview(), spendOf(tx('o', '2026-09-02T10:00:00Z')), null), overview());
  assert.equal(adjustOverview(overview(), spendOf(tx('p', '2026-10-02T10:00:00Z', { status: 'pending_review' })), null).pending_review, 0);
});

test('applyTxChange: delete everywhere, add to the plain list only, and a snapshot puts it all back', () => {
  const qc = new QueryClient();
  const a = tx('a', '2026-10-02T10:00:00Z');
  const b = tx('b', '2026-10-01T10:00:00Z', { status: 'pending_review' });
  qc.setQueryData(['hh', 'transactions', {}], pages([a, b]));
  qc.setQueryData(['hh', 'transactions', { q: 'x' }], pages([b]));
  qc.setQueryData(['hh', 'transactions', 'summary', {}], { count: 2 });
  qc.setQueryData(['hh', 'overview', 'current'], overview());
  qc.setQueryData(['hh', 'pending'], [b]);
  const snapshot = qc.getQueriesData({ queryKey: ['hh'] });

  assert.equal(findTx(qc, 'b')?.id, 'b');
  applyTxChange(qc, b, null);
  assert.deepEqual(ids(qc.getQueryData(['hh', 'transactions', {}])!), [['a']]);
  assert.deepEqual(ids(qc.getQueryData(['hh', 'transactions', { q: 'x' }])!), [[]]);
  assert.deepEqual(qc.getQueryData(['hh', 'pending']), []);
  assert.equal(qc.getQueryData<Overview>(['hh', 'overview', 'current'])!.total_spent, 2000);
  assert.deepEqual(qc.getQueryData(['hh', 'transactions', 'summary', {}]), { count: 2 }); // left to the refresh

  const n = tx('n', '2026-10-03T10:00:00Z');
  applyTxChange(qc, null, n);
  assert.deepEqual(ids(qc.getQueryData(['hh', 'transactions', {}])!), [['n', 'a']]);
  assert.deepEqual(ids(qc.getQueryData(['hh', 'transactions', { q: 'x' }])!), [[]]); // the server decides a filter

  applyTxChange(qc, n, { ...n, title: 'renamed', amount_minor: 500, amount_base_minor: 500 });
  assert.equal(findTx(qc, 'n')?.title, 'renamed');
  assert.equal(qc.getQueryData<Overview>(['hh', 'overview', 'current'])!.total_spent, 2500);

  restoreTxCaches(qc, snapshot);
  assert.deepEqual(ids(qc.getQueryData(['hh', 'transactions', {}])!), [['a', 'b']]);
  assert.deepEqual(qc.getQueryData(['hh', 'overview', 'current']), overview());
});
