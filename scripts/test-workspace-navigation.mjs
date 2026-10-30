import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function load(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(compiled, {
    module,
    exports: module.exports,
    require(name) {
      if (name === 'react') return { createContext: () => ({}), lazy: (read) => ({ read }) };
      if (name === 'react/jsx-runtime') return {};
      throw Error(name);
    },
  });
  return module.exports;
}
const { WorkspaceReadCache } = load('../src/lib/workspaceCache.tsx');
const { preloadable } = load('../src/lib/preloadable.ts');

test('workspace snapshots are isolated between signed-in workspace instances', () => {
  const owner = new WorkspaceReadCache(),
    nextOwner = new WorkspaceReadCache();
  owner.set('members:default', { rows: [{ name: 'Demo Member' }] });
  assert.equal(owner.get('members:default').rows.length, 1);
  assert.equal(nextOwner.get('members:default'), undefined);
});
test('expired snapshots are discarded instead of reused on navigation', () => {
  let now = 0;
  const cache = new WorkspaceReadCache(12, 60_000, () => now);
  cache.set('dashboard:all', { total: 600 });
  now = 59_999;
  assert.equal(cache.get('dashboard:all').total, 600);
  now = 60_000;
  assert.equal(cache.get('dashboard:all'), undefined);
});
test('bounded snapshots evict least recently read entries and keep query keys separate', () => {
  const cache = new WorkspaceReadCache(2);
  cache.set('members:page1', { page: 1 });
  cache.set('members:page2', { page: 2 });
  cache.get('members:page1');
  cache.set('dashboard:all', { total: 600 });
  assert.equal(cache.get('members:page2'), undefined);
  assert.equal(cache.get('members:page1').page, 1);
  assert.equal(cache.get('members:filtered'), undefined);
});
test('directory mutations invalidate all member queries without discarding unrelated snapshots', () => {
  const cache = new WorkspaceReadCache();
  cache.set('members:page1', { page: 1 });
  cache.set('members:filtered', { page: 2 });
  cache.set('dashboard:all', { total: 600 });
  cache.invalidate('members:');
  assert.equal(cache.get('members:page1'), undefined);
  assert.equal(cache.get('members:filtered'), undefined);
  assert.equal(cache.get('dashboard:all').total, 600);
});
test('intent warming and rendering share one module import', async () => {
  let calls = 0;
  const route = preloadable(async () => {
    calls++;
    return { default: () => null };
  });
  const warmed = route.preload(),
    rendered = route.read();
  assert.equal(warmed, rendered);
  await Promise.all([warmed, rendered, route.preload()]);
  assert.equal(calls, 1);
});
test('failed speculative imports can retry when the route is opened', async () => {
  let calls = 0;
  const route = preloadable(async () => {
    if (++calls === 1) throw Error('Offline');
    return { default: () => null };
  });
  await assert.rejects(route.preload(), /Offline/);
  await route.read();
  assert.equal(calls, 2);
});
