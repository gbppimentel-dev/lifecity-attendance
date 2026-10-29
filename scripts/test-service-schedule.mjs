import assert from 'node:assert/strict'
import test from 'node:test'
import { addCalendarDays, calendarDate, isoDate, manilaToday, moveCalendarMonth, parseServiceDate, parseServiceTime, quarterTime, nextQuarterTime } from '../src/lib/serviceSchedule.ts'

test('calendar dates reject nonexistent days and preserve leap days', () => {
  assert.equal(parseServiceDate('2026-02-29'), null)
  assert.equal(parseServiceDate('2026-04-31'), null)
  assert.equal(isoDate(parseServiceDate('2024-02-29')), '2024-02-29')
})

test('moving between months clamps the day rather than skipping a month', () => {
  assert.equal(isoDate(moveCalendarMonth(calendarDate(2026, 0, 31), 1)), '2026-02-28')
  assert.equal(isoDate(moveCalendarMonth(calendarDate(2024, 0, 31), 1)), '2024-02-29')
  assert.equal(isoDate(moveCalendarMonth(calendarDate(2026, 11, 31), 1)), '2027-01-31')
})

test('day navigation crosses month and year boundaries without timezone shifts', () => {
  assert.equal(isoDate(addCalendarDays(calendarDate(2026, 11, 31), 1)), '2027-01-01')
  assert.equal(isoDate(addCalendarDays(calendarDate(2026, 0, 1), -1)), '2025-12-31')
})

test('Today uses the Manila calendar date near UTC midnight', () => {
  assert.equal(isoDate(manilaToday(new Date('2026-10-28T17:00:00Z'))), '2026-10-29')
})

test('midnight and noon retain their distinct 24-hour values', () => {
  assert.equal(quarterTime(12, '00', 'AM'), '00:00')
  assert.equal(quarterTime(12, '00', 'PM'), '12:00')
  assert.equal(quarterTime(1, '45', 'PM'), '13:45')
})

test('new times allow only quarter-hour minutes', () => {
  assert.equal(quarterTime(9, '15', 'AM'), '09:15')
  assert.equal(quarterTime(9, '30', 'AM'), '09:30')
  assert.equal(quarterTime(9, '41', 'AM'), null)
  assert.equal(quarterTime(0, '00', 'AM'), null)
})

test('legacy off-quarter times can be displayed without silently rounding', () => {
  assert.deepEqual(parseServiceTime('10:41'), { hour: 10, minute: '41', period: 'AM' })
  assert.deepEqual(parseServiceTime('23:59'), { hour: 11, minute: '59', period: 'PM' })
  assert.equal(parseServiceTime('24:00'), null)
  assert.equal(parseServiceTime('11:60'), null)
})

test('the suggested quarter hour rounds forward, including midnight rollover', () => {
  assert.deepEqual(nextQuarterTime(new Date('2026-10-29T02:41:00Z')), { hour: 10, minute: '45', period: 'AM' })
  assert.deepEqual(nextQuarterTime(new Date('2026-10-29T15:59:00Z')), { hour: 12, minute: '00', period: 'AM' })
})
