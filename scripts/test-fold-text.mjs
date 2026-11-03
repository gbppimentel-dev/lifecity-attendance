import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function compile(file) {
  return ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
}

const foldSource = compile('../src/components/FoldText.tsx');
const panelSource = compile('../src/components/WorkspacePanel.tsx');
const visibility = { Provider: Symbol('WorkspaceVisibility') };
const jsx = (type, props) => ({ type, props });

function events() {
  const listeners = new Map();
  return {
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    },
    removeEventListener(name, listener) {
      listeners.get(name)?.delete(listener);
    },
    emit(name, event = {}) {
      listeners.get(name)?.forEach((listener) => listener(event));
    },
    count() {
      return [...listeners.values()].reduce((total, set) => total + set.size, 0);
    },
  };
}

function panelVisibility(active, parentVisible = true) {
  const module = { exports: {} };
  runInNewContext(panelSource, {
    module,
    exports: module.exports,
    require(name) {
      if (name === 'react')
        return {
          useContext: () => parentVisible,
          useState: () => [true, () => {}],
          useRef: () => ({ current: null }),
          useLayoutEffect: () => {},
        };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === '../lib/workspaceEntrance') return {};
      if (name === '../lib/workspaceVisibility') return { WorkspaceVisibilityContext: visibility };
      if (name.endsWith('.css')) return {};
      throw Error(name);
    },
  });
  const tree = module.exports.default({ active, children: 'retained content' });
  function findProvider(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === visibility.Provider) return node;
    for (const child of [node.props?.children].flat()) {
      const found = findProvider(child);
      if (found) return found;
    }
  }
  const provider = findProvider(tree);
  assert.ok(provider, 'Retained panels must communicate visibility to their children');
  return provider.props.value;
}

function fixture({ visible = true, enabled = true, reduced = false, rendered = true } = {}) {
  const state = { visible, enabled, reduced, rendered };
  const animations = [];
  const media = events();
  const window = { ...events(), matchMedia: () => media };
  const pieces = Array.from({ length: 3 }, () => ({
    animate(frames, options) {
      const animation = {
        frames,
        options,
        cancelled: false,
        finished: new Promise(() => {}),
        cancel() {
          this.cancelled = true;
        },
      };
      animations.push(animation);
      return animation;
    },
  }));
  const element = {
    ...events(),
    querySelectorAll: () => pieces,
    getClientRects: () => (state.visible && state.rendered ? [{}] : []),
  };
  const ref = { current: element };
  let dependencies;
  let pending;
  let cleanup;
  const module = { exports: {} };
  runInNewContext(foldSource, {
    module,
    exports: module.exports,
    window,
    require(name) {
      if (name === 'react')
        return {
          useContext(context) {
            assert.equal(context, visibility);
            return state.visible;
          },
          useRef: () => ref,
          useLayoutEffect(callback, next) {
            if (
              !dependencies ||
              next.some((value, index) => !Object.is(value, dependencies[index]))
            )
              pending = { callback, dependencies: [...next] };
          },
        };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === '../lib/motion') return { motionEnabled: () => state.enabled && !state.reduced };
      if (name === '../lib/workspaceVisibility') return { WorkspaceVisibilityContext: visibility };
      if (name.endsWith('.css')) return {};
      throw Error(name);
    },
  });
  return {
    state,
    animations,
    media,
    window,
    element,
    render() {
      module.exports.default({ text: 'Dashboard' });
      if (pending) {
        cleanup?.();
        dependencies = pending.dependencies;
        cleanup = pending.callback();
        pending = undefined;
      }
    },
    destroy() {
      cleanup?.();
    },
  };
}

test('retained headings replay on every return and ordinary rerenders do not restart them', () => {
  const f = fixture();
  f.render();
  assert.equal(f.animations.length, 3);
  f.render();
  assert.equal(f.animations.length, 3);

  for (let visit = 2; visit <= 4; visit++) {
    f.state.visible = false;
    f.render();
    assert.ok(f.animations.every((animation) => animation.cancelled));
    assert.equal(f.window.count() + f.media.count() + f.element.count(), 0);
    f.state.visible = true;
    f.render();
    assert.equal(f.animations.length, visit * 3);
    assert.equal(f.window.count(), 1);
  }
  f.destroy();
  assert.ok(f.animations.every((animation) => animation.cancelled));
  assert.equal(f.window.count() + f.media.count() + f.element.count(), 0);
});

test('returning to Settings replays only its selected nested heading', () => {
  const accounts = fixture();
  const appearance = fixture({ visible: false });
  function render(settingsActive, accountsActive) {
    const parent = panelVisibility(settingsActive);
    accounts.state.visible = panelVisibility(accountsActive, parent);
    appearance.state.visible = panelVisibility(!accountsActive, parent);
    accounts.render();
    appearance.render();
  }
  render(true, true);
  assert.equal(accounts.animations.length, 3);
  assert.equal(appearance.animations.length, 0);
  render(false, true);
  render(true, true);
  assert.equal(accounts.animations.length, 6);
  assert.equal(appearance.animations.length, 0);
  render(true, false);
  render(false, false);
  render(true, false);
  assert.equal(accounts.animations.length, 6);
  assert.equal(appearance.animations.length, 6);
  accounts.destroy();
  appearance.destroy();
});

test('disabled and reduced motion keep headings static across workspace visits', () => {
  const f = fixture({ enabled: false });
  f.render();
  f.state.visible = false;
  f.render();
  f.state.visible = true;
  f.render();
  assert.equal(f.animations.length, 0);
  f.state.enabled = true;
  f.window.emit('lifecity-motion-change');
  assert.equal(f.animations.length, 3);
  f.state.reduced = true;
  f.media.emit('change');
  assert.ok(f.animations.every((animation) => animation.cancelled));
  f.state.visible = false;
  f.render();
  f.state.visible = true;
  f.render();
  assert.equal(f.animations.length, 3);
  f.destroy();
});

test('hidden desktop or phone variants wait for a visible workspace visit', () => {
  const f = fixture({ rendered: false });
  f.render();
  assert.equal(f.animations.length, 0);
  f.state.visible = false;
  f.render();
  f.state.rendered = true;
  f.state.visible = true;
  f.render();
  assert.equal(f.animations.length, 3);
  f.destroy();
});
