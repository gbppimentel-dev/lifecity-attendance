import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

// Exercise production scanner handlers with in-memory query boundaries. No
// browser, camera, microphone, audio device or Supabase connection is used.
const source = readFileSync(new URL('../src/components/AttendanceScanner.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('AttendanceScanner.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AttendanceScanner')
assert.ok(component?.body, 'AttendanceScanner must remain available to these integration tests')
const names = ['attemptIsCurrent', 'startAttempt', 'finishAttempt', 'addRecentCheckIn', 'recordMemberAttendance', 'recordAttendance', 'submitMemberSearch']
const handlers = names.map(name => {
  const fn = component.body.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)
  assert.ok(fn, `Missing production scanner handler: ${name}`)
  return fn.getText(ast)
}).join('\n')
const compiled = ts.transpileModule(`${handlers}\nglobalThis.scannerHandlers = {${names.join(',')}}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText
const active = { id: 'member-1', first_name: 'Clara', last_name: 'Santos', status: 'active' }
const clone = value => structuredClone(value)
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const nextTurn = () => new Promise(resolve => setImmediate(resolve))

function fixture({ lookup, insert, onCheckIn } = {}) {
  const calls = { reads: [], writes: [], notifications: 0, counts: [], setters: [], delays: [], prevented: 0 }
  const timers = new Map()
  let nextTimer = 0
  const state = {
    Date, Intl, Error,
    event: { id: 'service-1', name: 'Fictional Gathering' }, mounted: { current: true }, currentEventId: { current: 'service-1' },
    attemptSequence: { current: 0 }, processingRef: { current: false }, releaseTimer: { current: null },
    processing: false, coolingDown: false, result: null, recentCheckIns: [],
    selectedMember: null, selectedMemberEventId: '', memberSearch: '',
    notifySuccessfulCheckIn() { calls.notifications++ },
    checkInCallback: { current(serviceId) { calls.counts.push(serviceId); onCheckIn?.(serviceId) } },
    window: {
      setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, callback); calls.delays.push(delay); return id },
      clearTimeout(id) { timers.delete(id) },
    },
    supabase: { from(table) {
      if (table === 'attendance') return { async insert(values) {
        calls.writes.push(clone(values))
        return insert ? await insert(clone(values)) : { error: null }
      } }
      assert.equal(table, 'members', 'Scanner queries must stay on the expected tables')
      const read = { columns: '', filters: [] }
      const query = {
        select(columns) { read.columns = columns; return query },
        eq(key, value) { read.filters.push([key, value]); return query },
        async maybeSingle() { calls.reads.push(clone(read)); return lookup ? await lookup(clone(read)) : { data: clone(active), error: null } },
      }
      return query
    } },
  }
  for (const [name, key] of Object.entries({setProcessing:'processing',setCoolingDown:'coolingDown',setResult:'result',setRecentCheckIns:'recentCheckIns',setSelectedMember:'selectedMember',setSelectedMemberEventId:'selectedMemberEventId',setMemberSearch:'memberSearch'})) {
    state[name] = next => { calls.setters.push(key); state[key] = typeof next === 'function' ? next(state[key]) : next }
  }
  runInNewContext(compiled, state)
  return { state, calls, ...state.scannerHandlers,
    releaseCooldown() { const queued = [...timers.values()]; timers.clear(); queued.forEach(callback => callback()) },
    selectMember(member = active, serviceId = 'service-1') { state.selectedMember = clone(member); state.selectedMemberEventId = serviceId; state.memberSearch = member.first_name },
    submit() { state.scannerHandlers.submitMemberSearch({ preventDefault() { calls.prevented++ } }) },
  }
}

test('confirmed active QR check-in writes the selected service and increments its summary once', async () => {
  const f = fixture()
  await f.recordAttendance('  att:private-token  ')
  assert.deepEqual(f.calls.reads[0].filters, [['qr_token','private-token']])
  assert.deepEqual(f.calls.writes, [{member_id:active.id,event_id:'service-1'}])
  assert.equal(f.state.result.type, 'success')
  assert.equal(f.state.result.memberName, 'Clara Santos')
  assert.equal(typeof f.state.result.time, 'string')
  assert.deepEqual(f.calls.counts, ['service-1'])
  assert.equal(f.calls.notifications, 1)
  assert.equal(f.state.recentCheckIns.length, 1)
  assert.equal(f.state.processing, false)
  assert.equal(f.state.coolingDown, true)
  assert.deepEqual(f.calls.delays, [1800])
})

test('duplicate attendance returns duplicate feedback without another summary increment', async () => {
  const f = fixture({ insert: async () => ({error:{code:'23505',message:'Already exists'}}) })
  await f.recordAttendance('private-token')
  assert.equal(f.calls.writes.length, 1)
  assert.equal(f.state.result.type, 'duplicate')
  assert.equal(f.calls.counts.length, 0)
  assert.equal(f.calls.notifications, 0)
  assert.equal(f.state.recentCheckIns.length, 0)
})

test('inactive members never reach the attendance insert', async () => {
  const f = fixture({lookup: async () => ({data:{...active,status:'inactive'},error:null})})
  await f.recordAttendance('private-token')
  assert.equal(f.calls.writes.length, 0)
  assert.equal(f.state.result.type, 'error')
  assert.match(f.state.result.message, /inactive/i)
  assert.equal(f.calls.counts.length, 0)
})

test('denied and interrupted inserts never report success or increment a count', async () => {
  for (const insert of [async () => ({error:{code:'42501',message:'Access denied'}}), async () => {throw new Error('Connection interrupted')}]) {
    const f = fixture({insert})
    await f.recordAttendance('private-token')
    assert.equal(f.state.result.type, 'error')
    assert.equal(f.calls.counts.length, 0)
    assert.equal(f.calls.notifications, 0)
    assert.equal(f.state.recentCheckIns.length, 0)
    assert.equal(f.state.processing, false)
  }
})

test('empty, missing and failed member lookups never submit attendance', async () => {
  const blank = fixture()
  await blank.recordAttendance('att:   ')
  assert.equal(blank.calls.reads.length, 0)
  assert.equal(blank.state.result.type, 'error')
  for (const lookup of [async () => ({data:null,error:null}), async () => ({data:null,error:{message:'Lookup denied'}})]) {
    const f = fixture({lookup})
    await f.recordAttendance('private-token')
    assert.equal(f.calls.writes.length, 0)
    assert.equal(f.state.result.type, 'error')
    assert.equal(f.calls.counts.length, 0)
  }
})

test('a service switch during QR lookup suppresses the old result and insert', async () => {
  const pending = deferred()
  const f = fixture({lookup: () => pending.promise})
  const scan = f.recordAttendance('private-token')
  f.state.currentEventId.current = 'service-2'
  pending.resolve({data:clone(active),error:null})
  await scan
  assert.equal(f.calls.writes.length, 0)
  assert.equal(f.state.result, null)
  assert.equal(f.calls.counts.length, 0)
})

test('a service switch during insert cannot show success or increment the newly selected service', async () => {
  const pending = deferred()
  const f = fixture({insert: () => pending.promise})
  const scan = f.recordAttendance('private-token')
  await nextTurn()
  assert.equal(f.calls.writes[0].event_id, 'service-1')
  f.state.currentEventId.current = 'service-2'
  pending.resolve({error:null})
  await scan
  assert.equal(f.state.result, null)
  assert.equal(f.calls.counts.length, 0)
  assert.equal(f.calls.notifications, 0)
})

test('completion after unmount performs no stale state or summary updates', async () => {
  const pending = deferred()
  const f = fixture({insert: () => pending.promise})
  const scan = f.recordAttendance('private-token')
  await nextTurn()
  f.state.mounted.current = false
  const setters = f.calls.setters.length
  pending.resolve({error:null})
  await scan
  assert.equal(f.calls.setters.length, setters)
  assert.equal(f.calls.counts.length, 0)
  assert.equal(f.state.result, null)
})

test('rapid scans share the processing lock and cooldown blocks a held QR until release', async () => {
  const pending = deferred()
  let first = true
  const f = fixture({insert: () => {if(first){first=false;return pending.promise} return {error:null}}})
  const scan = f.recordAttendance('private-token')
  await f.recordAttendance('another-token')
  assert.equal(f.calls.reads.length, 1)
  await nextTurn()
  pending.resolve({error:null})
  await scan
  await f.recordAttendance('another-token')
  assert.equal(f.calls.writes.length, 1)
  assert.equal(f.state.coolingDown, true)
  f.releaseCooldown()
  assert.equal(f.state.processingRef.current, false)
  assert.equal(f.state.coolingDown, false)
  await f.recordAttendance('another-token')
  assert.equal(f.calls.writes.length, 2)
  assert.equal(f.calls.counts.length, 2)
})

test('an older cooldown cannot unlock a newer attempt', async () => {
  const f = fixture()
  await f.recordAttendance('private-token')
  f.state.attemptSequence.current++
  f.state.processingRef.current = true
  f.releaseCooldown()
  assert.equal(f.state.processingRef.current, true)
})

test('a summary callback failure does not contradict the confirmed attendance write', async () => {
  const f = fixture({onCheckIn() {throw new Error('Summary refresh unavailable')}})
  await f.recordAttendance('private-token')
  assert.equal(f.state.result.type, 'success')
  assert.deepEqual(f.calls.counts, ['service-1'])
  assert.equal(f.calls.writes.length, 1)
  assert.equal(f.calls.notifications, 1)
})

test('manual check-in re-reads the selected member and preserves service binding', async () => {
  const f = fixture()
  f.selectMember()
  f.submit()
  await nextTurn()
  assert.equal(f.calls.prevented, 1)
  assert.deepEqual(f.calls.reads[0].filters, [['id',active.id]])
  assert.deepEqual(f.calls.writes, [{member_id:active.id,event_id:'service-1'}])
  assert.equal(f.state.selectedMember, null)
  assert.equal(f.state.result.type, 'success')
  assert.deepEqual(f.calls.counts, ['service-1'])
})

test('manual check-in rejects a stale service selection and a newly inactive member', async () => {
  const mismatch = fixture()
  mismatch.selectMember(active, 'other-service')
  mismatch.submit()
  await nextTurn()
  assert.equal(mismatch.calls.reads.length, 0)
  assert.equal(mismatch.calls.writes.length, 0)
  const inactive = fixture({lookup: async () => ({data:{...active,status:'inactive'},error:null})})
  inactive.selectMember()
  inactive.submit()
  await nextTurn()
  assert.equal(inactive.calls.reads.length, 1)
  assert.equal(inactive.calls.writes.length, 0)
  assert.equal(inactive.state.result.type, 'error')
  assert.equal(inactive.calls.counts.length, 0)
})
