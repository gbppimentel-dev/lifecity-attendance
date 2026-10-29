import assert from 'node:assert/strict'
import test from 'node:test'
import { removeAttendanceWithUndo } from '../src/lib/attendanceActions.ts'

const saved = () => ({
  id: 'attendance-1', member_id: 'member-1', event_id: 'service-1',
  checked_in_at: '2026-09-06T08:04:00+00:00', created_at: '2026-09-06T08:04:00+00:00',
  status: 'corrected', notes: 'Original note', scanned_by: 'admin-1',
  report_snapshot: { member_name: 'Saved Name', service_name: 'Saved Service', ministries: [{ id: 'ministry-1', name: 'Saved Ministry' }], version: 3 },
})
function fixture({ remove, restore } = {}) {
  const calls = []
  const client = { async rpc(name, args) {
    calls.push(structuredClone({ name, args }))
    if (name === 'lc_remove_attendance_with_undo') return remove ? await remove(args) : { data: { attendance: saved(), undo_token: 'receipt-1' }, error: null }
    assert.equal(name, 'lc_restore_attendance')
    return restore ? await restore(args) : { data: saved(), error: null }
  } }
  return { client, calls }
}

test('removal retains original columns and Undo sends only the server receipt', async () => {
  const { client, calls } = fixture()
  const result = await removeAttendanceWithUndo(client, 'attendance-1')
  assert.deepEqual(result.attendance, saved())
  result.attendance.checked_in_at = 'Changed by UI'
  result.attendance.report_snapshot.member_name = 'Changed by UI'
  await result.undo()
  await result.undo()
  assert.deepEqual(calls, [
    { name: 'lc_remove_attendance_with_undo', args: { p_id: 'attendance-1' } },
    { name: 'lc_restore_attendance', args: { p_undo_token: 'receipt-1' } },
  ])
})

test('invalid targets fail before any database request', async () => {
  const { client, calls } = fixture()
  for (const id of ['', ' ', null]) await assert.rejects(removeAttendanceWithUndo(client, id), /Select a check-in/)
  assert.equal(calls.length, 0)
})

test('missing installer never falls back to permanent deletion', async () => {
  for (const code of ['PGRST202', '42883']) {
    const { client, calls } = fixture({ remove: async () => ({ error: { code, message: 'Missing function' }, data: null }) })
    await assert.rejects(removeAttendanceWithUndo(client, 'attendance-1'), /install-attendance-delete-undo.sql/)
    assert.equal(calls.length, 1)
  }
})

test('denied and missing removals never return a successful receipt', async () => {
  for (const message of ['Permission denied', 'This check-in is no longer available.']) {
    const { client } = fixture({ remove: async () => ({ data: null, error: { message } }) })
    await assert.rejects(removeAttendanceWithUndo(client, 'attendance-1'), new RegExp(message.replace('.', '\\.')))
  }
})

test('malformed removal responses are not reported as success', async () => {
  for (const data of [null, {}, { attendance: saved() }, { attendance: { ...saved(), id: 'different-id' }, undo_token: 'receipt-1' }]) {
    const { client } = fixture({ remove: async () => ({ data, error: null }) })
    await assert.rejects(removeAttendanceWithUndo(client, 'attendance-1'), /could not be confirmed/)
  }
})

test('simultaneous Undo clicks share one server restore request', async () => {
  let finish
  const pending = new Promise(resolve => { finish = resolve })
  const { client, calls } = fixture({ restore: async () => { await pending; return { data: saved(), error: null } } })
  const change = await removeAttendanceWithUndo(client, 'attendance-1')
  const first = change.undo(), second = change.undo(), third = change.undo()
  finish()
  await Promise.all([first, second, third])
  assert.equal(calls.filter(call => call.name === 'lc_restore_attendance').length, 1)
})

test('failed Undo surfaces its error and remains retryable', async () => {
  let attempt = 0
  const { client } = fixture({ restore: async () => ++attempt === 1 ? { data: null, error: { message: 'Connection interrupted' } } : { data: saved(), error: null } })
  const change = await removeAttendanceWithUndo(client, 'attendance-1')
  await assert.rejects(change.undo(), /Connection interrupted/)
  await change.undo()
  assert.equal(attempt, 2)
})

test('a newer check-in conflict is preserved and never retried with an overwrite', async () => {
  const { client, calls } = fixture({ restore: async () => ({ data: null, error: { message: 'A newer check-in exists. Undo will not overwrite it.' } }) })
  const change = await removeAttendanceWithUndo(client, 'attendance-1')
  await assert.rejects(change.undo(), /will not overwrite/)
  assert.deepEqual(calls.at(-1).args, { p_undo_token: 'receipt-1' })
})

test('restoration confirms historical values while tolerating JSON object key ordering', async () => {
  const row = saved()
  row.report_snapshot = { version: 3, ministries: row.report_snapshot.ministries, service_name: 'Saved Service', member_name: 'Saved Name' }
  const good = fixture({ restore: async () => ({ data: row, error: null }) })
  await (await removeAttendanceWithUndo(good.client, 'attendance-1')).undo()
  for (const data of [null, { ...saved(), checked_in_at: '2026-10-29T00:00:00Z' }, { ...saved(), report_snapshot: { member_name: 'Current Name' } }]) {
    const bad = fixture({ restore: async () => ({ data, error: null }) })
    await assert.rejects((await removeAttendanceWithUndo(bad.client, 'attendance-1')).undo(), /could not confirm the original/)
  }
})
