/// <reference types="node" />
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { errorMessage } from './errors';
import { applyLang, t } from './i18n';

// Every message a migration can raise, with its % placeholders filled in.
function serverMessages(): string[] {
  const dir = resolve(process.cwd(), '../../supabase/migrations');
  const out = new Set<string>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql'))) {
    for (const m of readFileSync(resolve(dir, f), 'utf8').matchAll(/raise exception '([^']+)'/g)) {
      if (m[1].startsWith('TEST_')) continue;
      out.add(m[1].includes('%') ? m[1].replace(/%(?= recurring)/, '2').replace(/%/g, 'USD') : m[1]);
    }
  }
  return [...out];
}

// Raised only when the app itself sends a malformed request, never by something a person does,
// or (the last) only while a migration runs.
const INTERNAL = new Set([
  'budgets must be a list',
  'language must be en or he',
  'bad search filter',
  'not an object',
  'report_metrics is not the expected version',
]);

test('every error the server can raise reads as a Hebrew sentence (P1-6)', () => {
  const messages = serverMessages();
  assert.ok(messages.length >= 30, `found ${messages.length} messages`);
  applyLang('he');
  try {
    for (const m of messages) {
      const said = errorMessage(new Error(m));
      assert.ok(/[֐-׿]/.test(said), `"${m}" → "${said}"`);
      // Only a message no person can cause from the app falls back to the generic line.
      if (!INTERNAL.has(m)) assert.notEqual(said, t.errors.generic, `"${m}" has no sentence of its own`);
    }
  } finally {
    applyLang('en');
  }
});

test('errors keep their details and fall back sensibly', () => {
  applyLang('he');
  try {
    assert.equal(errorMessage(new Error('no exchange rate for USD to ILS')), t.errors.noRate('USD', 'ILS'));
    assert.equal(errorMessage(new Error('move or pause 3 recurring expense(s) first')), t.errors.recurringBlocks(3));
    assert.equal(errorMessage(new TypeError('Failed to fetch')), t.errors.network);
    assert.equal(errorMessage(new Error('Load failed')), t.errors.network);
    assert.equal(errorMessage(new Error('JSON object requested, multiple (or no) rows returned')), t.errors.notFound);
    assert.equal(errorMessage(new Error('duplicate key value violates unique constraint')), t.errors.generic);
    assert.equal(errorMessage(null), t.errors.generic);
  } finally {
    applyLang('en');
  }
  // In English an unknown message is still readable text, so it is shown as it is.
  assert.equal(errorMessage(new Error('duplicate key value')), 'duplicate key value');
  assert.equal(errorMessage(new Error('budgets of closed months are locked')), t.errors.budgetsLocked);
  assert.equal(errorMessage('Invalid login credentials'), t.errors.badLogin);
});

test('reads are retried only when another try could help (P1-12)', async () => {
  const { isTransient, shouldRetry, retryDelay, MAX_RETRIES } = await import('./errors');
  // the network, a timeout, a busy server: worth another try
  assert.equal(isTransient(new TypeError('Failed to fetch')), true);
  assert.equal(isTransient(new Error('Load failed')), true);
  assert.equal(isTransient(new Error('canceling statement due to statement timeout')), true);
  assert.equal(isTransient(new Error('upstream connect error')), true);
  // a refusal says the same thing every time
  assert.equal(isTransient(new Error('budgets of closed months are locked')), false);
  assert.equal(isTransient(new Error('not a member of any household')), false);
  assert.equal(isTransient(new Error('permission denied for table households')), false);
  assert.equal(isTransient(new Error('JWT expired')), false);
  // the code decides when there is one
  const withCode = (code: string) => Object.assign(new Error('x'), { code });
  assert.equal(isTransient(withCode('PGRST116')), false); // no such row
  assert.equal(isTransient(withCode('42501')), false); // no permission
  assert.equal(isTransient(withCode('22023')), false); // bad input
  assert.equal(isTransient(withCode('57014')), true); // statement timeout
  assert.equal(isTransient(withCode('08006')), true); // connection lost
  assert.equal(isTransient(withCode('PGRST003')), true); // PostgREST timed out reaching the database
  // at most three more tries, waiting 1s, 2s, 4s, never more than 8s
  assert.equal(MAX_RETRIES, 3);
  assert.deepEqual([0, 1, 2].map((n) => shouldRetry(n, new Error('Failed to fetch'))), [true, true, true]);
  assert.equal(shouldRetry(3, new Error('Failed to fetch')), false);
  assert.equal(shouldRetry(0, new Error('JWT expired')), false);
  assert.deepEqual([0, 1, 2, 3, 4].map(retryDelay), [1000, 2000, 4000, 8000, 8000]);
});
