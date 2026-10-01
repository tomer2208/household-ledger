/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatMoney, formatSigned, minorToInput, parseMoneyInput } from './money';

test('parseMoneyInput reads what people type', () => {
  assert.equal(parseMoneyInput('45'), 4500);
  assert.equal(parseMoneyInput('45.9'), 4590);
  assert.equal(parseMoneyInput('45,90'), 4590);
  assert.equal(parseMoneyInput('1,234.50'), 123450);
  assert.equal(parseMoneyInput('1.234,50'), 123450);
  assert.equal(parseMoneyInput('₪ 12'), 1200);
});

test('parseMoneyInput refuses what is not a positive amount', () => {
  assert.equal(parseMoneyInput(''), null);
  assert.equal(parseMoneyInput('abc'), null);
  assert.equal(parseMoneyInput('0'), null);
  assert.equal(parseMoneyInput('0.00'), null);
});

test('formatMoney shows cents only when there are some', () => {
  assert.equal(formatMoney(4500, 'ILS'), '₪45');
  assert.equal(formatMoney(4590, 'ILS'), '₪45.90');
  assert.equal(formatMoney(123450, 'USD'), '$1,234.50');
  assert.equal(formatMoney(null, 'ILS'), '₪0');
});

test('formatSigned: a refund reads as money coming back (R4)', () => {
  assert.equal(formatSigned(-9000, 'ILS'), '+₪90');
  assert.equal(formatSigned(9000, 'ILS'), '₪90');
  assert.equal(formatSigned(-1250, 'USD'), '+$12.50');
});

test('minorToInput round-trips through parseMoneyInput', () => {
  for (const v of [4500, 4590, 123450, -9000]) assert.equal(parseMoneyInput(minorToInput(v)), Math.abs(v));
});

test('Hebrew writes money its own way, signs included (P1-6)', async () => {
  const { applyLang } = await import('./i18n');
  applyLang('he');
  try {
    // Intl adds direction marks and a no-break space; compare the visible text.
    const plain = (s: string) => s.replace(/[\u200e\u200f\u061c]/g, '').replace(/\s/g, ' ');
    assert.equal(plain(formatMoney(4500, 'ILS')), '45 ₪');
    assert.equal(plain(formatMoney(123450, 'ILS')), '1,234.50 ₪');
    assert.equal(plain(formatSigned(-9000, 'ILS')), '+90 ₪');
    assert.equal(plain(formatMoney(-4500, 'ILS', { sign: true })), '-45 ₪');
    // typing stays the same in both languages
    assert.equal(parseMoneyInput('1,234.50'), 123450);
    assert.equal(parseMoneyInput(formatMoney(123450, 'ILS')), 123450);
  } finally {
    applyLang('en');
  }
  assert.equal(formatMoney(4500, 'ILS', { sign: true }), '+₪45');
  assert.equal(formatMoney(0, 'ILS', { sign: true }), '₪0');
});
