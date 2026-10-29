import { test } from 'node:test'
import assert from 'node:assert/strict'
import { manilaScheduleParts, serviceStartsAt } from '../src/lib/nativeServiceForm.ts'

test('native schedule always stores Manila time even on a different device timezone', () => {
  assert.equal(serviceStartsAt('2026-11-01', '12', '30', 'PM'), '2026-11-01T04:30:00.000Z')
  assert.equal(serviceStartsAt('2026-11-01', '12', '00', 'AM'), '2026-10-31T16:00:00.000Z')
  assert.equal(serviceStartsAt('2026-11-01', '4', '45', 'PM'), '2026-11-01T08:45:00.000Z')
})

test('legacy non-quarter schedules can be displayed and retained without rounding', () => {
  const value = '2026-11-01T04:37:00.000Z'
  assert.deepEqual(manilaScheduleParts(value), { date: '2026-11-01', hour: '12', minute: '37', period: 'PM' })
  assert.equal(serviceStartsAt('2026-11-01', '12', '37', 'PM'), value)
})

test('invalid calendar dates and time inputs cannot be silently normalized', () => {
  for (const date of ['2026-02-29', '2026-11-31', '2026-13-01', '11/01/2026']) assert.throws(() => serviceStartsAt(date, '9', '00', 'AM'))
  assert.throws(() => serviceStartsAt('2026-11-01', '13', '00', 'AM'))
  assert.throws(() => serviceStartsAt('2026-11-01', '9', '60', 'AM'))
  assert.throws(() => serviceStartsAt('2026-11-01', '9', '00', 'Evening'))
})
