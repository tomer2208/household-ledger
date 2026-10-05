/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { batchChanges, keysFor, SYNC_TABLES, TABLE_KEYS } from './cache-sync';

test('a change refreshes only the screens that read its table', () => {
  assert.deepEqual(keysFor(['device_tokens']), ['devices', 'capture_health']);
  assert.deepEqual(keysFor(['agent_proposals']), ['proposals']);
  const tx = keysFor(['transactions'])!;
  for (const k of ['transactions', 'transaction', 'overview', 'pending']) assert.ok(tx.includes(k), k);
  for (const k of ['devices', 'proposals', 'savings', 'household']) assert.ok(!tx.includes(k), k);
});

test('several tables refresh each key once', () => {
  const keys = keysFor(['transactions', 'categories', 'transactions'])!;
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.includes('recurring') && keys.includes('categories'));
});

test('a table it does not know refreshes everything', () => {
  assert.equal(keysFor(['households']), null);
  assert.equal(keysFor(['transactions', 'month_closes']), null);
});

test('every key in the map is a real query key, and every key a table feeds is mapped', () => {
  const src = readFileSync(new URL('../api/queries.ts', import.meta.url), 'utf8');
  const used = new Set([...src.matchAll(/queryKey: \[HH, '([a-z_]+)'/g)].map((m) => m[1]));
  for (const keys of Object.values(TABLE_KEYS)) for (const k of keys) assert.ok(used.has(k), `${k} is not a query key`);
  // Keys no Realtime table feeds: the household itself (members), and AI usage, which the
  // phone only reads on its own screens.
  const unfed = new Set(['household', 'ai_usage', 'agent_runs']);
  const fed = new Set(Object.values(TABLE_KEYS).flat());
  for (const k of used) assert.ok(fed.has(k as never) || unfed.has(k), `${k} is refreshed by no table`);
  assert.equal(SYNC_TABLES.length, 11);
});

test('a burst of changes is one refresh, with every table in it', async () => {
  const flushed: string[][] = [];
  const b = batchChanges((t) => flushed.push(t), 30);
  b.add('transactions');
  b.add('savings_ledger');
  await new Promise((r) => setTimeout(r, 10));
  b.add('transactions');
  assert.equal(flushed.length, 0);
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(flushed, [['transactions', 'savings_ledger']]);
  b.add('device_tokens');
  b.cancel();
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(flushed.length, 1);
});
