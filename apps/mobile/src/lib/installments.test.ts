/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { installmentsPaid, splitInstallments } from './installments';

test('splitInstallments matches the server: leftover agorot on payment 1, total exact', () => {
  assert.deepEqual(splitInstallments(100000, 3), { first: 33334, share: 33333 });
  assert.deepEqual(splitInstallments(360000, 12), { first: 30000, share: 30000 });
  for (const [total, n] of [[100001, 7], [99999, 36], [12345, 2], [36, 36]]) {
    const { first, share } = splitInstallments(total, n);
    assert.equal(first + share * (n - 1), total);
    assert.ok(first >= share && first - share < n);
  }
});

test('installmentsPaid counts payments before the next run', () => {
  assert.equal(installmentsPaid('2026-10-01', '2026-11-01', 12), 1);
  assert.equal(installmentsPaid('2026-10-15', '2027-02-15', 12), 4);
  assert.equal(installmentsPaid('2026-01-31', '2026-04-30', 3), 3); // ended: next run past the last
  assert.equal(installmentsPaid('2026-01-31', '2027-01-31', 3), 3); // never more than the count
  assert.equal(installmentsPaid('2026-10-01', null, 6), 6);
});
