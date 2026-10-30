import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(
  new URL('../src/components/MemberManager.tsx', import.meta.url),
  'utf8',
);
const ast = ts.createSourceFile(
  'MemberManager.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const component = ast.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'MemberManager',
);
const names = [
  'showManagerFeedback',
  'addManagedMinistry',
  'addManagedBranch',
  'saveDirectoryRename',
  'deleteMinistry',
  'deleteBranch',
  'confirmManagerDelete',
];
const handlers = component.body.statements.filter(
  (node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text),
);
assert.equal(handlers.length, names.length);
const compiled = ts.transpileModule(
  handlers.map((node) => node.getText(ast)).join('\n') +
    `\nglobalThis.handlers = {${names.join(',')}}`,
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;
const entry = { id: 'ministry-1', name: 'Welcome Team' };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture({ kind = 'ministry', count = 0, deleteEntry, undo, mutation } = {}) {
  const calls = {
    deletions: [],
    undos: 0,
    toasts: [],
    events: [],
    invalidated: [],
    refreshes: 0,
    mutations: 0,
    feedbackScrolls: [],
  };
  const state = {
    Error,
    managerLock: { current: false },
    noticeAlive: { current: true },
    requestSequence: { current: 0 },
    activeDirectoryTool: { current: kind },
    managerDeleteTarget: { kind, item: { ...entry } },
    managerBusy: false,
    directoryBusy: false,
    directoryError: '',
    ministryMessage: '',
    branchMessage: '',
    blockedMinistryId: '',
    blockedBranchId: '',
    ministries: [{ ...entry }],
    branches: [{ ...entry }],
    form: { ministryIds: [entry.id], branchIds: [entry.id] },
    ministryFilter: entry.id,
    branchFilter: entry.id,
    newManagedMinistryName: '',
    newManagedBranchName: '',
    newManagedMinistryNameValue: '',
    openDirectoryRow: '',
    cache: {
      invalidate(prefix) {
        calls.invalidated.push(prefix);
      },
    },
    window: {
      dispatchEvent(event) {
        calls.events.push(event.type);
      },
    },
    CustomEvent: class {
      constructor(type) {
        this.type = type;
      }
    },
    DirectoryEntryInUseError: class extends Error {},
    ministryMemberCount: () => count,
    branchMemberCount: () => count,
    scrollToDirectoryTools(kind) {
      calls.feedbackScrolls.push(kind);
    },
    async loadData() {
      calls.refreshes++;
      return true;
    },
    emitToast(options) {
      calls.toasts.push(options);
      return 'toast-1';
    },
    async deleteDirectoryEntryWithUndo(client, table, id) {
      calls.deletions.push({ client, table, id });
      if (deleteEntry) return deleteEntry();
      return {
        entry: { ...entry, created_at: '2026-10-01T00:00:00Z' },
        async undo() {
          calls.undos++;
          return undo?.();
        },
      };
    },
    supabase: {
      from() {
        calls.mutations++;
        const query = {
          insert() {
            return query;
          },
          update() {
            return query;
          },
          eq() {
            return query;
          },
          select() {
            return query;
          },
          async single() {
            return mutation
              ? mutation()
              : { data: { id: 'new-1', name: 'New Entry' }, error: null };
          },
        };
        return query;
      },
    },
  };
  const setters = {
    setManagerBusy: 'managerBusy',
    setManagerDeleteTarget: 'managerDeleteTarget',
    setMinistryMessage: 'ministryMessage',
    setBranchMessage: 'branchMessage',
    setBlockedMinistryId: 'blockedMinistryId',
    setBlockedBranchId: 'blockedBranchId',
    setMinistries: 'ministries',
    setBranches: 'branches',
    setForm: 'form',
    setMinistryFilter: 'ministryFilter',
    setBranchFilter: 'branchFilter',
    setOpenDirectoryRow: 'openDirectoryRow',
    setNewManagedMinistryName: 'newManagedMinistryName',
    setNewManagedBranchName: 'newManagedBranchName',
    setRenamingMinistryId: 'renamingMinistryId',
    setRenameValue: 'renameValue',
    setRenamingBranchId: 'renamingBranchId',
    setBranchRenameValue: 'branchRenameValue',
  };
  Object.entries(setters).forEach(([setter, key]) => {
    state[setter] = (value) => {
      state[key] = typeof value === 'function' ? value(state[key]) : value;
    };
  });
  runInNewContext(compiled, state);
  return { state, calls, ...state.handlers };
}

test('manager validation and duplicate add feedback stay inline without a request or toast', async () => {
  const f = fixture();
  f.state.newManagedMinistryName = '  ';
  await f.addManagedMinistry();
  assert.match(f.state.ministryMessage, /name is required/);
  f.state.newManagedMinistryName = ' welcome TEAM ';
  await f.addManagedMinistry();
  assert.match(f.state.ministryMessage, /already exists/);
  assert.equal(f.calls.mutations, 0);
  assert.equal(f.calls.toasts.length, 0);
});

test('successful adds update their list and refresh without a toast', async () => {
  const f = fixture();
  f.state.newManagedBranchName = 'New Entry';
  await f.addManagedBranch();
  assert.equal(f.state.branches.length, 2);
  assert.match(f.state.branchMessage, /was added/);
  assert.equal(f.calls.refreshes, 0);
  assert.equal(f.calls.events.join(','), 'lifecity-directory-change');
  assert.equal(f.calls.toasts.length, 0);
  assert.equal(f.state.managerLock.current, false);
});

test('rename rejects an update that returns no row and retains the entry', async () => {
  const f = fixture({ mutation: () => ({ data: null, error: { code: 'PGRST116' } }) });
  await f.saveDirectoryRename('ministry', entry, 'Renamed');
  assert.equal(f.state.ministries[0].name, entry.name);
  assert.match(f.state.ministryMessage, /Could not rename/);
  assert.equal(f.calls.toasts.length, 0);
  assert.equal(f.state.managerBusy, false);
});

test('assigned entries are blocked inline with an affected-member link target', async () => {
  const f = fixture({ count: 4 });
  f.state.managerDeleteTarget = null;
  await f.deleteMinistry(entry);
  assert.equal(f.state.managerDeleteTarget, null);
  assert.equal(f.state.blockedMinistryId, entry.id);
  assert.match(f.state.ministryMessage, /4 members/);
  assert.equal(f.calls.deletions.length, 0);
  assert.equal(f.calls.toasts.length, 0);
});

test('failed/zero-row deletion keeps the list and produces no success toast', async () => {
  const f = fixture({
    deleteEntry: () => {
      throw new Error('No entry was deleted. Refresh and try again.');
    },
  });
  await f.confirmManagerDelete();
  assert.equal(f.state.ministries.length, 1);
  assert.match(f.state.ministryMessage, /No entry was deleted/);
  assert.equal(f.calls.toasts.length, 0);
  assert.equal(f.calls.invalidated.length, 0);
  assert.equal(f.state.managerLock.current, false);
});

test('successful deletion removes the row and Undo restores it before broadcasting refresh', async () => {
  const f = fixture();
  await f.confirmManagerDelete();
  assert.equal(f.calls.deletions[0].table, 'ministries');
  assert.equal(f.state.ministries.length, 0);
  assert.equal(f.state.form.ministryIds.length, 0);
  assert.equal(f.state.ministryFilter, 'all');
  assert.equal(f.state.managerDeleteTarget, null);
  assert.equal(f.calls.toasts.length, 1);
  assert.equal(f.calls.events.join(','), 'lifecity-directory-change');
  await f.calls.toasts[0].onAction();
  assert.equal(f.calls.undos, 1);
  assert.equal(f.state.ministries[0].id, entry.id);
  assert.match(f.state.ministryMessage, /was restored/);
  assert.equal(f.calls.events.length, 2);
  assert.equal(f.calls.invalidated.join(','), 'members:,members:');
  assert.equal(
    f.calls.refreshes,
    0,
    'the mounted subscriber owns refresh; the handler does not duplicate it',
  );
});

test('rapid confirm clicks issue one deletion', async () => {
  const result = deferred();
  const f = fixture({ deleteEntry: () => result.promise });
  const first = f.confirmManagerDelete();
  await f.confirmManagerDelete();
  assert.equal(f.calls.deletions.length, 1);
  result.resolve({ entry: { ...entry }, undo: async () => {} });
  await first;
  assert.equal(f.calls.toasts.length, 1);
  assert.equal(f.state.managerLock.current, false);
});

test('a server-side assignment race shows affected members and no toast', async () => {
  const f = fixture({
    deleteEntry: () => {
      throw Object.assign(new Error('Assigned'), { code: '23503' });
    },
  });
  await f.confirmManagerDelete();
  assert.equal(f.state.ministries.length, 1);
  assert.equal(f.state.blockedMinistryId, entry.id);
  assert.match(f.state.ministryMessage, /assigned to members/);
  assert.equal(f.calls.toasts.length, 0);
  assert.equal(f.calls.refreshes, 1);
});

test('delete finishing after unmount retains Undo and broadcasts without changing old state', async () => {
  const result = deferred();
  let undos = 0;
  const f = fixture({ deleteEntry: () => result.promise });
  const deletion = f.confirmManagerDelete();
  f.state.noticeAlive.current = false;
  result.resolve({
    entry: { ...entry },
    undo: async () => {
      undos++;
    },
  });
  await deletion;
  assert.equal(f.state.ministries.length, 1);
  assert.equal(f.calls.toasts.length, 1);
  await f.calls.toasts[0].onAction();
  assert.equal(undos, 1);
  assert.equal(f.state.ministries.length, 1);
  assert.equal(f.calls.events.length, 2);
  assert.equal(f.calls.invalidated.length, 2);
});

test('failed Undo rejects for the existing toast and remains retryable', async () => {
  let attempts = 0;
  const f = fixture({
    undo: () => {
      if (++attempts === 1) throw new Error('Connection interrupted. Try Undo again.');
    },
  });
  await f.confirmManagerDelete();
  await assert.rejects(f.calls.toasts[0].onAction(), /Connection interrupted/);
  assert.equal(f.state.ministries.length, 0);
  assert.match(f.state.ministryMessage, /Try Undo again/);
  assert.equal(f.state.managerLock.current, false);
  await f.calls.toasts[0].onAction();
  assert.equal(f.state.ministries.length, 1);
  assert.equal(f.calls.toasts.length, 1);
});

test('both manager lists use swipe actions and keep their messages out of notice toasts', () => {
  assert.equal((source.match(/<DirectorySwipeItem\b/g) ?? []).length, 2);
  assert.doesNotMatch(source, /useNoticeToast\((?:ministryMessage|branchMessage)/);
  assert.match(source, /addEventListener\('lifecity-directory-change', refresh\)/);
  assert.match(source, /removeEventListener\('lifecity-directory-change', refresh\)/);
});

for (const kind of ['ministry', 'branch']) {
  const label = kind === 'ministry' ? 'ministry' : 'church';
  const messageKey = kind === 'ministry' ? 'ministryMessage' : 'branchMessage';
  const listKey = kind === 'ministry' ? 'ministries' : 'branches';
  const nameKey = kind === 'ministry' ? 'newManagedMinistryName' : 'newManagedBranchName';
  const blockedKey = kind === 'ministry' ? 'blockedMinistryId' : 'blockedBranchId';
  const add = (f) => (kind === 'ministry' ? f.addManagedMinistry() : f.addManagedBranch());
  const remove = (f) => (kind === 'ministry' ? f.deleteMinistry(entry) : f.deleteBranch(entry));
  const assertFeedback = (f, pattern, count = 1) => {
    assert.match(f.state[messageKey], pattern);
    assert.equal(f.calls.feedbackScrolls.length, count);
    assert.ok(f.calls.feedbackScrolls.every((target) => target === kind));
  };

  test(`${label} add validation and existing-name feedback keep directory tools available`, async () => {
    const f = fixture({ kind });
    f.state[nameKey] = '   ';
    await add(f);
    assertFeedback(f, /name is required/);
    f.state[nameKey] = ' welcome TEAM ';
    await add(f);
    assertFeedback(f, /already exists/, 2);
    assert.equal(f.calls.mutations, 0);
    assert.equal(f.calls.toasts.length, 0);
  });

  test(`${label} add success and server failures all route feedback to the tools`, async () => {
    for (const [response, pattern] of [
      [{ data: { id: 'new-1', name: 'New Entry' }, error: null }, /was added/],
      [{ data: null, error: { code: '23505' } }, /already exists/],
      [{ data: null, error: { code: 'NETWORK' } }, /Could not add/],
      [{ data: null, error: null }, /Could not add/],
    ]) {
      const f = fixture({ kind, mutation: () => response });
      f.state[nameKey] = 'New Entry';
      await add(f);
      assertFeedback(f, pattern);
      assert.equal(f.calls.toasts.length, 0);
      assert.equal(f.state.managerBusy, false);
      assert.equal(f.state.managerLock.current, false);
    }
  });

  test(`${label} rename validation keeps feedback and tools together without a request`, async () => {
    const f = fixture({ kind });
    f.state[listKey].push({ id: 'other-1', name: 'Other Team' });
    await f.saveDirectoryRename(kind, entry, ' ');
    assertFeedback(f, /name is required/);
    await f.saveDirectoryRename(kind, entry, ' other TEAM ');
    assertFeedback(f, /already exists/, 2);
    assert.equal(f.calls.mutations, 0);
  });

  test(`${label} rename success and server failures keep tools accessible`, async () => {
    for (const [response, pattern] of [
      [{ data: { ...entry, name: 'Renamed Team' }, error: null }, /renamed successfully/],
      [{ data: null, error: { code: '23505' } }, /already exists/],
      [{ data: null, error: { code: 'NETWORK' } }, /Could not rename/],
      [{ data: null, error: null }, /Could not rename/],
    ]) {
      const f = fixture({ kind, mutation: () => response });
      await f.saveDirectoryRename(kind, entry, 'Renamed Team');
      assertFeedback(f, pattern);
      assert.equal(f.calls.toasts.length, 0);
    }
  });

  test(`${label} assigned and unavailable-directory deletion feedback targets tools`, async () => {
    const assigned = fixture({ kind, count: 4 });
    assigned.state.managerDeleteTarget = null;
    await remove(assigned);
    assertFeedback(assigned, /4 members/);
    assert.equal(assigned.state[blockedKey], entry.id);
    assert.equal(assigned.calls.deletions.length, 0);

    const busy = fixture({ kind });
    busy.state.directoryBusy = true;
    await remove(busy);
    assertFeedback(busy, /finish loading/);
    await busy.confirmManagerDelete();
    assertFeedback(busy, /finish loading/, 2);
    assert.equal(busy.calls.deletions.length, 0);
  });

  test(`${label} assignment changes and rejected deletes reveal feedback at the tools`, async () => {
    const reassigned = fixture({ kind, count: 2 });
    await reassigned.confirmManagerDelete();
    assertFeedback(reassigned, /2 members/);
    assert.equal(reassigned.state.managerDeleteTarget, null);
    assert.equal(reassigned.calls.deletions.length, 0);

    for (const error of [
      Object.assign(new Error('Assigned'), { code: '23503' }),
      new Error('No entry was deleted. Refresh and try again.'),
    ]) {
      const f = fixture({
        kind,
        deleteEntry: () => {
          throw error;
        },
      });
      await f.confirmManagerDelete();
      assertFeedback(f, error.code === '23503' ? /assigned to members/ : /No entry was deleted/);
      assert.equal(f.state[listKey].length, 1);
      assert.equal(f.calls.toasts.length, 0);
    }
  });

  test(`${label} successful deletion and Undo feedback both retain access to tools`, async () => {
    const f = fixture({ kind });
    await f.confirmManagerDelete();
    assertFeedback(f, /was deleted/);
    assert.equal(f.state[listKey].length, 0);
    await f.calls.toasts[0].onAction();
    assertFeedback(f, /was restored/, 2);
    assert.equal(f.state[listKey][0].id, entry.id);
  });

  test(`${label} failed Undo routes its feedback to tools and remains retryable`, async () => {
    let attempts = 0;
    const f = fixture({
      kind,
      undo: () => {
        if (++attempts === 1) throw new Error('Restore interrupted. Try Undo again.');
      },
    });
    await f.confirmManagerDelete();
    await assert.rejects(f.calls.toasts[0].onAction(), /Restore interrupted/);
    assertFeedback(f, /Try Undo again/, 2);
    await f.calls.toasts[0].onAction();
    assertFeedback(f, /was restored/, 3);
  });
}

test('feedback clearing does not scroll and unmounted feedback changes neither state nor viewport', () => {
  const f = fixture();
  f.showManagerFeedback('ministry', '');
  assert.equal(f.calls.feedbackScrolls.length, 0);
  f.state.noticeAlive.current = false;
  f.showManagerFeedback('ministry', 'Late result');
  f.showManagerFeedback('branch', 'Late result');
  assert.equal(f.state.ministryMessage, '');
  assert.equal(f.state.branchMessage, '');
  assert.equal(f.calls.feedbackScrolls.length, 0);
});

const scrollNode = component.body.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'scrollToDirectoryTools',
);
assert.ok(scrollNode);
const scrollCompiled = ts.transpileModule(
  scrollNode.getText(ast) + '\nglobalThis.scrollToDirectoryTools = scrollToDirectoryTools',
  {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  },
).outputText;
function scrollFixture({
  top = 100,
  bottom = top + 44,
  headerHeight = 78,
  viewportHeight = 900,
  scrollY = 300,
  active = 'ministry',
  motion = true,
} = {}) {
  const frames = [],
    scrolls = [];
  const state = {
    noticeAlive: { current: true },
    activeDirectoryTool: { current: active },
    directoryToolsNavRef: { current: { getBoundingClientRect: () => ({ top, bottom }) } },
    document: {
      querySelector: () => ({ getBoundingClientRect: () => ({ height: headerHeight }) }),
    },
    window: {
      scrollY,
      innerHeight: viewportHeight,
      requestAnimationFrame: (callback) => {
        frames.push(callback);
      },
      scrollTo: (options) => scrolls.push(options),
    },
    motionEnabled: () => motion,
  };
  runInNewContext(scrollCompiled, state);
  return {
    state,
    frames,
    scrolls,
    scroll: state.scrollToDirectoryTools,
    flush() {
      while (frames.length) frames.shift()();
    },
  };
}

test('manager feedback keeps an already visible tools row stationary', () => {
  const f = scrollFixture();
  f.scroll('ministry');
  f.flush();
  assert.equal(f.scrolls.length, 0);
});

test('clipped tools are restored below the fixed header with the same anchor in both managers', () => {
  for (const kind of ['ministry', 'branch']) {
    for (const bounds of [
      { top: -100, bottom: -56 },
      { top: 880, bottom: 924 },
    ]) {
      const f = scrollFixture({ ...bounds, active: kind });
      f.scroll(kind);
      assert.equal(f.scrolls.length, 0, 'wait for committed layout before measuring');
      f.flush();
      assert.equal(f.scrolls.length, 1);
      assert.equal(f.scrolls[0].top, Math.max(0, 300 + bounds.top - 78 - 20));
      assert.equal(f.scrolls[0].behavior, 'smooth');
    }
  }
});

test('explicitly opening directory tools aligns them even if already visible', () => {
  const f = scrollFixture();
  f.scroll();
  f.flush();
  assert.equal(f.scrolls.length, 1);
  assert.equal(f.scrolls[0].top, 302);
});

test('feedback scroll queued before switching or closing panels cannot move the new view', () => {
  for (const active of ['branch', 'import', null]) {
    const f = scrollFixture({ top: -100 });
    f.scroll('ministry');
    f.frames.shift()();
    f.state.activeDirectoryTool.current = active;
    f.flush();
    assert.equal(f.scrolls.length, 0);
  }
});

test('opening scroll queued before a panel closes cannot move the closed view', () => {
  const f = scrollFixture({ top: -100 });
  f.scroll();
  f.frames.shift()();
  f.state.activeDirectoryTool.current = null;
  f.flush();
  assert.equal(f.scrolls.length, 0);
});

test('queued directory reveal is safe after unmount or tool removal', () => {
  for (const invalidation of ['unmount', 'missing-tools']) {
    const f = scrollFixture({ top: -100 });
    f.scroll('ministry');
    if (invalidation === 'unmount') f.state.noticeAlive.current = false;
    else f.state.directoryToolsNavRef.current = null;
    f.flush();
    assert.equal(f.scrolls.length, 0);
  }
});

test('directory reveal respects reduced motion and clamps its document position', () => {
  const f = scrollFixture({ top: -100, scrollY: 20, motion: false });
  f.scroll('ministry');
  f.flush();
  assert.equal(f.scrolls.length, 1);
  assert.equal(f.scrolls[0].behavior, 'auto');
  assert.equal(f.scrolls[0].top, 0);
});
