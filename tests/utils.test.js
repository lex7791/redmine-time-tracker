import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoDate, monday, weekDates, formatTime } from '../src/utils.js';

const translate = (key, [value] = []) => ({ hoursShort: `${value}h`, minutesShort: `${value}m`, zeroHours: '0h' })[key];

test('weeks begin on Monday, including for Sunday', () => {
  const start = monday(new Date(2026, 9, 25, 0, 30));
  assert.equal(isoDate(start), '2026-10-19');
  assert.deepEqual(weekDates(start).map(isoDate), ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
});

test('date formatting uses the local calendar date', () => {
  assert.equal(isoDate(new Date(2026, 0, 1, 0, 15)), '2026-01-01');
});

test('time formatting converts hours and units for display', () => {
  assert.equal(formatTime(1.25, translate), '1h 15m');
  assert.equal(formatTime('30m', translate), '30m');
  assert.equal(formatTime(0, translate), '0h');
});
