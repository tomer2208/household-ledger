/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { envelopeStatus, runsOutOn, wholeUnits } from './envelope';

test('envelopeStatus: fine below 80%, close from 80%, over past the budget', () => {
  assert.equal(envelopeStatus(100000, 79000).state, 'ok');
  assert.equal(envelopeStatus(100000, 80000).state, 'close');
  assert.equal(envelopeStatus(100000, 100000).state, 'close'); // exactly spent is not over
  assert.equal(envelopeStatus(100000, 100100).state, 'over');
  assert.deepEqual(envelopeStatus(90000, 101000), { state: 'over', spent: 101000, cap: 90000, left: -11000, pct: (101000 * 100) / 90000 });
});

test('envelopeStatus: no budget', () => {
  assert.deepEqual(envelopeStatus(null, 34000), { state: 'none', spent: 34000 });
  assert.deepEqual(envelopeStatus(0, 34000), { state: 'none', spent: 34000 });
});

test('runsOutOn: the day a fine envelope empties at this rate', () => {
  // ₪610 of ₪900 by the 12th: ₪50.8 a day, empty on the 18th of 31
  assert.equal(runsOutOn(90000, 61000, 12, 31), 18);
  // on track to last the month: nothing to say
  assert.equal(runsOutOn(320000, 115000, 12, 31), null);
  // close or over already say it in words
  assert.equal(runsOutOn(100000, 85000, 12, 31), null);
  assert.equal(runsOutOn(100000, 120000, 12, 31), null);
  // nothing spent, or no budget
  assert.equal(runsOutOn(100000, 0, 12, 31), null);
  assert.equal(runsOutOn(null, 5000, 12, 31), null);
});

test('wholeUnits rounds what is left down and an overspend away from zero', () => {
  assert.equal(wholeUnits(12345), 12300);
  assert.equal(wholeUnits(-12345), -12400);
  assert.equal(wholeUnits(0), 0);
});
