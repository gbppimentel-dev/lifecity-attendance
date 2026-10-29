// Status mutations are tested with an isolated query boundary; no live database.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { setMemberStatusWithUndo, MemberStatusConflictError } from '../src/lib/memberStatusActions.ts'

const memberId = '00000000-0000-4000-8000-000000000010'
function fixture({ status = 'active', missing = false, before } = {}) {
  const state = {
    row: missing ? null : { id: memberId, status, first_name: 'Clara', admin_note: 'Preserve me' },
    requests: [], fault: undefined,
  }
  const client = { from(table) {
    const request = { table, values: null, filters: [], columns: '' }
    const query = {
      update(values) { request.values = { ...values }; return query },
      eq(field, value) { request.filters.push({ field, value }); return query },
      select(columns) { request.columns = columns; return query },
      async maybeSingle() {
        state.requests.push(structuredClone(request))
        await before?.(request, state)
        if (state.fault) { const result = state.fault; state.fault = undefined; return result }
        const matches = state.row && request.filters.every(({ field, value }) => state.row[field] === value)
        if (!matches) return { data: null, error: null }
        Object.assign(state.row, request.values)
        return { data: { id: state.row.id, status: state.row.status }, error: null }
      },
    }
    return query
  } }
  return { client, state }
}

for (const [previous, next] of [['active', 'inactive'], ['inactive', 'active']]) {
  test(`${previous} to ${next}: only status changes and Undo compares the saved value`, async () => {
    const { client, state } = fixture({ status: previous })
    const change = await setMemberStatusWithUndo(client, memberId, previous, next)
    assert.equal(change.id, memberId)
    assert.equal(change.status, next)
    assert.equal(change.previousStatus, previous)
    assert.deepEqual(state.row, { id: memberId, status: next, first_name: 'Clara', admin_note: 'Preserve me' })
    assert.deepEqual(state.requests[0], {
      table: 'members', values: { status: next }, columns: 'id,status',
      filters: [{ field: 'id', value: memberId }, { field: 'status', value: previous }],
    })
    // Mutating the UI's result never changes the private Undo inputs.
    change.id = 'another-id'; change.status = previous; change.previousStatus = next
    const restored = await change.undo()
    assert.deepEqual(restored, { id: memberId, status: previous })
    assert.deepEqual(state.requests[1].filters, [{ field: 'id', value: memberId }, { field: 'status', value: next }])
    assert.deepEqual(state.requests[1].values, { status: previous })
    assert.equal(state.row.status, previous)
  })
}

test('invalid member/status and no-op changes never make a request', async () => {
  const { client, state } = fixture()
  for (const args of [
    ['', 'active', 'inactive'], [null, 'active', 'inactive'],
    [memberId, 'unknown', 'inactive'], [memberId, 'active', 'unknown'],
    [memberId, 'active', 'active'], [memberId, 'inactive', 'inactive'],
  ]) await assert.rejects(setMemberStatusWithUndo(client, ...args), /valid status/)
  assert.equal(state.requests.length, 0)
})

test('a missing row or stale status never reports success or overwrites data', async () => {
  for (const options of [{ missing: true }, { status: 'inactive' }]) {
    const { client, state } = fixture(options)
    await assert.rejects(setMemberStatusWithUndo(client, memberId, 'active', 'inactive'), MemberStatusConflictError)
    assert.equal(state.row?.status ?? null, options.missing ? null : 'inactive')
    assert.equal(state.requests.length, 1)
  }
})

test('a status changed while the request was in flight is not overwritten', async () => {
  const { client, state } = fixture({ before(_request, current) { current.row.status = 'inactive' } })
  await assert.rejects(setMemberStatusWithUndo(client, memberId, 'active', 'inactive'), MemberStatusConflictError)
  assert.equal(state.row.status, 'inactive')
})

test('permission and network failures retain the original row', async () => {
  for (const message of ['Permission denied', 'Connection interrupted']) {
    const { client, state } = fixture()
    state.fault = { data: null, error: { message } }
    await assert.rejects(setMemberStatusWithUndo(client, memberId, 'active', 'inactive'), { message })
    assert.equal(state.row.status, 'active')
  }
})

test('a malformed returning row never reports a confirmed change', async () => {
  for (const data of [{ id: 'wrong-id', status: 'inactive' }, { id: memberId, status: 'active' }, {}]) {
    const { client, state } = fixture()
    state.fault = { data, error: null }
    await assert.rejects(setMemberStatusWithUndo(client, memberId, 'active', 'inactive'), /could not be confirmed/)
  }
})

test('rapid competing updates cannot both commit against the same original status', async () => {
  const { client, state } = fixture()
  const results = await Promise.allSettled([
    setMemberStatusWithUndo(client, memberId, 'active', 'inactive'),
    setMemberStatusWithUndo(client, memberId, 'active', 'inactive'),
  ])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason instanceof MemberStatusConflictError).length, 1)
  assert.equal(state.row.status, 'inactive')
})

test('concurrent/repeated Undo calls issue one mutation and return independent snapshots', async () => {
  const { client, state } = fixture()
  const change = await setMemberStatusWithUndo(client, memberId, 'active', 'inactive')
  const results = await Promise.all([change.undo(), change.undo(), change.undo()])
  results[0].status = 'inactive'
  assert.equal(results[1].status, 'active')
  assert.deepEqual(await change.undo(), { id: memberId, status: 'active' })
  assert.equal(state.requests.length, 2)
})

test('Undo refuses a different current status and preserves that change', async () => {
  const { client, state } = fixture()
  const change = await setMemberStatusWithUndo(client, memberId, 'active', 'inactive')
  state.row.status = 'active'
  await assert.rejects(change.undo(), error => error instanceof MemberStatusConflictError && /Undo/.test(error.message))
  assert.equal(state.row.status, 'active')
})

test('a failed Undo is retryable and still uses the saved expected status', async () => {
  const { client, state } = fixture()
  const change = await setMemberStatusWithUndo(client, memberId, 'active', 'inactive')
  state.fault = { data: null, error: { message: 'Undo denied temporarily' } }
  await assert.rejects(change.undo(), /Undo denied temporarily/)
  assert.equal(state.row.status, 'inactive')
  assert.deepEqual(await change.undo(), { id: memberId, status: 'active' })
  assert.equal(state.requests.length, 3)
  assert.deepEqual(state.requests[2].filters, [{ field: 'id', value: memberId }, { field: 'status', value: 'inactive' }])
})

// Exercise the actual screen handlers while mocking only React state and the
// mutation/notification boundaries. This covers lifecycle and cache behavior
// that cannot be verified by the database helper's tests above.
const managerSource = readFileSync(new URL('../src/components/MemberManager.tsx', import.meta.url), 'utf8')
const managerAst = ts.createSourceFile('MemberManager.tsx', managerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const managerComponent = managerAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'MemberManager')
const handlerNames = ['syncMemberStatus', 'supersedeMemberStatusUndo', 'toggleMemberStatus']
const statusHandlers = managerComponent.body.statements.filter(node => ts.isFunctionDeclaration(node) && handlerNames.includes(node.name?.text))
assert.equal(statusHandlers.length, handlerNames.length)
const cleanupEffect = managerComponent.body.statements.find(node => ts.isExpressionStatement(node)
  && ts.isCallExpression(node.expression) && node.expression.expression.getText(managerAst) === 'useEffect'
  && node.expression.arguments[0]?.getText(managerAst).includes('statusToastIds.current.forEach'))
assert.ok(cleanupEffect, 'Status notifications must be scoped to the screen lifecycle')
const compiledHandlers = ts.transpileModule(statusHandlers.map(node => node.getText(managerAst)).join('\n')
  + `\nglobalThis.statusHandlers = {${handlerNames.join(',')}};`
  + `\nglobalThis.cleanupStatusToasts = (${cleanupEffect.expression.arguments[0].getText(managerAst)})();`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function handlerFixture({ mutation, undo } = {}) {
  const member = { id: memberId, first_name: 'Clara', last_name: 'Santos', status: 'active' }
  const calls = { writes: [], undos: 0, toasts: [], dismissed: [], invalidated: [], events: [], setters: [] }
  const state = {
    Error,
    members: [{ ...member }, { id: 'other-member', status: 'inactive' }],
    detailMember: { ...member }, selectedMember: { ...member }, statusBusyIds: [],
    saving: false, bulkSaving: false, directoryBusy: false,
    noticeAlive: { current: true }, statusLocks: { current: new Set() },
    statusToastIds: { current: new Map() }, latestMemberWrites: { current: { saving: false, bulkSaving: false } },
    requestSequence: { current: 0 }, supabase: {},
    memberName: member => `${member.first_name} ${member.last_name}`,
    cache: { invalidate(prefix) { calls.invalidated.push(prefix) } },
    window: { dispatchEvent(event) { calls.events.push(event.type) } },
    CustomEvent: class { constructor(type) { this.type = type } },
    emitToast(options) { calls.toasts.push(options); return `status-toast-${calls.toasts.length}` },
    dismissToast(id) { calls.dismissed.push(id) },
    async setMemberStatusWithUndo(client, id, expected, next) {
      calls.writes.push({ client, id, expected, next })
      if (mutation) return mutation()
      return { id, status: next, previousStatus: expected, async undo() {
        calls.undos++
        if (undo) return undo()
        return { id, status: expected }
      } }
    },
  }
  for (const [setter, key] of Object.entries({ setMembers: 'members', setDetailMember: 'detailMember', setSelectedMember: 'selectedMember', setStatusBusyIds: 'statusBusyIds' })) {
    state[setter] = value => {
      calls.setters.push({ key, alive: state.noticeAlive.current })
      state[key] = typeof value === 'function' ? value(state[key]) : value
    }
  }
  runInNewContext(compiledHandlers, state)
  return { state, calls, member, ...state.statusHandlers, unmount() { state.noticeAlive.current = false; state.cleanupStatusToasts() } }
}

test('handler: duplicate clicks share the member lock and issue one confirmed change', async () => {
  const pending = deferred()
  const f = handlerFixture({ mutation: () => pending.promise })
  const first = f.toggleMemberStatus(f.member)
  await f.toggleMemberStatus(f.member)
  assert.equal(f.calls.writes.length, 1)
  assert.equal(f.state.statusLocks.current.has(memberId), true)
  pending.resolve({ id: memberId, status: 'inactive', previousStatus: 'active', async undo() {} })
  await first
  assert.equal(f.calls.toasts.length, 1)
  assert.equal(f.state.statusLocks.current.size, 0)
  assert.equal(f.state.statusBusyIds.length, 0)
})

test('handler: confirmed change and Undo sync the row, open profiles and both caches', async () => {
  const f = handlerFixture()
  await f.toggleMemberStatus(f.member)
  assert.equal(f.state.members[0].status, 'inactive')
  assert.equal(f.state.members[1].status, 'inactive')
  assert.equal(f.state.detailMember.status, 'inactive')
  assert.equal(f.state.selectedMember.status, 'inactive')
  assert.equal(f.state.requestSequence.current, 1)
  assert.equal(f.calls.invalidated.join(','), 'members:,dashboard:')
  assert.equal(f.calls.events.join(','), 'lifecity-directory-change')
  assert.equal(f.calls.toasts[0].actionLabel, 'Undo')
  await f.calls.toasts[0].onAction()
  assert.equal(f.calls.undos, 1)
  assert.equal(f.state.members[0].status, 'active')
  assert.equal(f.state.detailMember.status, 'active')
  assert.equal(f.state.selectedMember.status, 'active')
  assert.equal(f.calls.invalidated.join(','), 'members:,dashboard:,members:,dashboard:')
})

test('handler: an uncertain failure never shows success and invalidates both snapshots', async () => {
  const f = handlerFixture({ mutation: () => { throw new Error('Connection interrupted') } })
  await f.toggleMemberStatus(f.member)
  assert.equal(f.state.members[0].status, 'active')
  assert.equal(f.state.requestSequence.current, 0)
  assert.equal(f.calls.invalidated.join(','), 'members:,dashboard:')
  assert.equal(f.calls.events.join(','), 'lifecity-directory-change')
  assert.equal(f.calls.toasts.length, 1)
  assert.equal(f.calls.toasts[0].tone, 'error')
  assert.equal(f.calls.toasts[0].description, 'Connection interrupted')
  assert.equal(f.state.statusToastIds.current.size, 0)
  assert.equal(f.state.statusLocks.current.size, 0)
  assert.equal(f.state.statusBusyIds.length, 0)
})

test('handler: uncertain Undo refreshes both snapshots, releases its lock and remains retryable', async () => {
  let attempts = 0
  const failure = new Error('Undo response interrupted after the request')
  const f = handlerFixture({ undo() {
    if (++attempts === 1) throw failure
    return { id: memberId, status: 'active' }
  } })
  await f.toggleMemberStatus(f.member)
  const toast = f.calls.toasts[0]
  await assert.rejects(toast.onAction(), error => error === failure)
  // Do not invent a successful status locally after an uncertain response.
  // The broadcast gives the current screen a chance to read server truth.
  assert.equal(f.state.members[0].status, 'inactive')
  assert.equal(f.state.detailMember.status, 'inactive')
  assert.equal(f.calls.invalidated.join(','), 'members:,dashboard:,members:,dashboard:')
  assert.equal(f.calls.events.join(','), 'lifecity-directory-change,lifecity-directory-change')
  assert.equal(f.calls.toasts.length, 1)
  assert.equal(f.state.statusToastIds.current.get(memberId), 'status-toast-1')
  assert.equal(f.state.statusLocks.current.size, 0)
  assert.equal(f.state.statusBusyIds.length, 0)
  await toast.onAction()
  assert.equal(f.calls.undos, 2)
  assert.equal(f.state.members[0].status, 'active')
  assert.equal(f.state.statusLocks.current.size, 0)
})

test('handler: completion after unmount invalidates data without old setters or a new toast', async () => {
  for (const fail of [false, true]) {
    const pending = deferred()
    const f = handlerFixture({ mutation: () => pending.promise })
    const work = f.toggleMemberStatus(f.member)
    f.unmount()
    const priorSetters = f.calls.setters.length
    if (fail) pending.reject(new Error('Late network failure'))
    else pending.resolve({ id: memberId, status: 'inactive', async undo() {} })
    await work
    assert.equal(f.calls.setters.length, priorSetters)
    assert.equal(f.calls.toasts.length, 0)
    assert.equal(f.calls.invalidated.join(','), 'members:,dashboard:')
    assert.equal(f.calls.events.join(','), 'lifecity-directory-change')
    assert.equal(f.state.statusLocks.current.size, 0)
  }
})

test('handler: superseded or unmounted Undo cannot invoke a status mutation', async () => {
  for (const reason of ['superseded', 'unmounted', 'replaced']) {
    const f = handlerFixture()
    await f.toggleMemberStatus(f.member)
    const toast = f.calls.toasts[0]
    if (reason === 'superseded') f.supersedeMemberStatusUndo([memberId])
    else if (reason === 'unmounted') f.unmount()
    else f.state.statusToastIds.current.set(memberId, 'newer-status-toast')
    await assert.rejects(toast.onAction(), /superseded/)
    assert.equal(f.calls.undos, 0)
    assert.equal(f.calls.writes.length, 1)
    assert.equal(f.state.members[0].status, 'inactive')
  }
})

test('handler: current save, bulk operation or per-member lock blocks Undo without changing state', async () => {
  for (const reason of ['saving', 'bulkSaving', 'locked']) {
    const f = handlerFixture()
    await f.toggleMemberStatus(f.member)
    if (reason === 'locked') f.state.statusLocks.current.add(memberId)
    else f.state.latestMemberWrites.current[reason] = true
    const priorSetters = f.calls.setters.length
    await assert.rejects(f.calls.toasts[0].onAction(), /in progress/)
    assert.equal(f.calls.undos, 0)
    assert.equal(f.calls.setters.length, priorSetters)
    assert.equal(f.state.members[0].status, 'inactive')
  }
})

test('handler: cleanup dismisses the screen’s status toasts and clears its registry', async () => {
  const f = handlerFixture()
  await f.toggleMemberStatus(f.member)
  f.state.statusToastIds.current.set('another-member', 'another-status-toast')
  f.unmount()
  assert.deepEqual(f.calls.dismissed, ['status-toast-1', 'another-status-toast'])
  assert.equal(f.state.statusToastIds.current.size, 0)
})

test('handler: an older toast dismiss callback cannot remove a newer Undo', async () => {
  const f = handlerFixture()
  await f.toggleMemberStatus(f.member)
  f.state.statusToastIds.current.set(memberId, 'newer-status-toast')
  f.calls.toasts[0].onDismiss()
  assert.equal(f.state.statusToastIds.current.get(memberId), 'newer-status-toast')
})
