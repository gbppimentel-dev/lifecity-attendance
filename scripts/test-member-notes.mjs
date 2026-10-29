import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { saveMemberAdminNote } from '../src/lib/memberNotes.ts'

// Isolated query boundary; these tests never contact Supabase.
function fixture({ note = 'Original note', missing = false, fault, before } = {}) {
  const state = { row: missing ? null : { id: 'member-1', admin_note: note, status: 'active', first_name: 'Clara' }, calls: [] }
  const client = { from(table) {
    const call = { table, values: null, filters: [], columns: '' }
    const query = {
      update(values) { call.values = values; return query },
      eq(key, value) { call.filters.push([key, value]); return query },
      is(key, value) { call.filters.push([key, value]); return query },
      select(columns) { call.columns = columns; return query },
      async maybeSingle() {
        state.calls.push(structuredClone(call))
        before?.(state)
        if (fault) return fault
        if (!state.row || !call.filters.every(([key, value]) => state.row[key] === value)) return { data: null, error: null }
        Object.assign(state.row, call.values)
        return { data: { id: state.row.id, admin_note: state.row.admin_note }, error: null }
      },
    }
    return query
  } }
  return { client, state }
}

test('note edits change only the note and require the original snapshot', async () => {
  const { client, state } = fixture()
  const result = await saveMemberAdminNote(client, 'member-1', 'Original note', '  A helpful reminder.  ')
  assert.deepEqual(result, { id: 'member-1', admin_note: 'A helpful reminder.' })
  assert.deepEqual(state.row, { id: 'member-1', admin_note: 'A helpful reminder.', status: 'active', first_name: 'Clara' })
  assert.deepEqual(state.calls[0], { table: 'members', values: { admin_note: 'A helpful reminder.' }, filters: [['id', 'member-1'], ['admin_note', 'Original note']], columns: 'id,admin_note' })
})

test('empty notes clear to null and a new note compares null correctly', async () => {
  const clear = fixture()
  assert.equal((await saveMemberAdminNote(clear.client, 'member-1', 'Original note', ' ')).admin_note, null)
  const add = fixture({ note: null })
  assert.equal((await saveMemberAdminNote(add.client, 'member-1', null, 'New note')).admin_note, 'New note')
  assert.deepEqual(add.state.calls[0].filters[1], ['admin_note', null])
})

test('unchanged notes do not write and invalid or excessive drafts are rejected', async () => {
  const { client, state } = fixture()
  await saveMemberAdminNote(client, 'member-1', 'Original note', 'Original note')
  await assert.rejects(saveMemberAdminNote(client, '', null, 'New'), /Choose a member/)
  await assert.rejects(saveMemberAdminNote(client, 'member-1', null, 'a'.repeat(1001)), /1,000/)
  assert.equal(state.calls.length, 0)
})

test('stale, missing, denied and unconfirmed notes never report a successful save', async () => {
  for (const config of [
    { note: 'Newer note' }, { missing: true },
    { fault: { data: null, error: { message: 'Permission denied' } } },
    { fault: { data: { id: 'different', admin_note: 'Changed' }, error: null } },
    { fault: { data: { id: 'member-1', admin_note: 'Different' }, error: null } },
  ]) {
    const { client } = fixture(config)
    await assert.rejects(saveMemberAdminNote(client, 'member-1', 'Original note', 'Changed'))
  }
})

test('a note changed during a request is preserved', async () => {
  const { client, state } = fixture({ before(current) { current.row.admin_note = 'Changed by another admin' } })
  await assert.rejects(saveMemberAdminNote(client, 'member-1', 'Original note', 'Changed'), /changed elsewhere/)
  assert.equal(state.row.admin_note, 'Changed by another admin')
})

// Exercise the production integration, including editor changes while awaiting
// the server. This catches stale closures that a query-only test cannot see.
const source = readFileSync(new URL('../src/components/MemberManager.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('MemberManager.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'MemberManager')
const handler = component.body.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'savePrivateNote')
const compiled = ts.transpileModule(handler.getText(ast) + '\nglobalThis.savePrivateNote = savePrivateNote', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText
const member = { id: 'member-1', admin_note: 'Original note', status: 'active' }
function handlerFixture(write = async () => ({ id: member.id, admin_note: 'Saved note' })) {
  const calls = { writes: 0, invalidated: [], events: [] }
  const state = {
    Error, noteWriteLock: { current: new Set() }, latestMemberWrites: { current: { saving: false, bulkSaving: false } },
    noticeAlive: { current: true }, currentEditorId: { current: member.id }, requestSequence: { current: 0 },
    members: [{ ...member }], noteMember: { ...member }, detailMember: { ...member }, selectedMember: { ...member }, editingMember: { ...member }, form: { adminNote: 'Original note' },
    supabase: {}, cache: { invalidate(prefix) { calls.invalidated.push(prefix) } },
    window: { dispatchEvent(event) { calls.events.push(event.type) } }, CustomEvent: class { constructor(type) { this.type = type } },
    async saveMemberAdminNote(...args) { calls.writes++; return write(...args) },
  }
  for (const name of ['Members', 'NoteMember', 'DetailMember', 'SelectedMember', 'EditingMember', 'Form']) {
    const key = name[0].toLowerCase() + name.slice(1)
    state['set' + name] = value => { state[key] = typeof value === 'function' ? value(state[key]) : value }
  }
  runInNewContext(compiled, state)
  return { state, calls, save: state.savePrivateNote }
}

test('note handler syncs confirmed snapshots and current editor without changing other fields', async () => {
  const f = handlerFixture()
  await f.save(member, 'Saved note')
  for (const row of [f.state.members[0], f.state.noteMember, f.state.detailMember, f.state.selectedMember, f.state.editingMember]) {
    assert.equal(row.admin_note, 'Saved note')
    assert.equal(row.status, 'active')
  }
  assert.equal(f.state.form.adminNote, 'Saved note')
  assert.equal(f.calls.invalidated.join(','), 'members:')
  assert.equal(f.calls.events.join(','), 'lifecity-directory-change')
  assert.equal(f.state.noteWriteLock.current.size, 0)
})

test('late note save cannot replace a different member editor draft', async () => {
  let resolve
  const f = handlerFixture(() => new Promise(done => { resolve = done }))
  const pending = f.save(member, 'Saved note')
  f.state.currentEditorId.current = 'member-2'
  f.state.editingMember = { id: 'member-2', admin_note: 'Other note' }
  f.state.form.adminNote = 'Unsaved draft for another member'
  resolve({ id: member.id, admin_note: 'Saved note' })
  await pending
  assert.equal(f.state.form.adminNote, 'Unsaved draft for another member')
  assert.equal(f.state.editingMember.admin_note, 'Other note')
})

test('note failure keeps snapshots, refreshes uncertain data and releases the lock', async () => {
  const f = handlerFixture(async () => { throw new Error('Connection interrupted') })
  await assert.rejects(f.save(member, 'Draft'), /Connection interrupted/)
  assert.equal(f.state.noteMember.admin_note, 'Original note')
  assert.equal(f.state.form.adminNote, 'Original note')
  assert.equal(f.calls.invalidated.join(','), 'members:')
  assert.equal(f.state.noteWriteLock.current.size, 0)
})

test('duplicate or competing member writes cannot submit a second note request', async () => {
  let resolve
  const f = handlerFixture(() => new Promise(done => { resolve = done }))
  const pending = f.save(member, 'First')
  await assert.rejects(f.save(member, 'Second'), /in progress/)
  assert.equal(f.calls.writes, 1)
  resolve({ id: member.id, admin_note: 'First' })
  await pending
  f.state.latestMemberWrites.current.bulkSaving = true
  await assert.rejects(f.save(member, 'Third'), /in progress/)
  assert.equal(f.calls.writes, 1)
})

test('late note completion after unmount refreshes data without old state setters', async () => {
  let resolve
  const f = handlerFixture(() => new Promise(done => { resolve = done }))
  const pending = f.save(member, 'Saved note')
  f.state.noticeAlive.current = false
  resolve({ id: member.id, admin_note: 'Saved note' })
  await pending
  assert.equal(f.state.noteMember.admin_note, 'Original note')
  assert.equal(f.calls.events.length, 1)
  assert.equal(f.state.noteWriteLock.current.size, 0)
})
