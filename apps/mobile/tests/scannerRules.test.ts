import assert from 'node:assert/strict'
import test from 'node:test'
import { memberToken, serviceAcceptsCheckIns } from '../src/lib/scannerRules.ts'

test('member token preserves existing QR compatibility and rejects empty or excessive input', () => {
  assert.equal(memberToken(' att:abc-private-token '), 'abc-private-token')
  assert.equal(memberToken('abc-private-token'), 'abc-private-token')
  assert.equal(memberToken('att:'), null)
  assert.equal(memberToken(' '), null)
  assert.equal(memberToken('x'.repeat(1025)), null)
})

test('services allow upcoming/current check-ins and stop exactly at three hours', () => {
  const service = { starts_at: '2026-11-01T12:30:00+08:00', archived_at: null }
  assert.equal(serviceAcceptsCheckIns(service, Date.parse('2026-11-01T11:00:00+08:00')), true)
  assert.equal(serviceAcceptsCheckIns(service, Date.parse('2026-11-01T15:29:59+08:00')), true)
  assert.equal(serviceAcceptsCheckIns(service, Date.parse('2026-11-01T15:30:00+08:00')), false)
  assert.equal(serviceAcceptsCheckIns({ ...service, archived_at: '2026-10-30T00:00:00Z' }), false)
})

test('missing or malformed service schedules fail closed', () => {
  assert.equal(serviceAcceptsCheckIns(null), false)
  assert.equal(serviceAcceptsCheckIns({ starts_at: 'not-a-date' }), false)
  assert.equal(serviceAcceptsCheckIns({ starts_at: '2026-11-01T00:00:00Z' }, NaN), false)
})
