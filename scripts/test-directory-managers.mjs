import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

// Exercise the real event handlers with isolated state and mocked network
// boundaries. No Supabase connection or database write is made by this suite.
const source = readFileSync(new URL('../src/components/MemberManager.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('MemberManager.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'MemberManager')
const names = ['addManagedMinistry', 'addManagedBranch', 'saveDirectoryRename', 'deleteMinistry', 'deleteBranch', 'confirmManagerDelete']
const handlers = component.body.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text))
assert.equal(handlers.length, names.length)
const compiled = ts.transpileModule(handlers.map(node => node.getText(ast)).join('\n') + `\nglobalThis.handlers = {${names.join(',')}}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText
const entry = { id: 'ministry-1', name: 'Welcome Team' }
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function fixture({ kind = 'ministry', count = 0, deleteEntry, undo, mutation } = {}) {
  const calls = { deletions: [], undos: 0, toasts: [], events: [], invalidated: [], refreshes: 0, mutations: 0 }
  const state = {
    Error,
    managerLock: { current: false }, noticeAlive: { current: true }, requestSequence: { current: 0 },
    managerDeleteTarget: { kind, item: { ...entry } }, managerBusy: false,
    directoryBusy: false, directoryError: '', ministryMessage: '', branchMessage: '', blockedMinistryId: '', blockedBranchId: '',
    ministries: [{ ...entry }], branches: [{ ...entry }], form: { ministryIds: [entry.id], branchIds: [entry.id] },
    ministryFilter: entry.id, branchFilter: entry.id, newManagedMinistryName: '', newManagedBranchName: '',
    newManagedMinistryNameValue: '', openDirectoryRow: '',
    cache: { invalidate(prefix) { calls.invalidated.push(prefix) } },
    window: { dispatchEvent(event) { calls.events.push(event.type) } },
    CustomEvent: class { constructor(type) { this.type = type } },
    DirectoryEntryInUseError: class extends Error {},
    ministryMemberCount: () => count, branchMemberCount: () => count, scrollToSection() {},
    ministryManagerRef: {}, branchManagerRef: {},
    async loadData() { calls.refreshes++; return true },
    emitToast(options) { calls.toasts.push(options); return 'toast-1' },
    async deleteDirectoryEntryWithUndo(client, table, id) {
      calls.deletions.push({ client, table, id })
      if (deleteEntry) return deleteEntry()
      return { entry: { ...entry, created_at: '2026-10-01T00:00:00Z' }, async undo() { calls.undos++; return undo?.() } }
    },
    supabase: { from() {
      calls.mutations++
      const query = { insert() { return query }, update() { return query }, eq() { return query }, select() { return query },
        async single() { return mutation ? mutation() : { data: { id: 'new-1', name: 'New Entry' }, error: null } } }
      return query
    } },
  }
  const setters = {
    setManagerBusy: 'managerBusy', setManagerDeleteTarget: 'managerDeleteTarget', setMinistryMessage: 'ministryMessage', setBranchMessage: 'branchMessage',
    setBlockedMinistryId: 'blockedMinistryId', setBlockedBranchId: 'blockedBranchId', setMinistries: 'ministries', setBranches: 'branches',
    setForm: 'form', setMinistryFilter: 'ministryFilter', setBranchFilter: 'branchFilter', setOpenDirectoryRow: 'openDirectoryRow',
    setNewManagedMinistryName: 'newManagedMinistryName', setNewManagedBranchName: 'newManagedBranchName',
    setRenamingMinistryId: 'renamingMinistryId', setRenameValue: 'renameValue', setRenamingBranchId: 'renamingBranchId', setBranchRenameValue: 'branchRenameValue',
  }
  Object.entries(setters).forEach(([setter, key]) => { state[setter] = value => { state[key] = typeof value === 'function' ? value(state[key]) : value } })
  runInNewContext(compiled, state)
  return { state, calls, ...state.handlers }
}

test('manager validation and duplicate add feedback stay inline without a request or toast', async () => {
  const f = fixture()
  f.state.newManagedMinistryName = '  '
  await f.addManagedMinistry()
  assert.match(f.state.ministryMessage, /name is required/)
  f.state.newManagedMinistryName = ' welcome TEAM '
  await f.addManagedMinistry()
  assert.match(f.state.ministryMessage, /already exists/)
  assert.equal(f.calls.mutations, 0)
  assert.equal(f.calls.toasts.length, 0)
})

test('successful adds update their list and refresh without a toast', async () => {
  const f = fixture()
  f.state.newManagedBranchName = 'New Entry'
  await f.addManagedBranch()
  assert.equal(f.state.branches.length, 2)
  assert.match(f.state.branchMessage, /was added/)
  assert.equal(f.calls.refreshes, 0)
  assert.equal(f.calls.events.join(','), 'lifecity-directory-change')
  assert.equal(f.calls.toasts.length, 0)
  assert.equal(f.state.managerLock.current, false)
})

test('rename rejects an update that returns no row and retains the entry', async () => {
  const f = fixture({ mutation: () => ({ data: null, error: { code: 'PGRST116' } }) })
  await f.saveDirectoryRename('ministry', entry, 'Renamed')
  assert.equal(f.state.ministries[0].name, entry.name)
  assert.match(f.state.ministryMessage, /Could not rename/)
  assert.equal(f.calls.toasts.length, 0)
  assert.equal(f.state.managerBusy, false)
})

test('assigned entries are blocked inline with an affected-member link target', async () => {
  const f = fixture({ count: 4 })
  f.state.managerDeleteTarget = null
  await f.deleteMinistry(entry)
  assert.equal(f.state.managerDeleteTarget, null)
  assert.equal(f.state.blockedMinistryId, entry.id)
  assert.match(f.state.ministryMessage, /4 members/)
  assert.equal(f.calls.deletions.length, 0)
  assert.equal(f.calls.toasts.length, 0)
})

test('failed/zero-row deletion keeps the list and produces no success toast', async () => {
  const f = fixture({ deleteEntry: () => { throw new Error('No entry was deleted. Refresh and try again.') } })
  await f.confirmManagerDelete()
  assert.equal(f.state.ministries.length, 1)
  assert.match(f.state.ministryMessage, /No entry was deleted/)
  assert.equal(f.calls.toasts.length, 0)
  assert.equal(f.calls.invalidated.length, 0)
  assert.equal(f.state.managerLock.current, false)
})

test('successful deletion removes the row and Undo restores it before broadcasting refresh', async () => {
  const f = fixture()
  await f.confirmManagerDelete()
  assert.equal(f.calls.deletions[0].table, 'ministries')
  assert.equal(f.state.ministries.length, 0)
  assert.equal(f.state.form.ministryIds.length, 0)
  assert.equal(f.state.ministryFilter, 'all')
  assert.equal(f.state.managerDeleteTarget, null)
  assert.equal(f.calls.toasts.length, 1)
  assert.equal(f.calls.events.join(','), 'lifecity-directory-change')
  await f.calls.toasts[0].onAction()
  assert.equal(f.calls.undos, 1)
  assert.equal(f.state.ministries[0].id, entry.id)
  assert.match(f.state.ministryMessage, /was restored/)
  assert.equal(f.calls.events.length, 2)
  assert.equal(f.calls.invalidated.join(','), 'members:,members:')
  assert.equal(f.calls.refreshes, 0, 'the mounted subscriber owns refresh; the handler does not duplicate it')
})

test('rapid confirm clicks issue one deletion', async () => {
  const result = deferred()
  const f = fixture({ deleteEntry: () => result.promise })
  const first = f.confirmManagerDelete()
  await f.confirmManagerDelete()
  assert.equal(f.calls.deletions.length, 1)
  result.resolve({ entry: { ...entry }, undo: async () => {} })
  await first
  assert.equal(f.calls.toasts.length, 1)
  assert.equal(f.state.managerLock.current, false)
})

test('a server-side assignment race shows affected members and no toast', async () => {
  const f = fixture({ deleteEntry: () => { throw Object.assign(new Error('Assigned'), { code: '23503' }) } })
  await f.confirmManagerDelete()
  assert.equal(f.state.ministries.length, 1)
  assert.equal(f.state.blockedMinistryId, entry.id)
  assert.match(f.state.ministryMessage, /assigned to members/)
  assert.equal(f.calls.toasts.length, 0)
  assert.equal(f.calls.refreshes, 1)
})

test('delete finishing after unmount retains Undo and broadcasts without changing old state', async () => {
  const result = deferred()
  let undos = 0
  const f = fixture({ deleteEntry: () => result.promise })
  const deletion = f.confirmManagerDelete()
  f.state.noticeAlive.current = false
  result.resolve({ entry: { ...entry }, undo: async () => { undos++ } })
  await deletion
  assert.equal(f.state.ministries.length, 1)
  assert.equal(f.calls.toasts.length, 1)
  await f.calls.toasts[0].onAction()
  assert.equal(undos, 1)
  assert.equal(f.state.ministries.length, 1)
  assert.equal(f.calls.events.length, 2)
  assert.equal(f.calls.invalidated.length, 2)
})

test('failed Undo rejects for the existing toast and remains retryable', async () => {
  let attempts = 0
  const f = fixture({ undo: () => { if (++attempts === 1) throw new Error('Connection interrupted. Try Undo again.') } })
  await f.confirmManagerDelete()
  await assert.rejects(f.calls.toasts[0].onAction(), /Connection interrupted/)
  assert.equal(f.state.ministries.length, 0)
  assert.match(f.state.ministryMessage, /Try Undo again/)
  assert.equal(f.state.managerLock.current, false)
  await f.calls.toasts[0].onAction()
  assert.equal(f.state.ministries.length, 1)
  assert.equal(f.calls.toasts.length, 1)
})

test('both manager lists use swipe actions and keep their messages out of notice toasts', () => {
  assert.equal((source.match(/<DirectorySwipeItem\b/g) ?? []).length, 2)
  assert.doesNotMatch(source, /useNoticeToast\((?:ministryMessage|branchMessage)/)
  assert.match(source, /addEventListener\('lifecity-directory-change', refresh\)/)
  assert.match(source, /removeEventListener\('lifecity-directory-change', refresh\)/)
})
