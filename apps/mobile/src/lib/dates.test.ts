/// <reference types="node" />
// Run: npm test (runs this file under three phone time zones: the household clock must win).
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import * as D from './dates';

// Intl may put a narrow no-break space before AM/PM; compare text, not whitespace flavour.
const text = (s: string) => s.replace(/\s/g, ' ');

afterEach(() => D.setAppTimeZone(null));
const onIsrael = () => D.setAppTimeZone('Asia/Jerusalem');

test('the day follows the household clock, not the phone', () => {
  onIsrael();
  // 20:00 on 30.09 in New York = 03:00 on 1.10 in Israel
  const nyEvening = new Date('2026-10-01T00:00:00Z');
  assert.equal(D.ymd(nyEvening), '2026-10-01');
  assert.equal(D.monthPace(nyEvening), 3);
  assert.equal(D.daysToGo(nyEvening), 31);
  assert.equal(D.daysToGo(new Date('2026-09-30T09:00:00Z')), 1);
});

test('onDay keeps the wall-clock time and lands on the chosen day', () => {
  onIsrael();
  const t = D.onDay('2026-09-30', new Date('2026-09-30T21:30:00Z')); // 00:30 on 1.10 in Israel
  assert.equal(t, '2026-09-29T21:30:00.000Z');
  assert.equal(D.ymd(new Date(t)), '2026-09-30');
});

test('onDay across the end of summer time (25.10.2026)', () => {
  onIsrael();
  assert.equal(D.onDay('2026-10-26', new Date('2026-10-20T11:00:00Z')), '2026-10-26T12:00:00.000Z'); // 14:00 IST
  assert.equal(D.onDay('2026-10-20', new Date('2026-10-26T12:00:00Z')), '2026-10-20T11:00:00.000Z'); // 14:00 IDT
});

test('calendar arithmetic', () => {
  assert.equal(D.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(D.addDays('2026-10-01', -1), '2026-09-30');
  assert.equal(D.monthOfDay('2026-09-30'), '2026-09-01');
  onIsrael();
  assert.equal(D.monthPace(new Date('2028-02-29T10:00:00Z')), 100);
});

test('labels', () => {
  onIsrael();
  assert.equal(D.monthLabel('2026-10-01'), 'October 2026');
  assert.equal(D.shortDate('2026-10-01'), 'Oct 1, 2026'); // a date-only string never shifts a day
  assert.equal(text(D.timeLabel('2026-09-30T21:30:00Z')), '12:30 AM');
  assert.equal(D.dayChipLabel('2026-08-30'), 'Sun, Aug 30');
});

test('addMonths and monthOfInstant (P1-5)', () => {
  assert.equal(D.addMonths('2026-09-01', -1), '2026-08-01');
  assert.equal(D.addMonths('2026-01-01', -1), '2025-12-01');
  assert.equal(D.addMonths('2026-12-01', 1), '2027-01-01');
  assert.equal(D.addMonths('2026-03-01', -13), '2025-02-01');
  onIsrael();
  // 23:30 on 31.08 in Israel is still August; 00:10 on 1.09 is September
  assert.equal(D.monthOfInstant(new Date('2026-08-31T20:30:00Z')), '2026-08-01');
  assert.equal(D.monthOfInstant(new Date('2026-08-31T21:10:00Z')), '2026-09-01');
});

test('without a household zone it follows the phone', () => {
  assert.equal(D.appTimeZone(), Intl.DateTimeFormat().resolvedOptions().timeZone);
});

test('Hebrew labels, same clock arithmetic (P1-6)', async () => {
  const { applyLang } = await import('./i18n');
  onIsrael();
  applyLang('he');
  try {
    assert.equal(D.monthLabel('2026-10-01'), 'אוקטובר 2026');
    assert.equal(D.shortDate('2026-10-01'), '1 באוק׳ 2026');
    assert.equal(text(D.timeLabel('2026-09-30T21:30:00Z')), '0:30');
    assert.equal(D.dayLabel(new Date().toISOString()), 'היום');
    assert.equal(D.dayLabel(new Date(Date.now() - 86_400_000).toISOString()), 'אתמול');
    // the arithmetic reads en-US parts, so it gives the same answers in Hebrew
    assert.equal(D.ymd(new Date('2026-10-01T00:00:00Z')), '2026-10-01');
    assert.equal(D.onDay('2026-10-26', new Date('2026-10-20T11:00:00Z')), '2026-10-26T12:00:00.000Z');
    assert.equal(D.monthPace(new Date('2026-10-01T00:00:00Z')), 3);
  } finally {
    applyLang('en');
  }
  assert.equal(D.monthLabel('2026-10-01'), 'October 2026');
});
