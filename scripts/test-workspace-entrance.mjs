import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(
  readFileSync(new URL('../src/lib/workspaceEntrance.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;

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
    count: () => [...listeners.values()].reduce((sum, group) => sum + group.size, 0),
  };
}

function fixture() {
  const animations = [];
  const frames = new Map();
  const observers = [];
  const state = { enabled: true, reduced: false };
  let nextFrame = 0;
  class Element {
    constructor(kind, parentElement = null) {
      Object.assign(this, events());
      this.kind = kind;
      this.parentElement = parentElement;
      this.children = [];
      this.loading = false;
      this.isConnected = true;
      parentElement?.children.push(this);
    }
    matches(selector) {
      return selector === '.surface' && this.kind === 'surface';
    }
    closest(selector) {
      for (let current = this; current; current = current.parentElement) {
        if (selector === '[data-lc-workspace-surface]' && current.kind === 'workspace')
          return current;
        if (selector === '.surface' && current.kind === 'surface') return current;
        if (selector.includes('data-lc-loading') && current.loading) return current;
      }
      return null;
    }
    contains(element) {
      for (let current = element; current; current = current.parentElement)
        if (current === this) return true;
      return false;
    }
    querySelectorAll(selector) {
      const result = [];
      for (const child of this.children) {
        if (child.matches(selector)) result.push(child);
        result.push(...child.querySelectorAll(selector));
      }
      return result;
    }
    querySelector(selector) {
      if (selector === '[data-lc-workspace-surface]')
        return this.children.find((child) => child.kind === 'workspace') ?? null;
      return null;
    }
    getBoundingClientRect() {
      return { width: 100, height: 100 };
    }
    animate(keyframes, options) {
      const animation = {
        target: this,
        keyframes,
        options,
        playState: 'running',
        currentTime: null,
        finished: new Promise(() => {}),
        pause() {
          this.playState = 'paused';
        },
        play() {
          this.playState = 'running';
        },
        cancel() {
          this.playState = 'idle';
        },
      };
      animations.push(animation);
      return animation;
    }
  }
  const media = events();
  const window = events();
  const document = { ...events(), activeElement: null, hidden: false };
  const root = new Element('workspace');
  const module = { exports: {} };
  runInNewContext(compiled, {
    module,
    exports: module.exports,
    HTMLElement: Element,
    window,
    document,
    matchMedia: () => media,
    requestAnimationFrame(callback) {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe() {
        this.connected = true;
      }
      disconnect() {
        this.connected = false;
      }
    },
    require(name) {
      assert.equal(name, './motion');
      return {
        contentRevealSelector: '.surface',
        motionEnabled: () => state.enabled && !state.reduced,
      };
    },
  });
  return {
    root,
    document,
    window,
    media,
    frames,
    observers,
    animations,
    state,
    surface: (parent = root) => new Element('surface', parent),
    control: (parent) => new Element('control', parent),
    start: () => module.exports.animateWorkspaceEntrance(root),
    tick() {
      const queued = [...frames.values()];
      frames.clear();
      queued.forEach((callback) => callback());
    },
    ready(surface) {
      surface.loading = false;
      observers.forEach((observer) => {
        if (observer.connected)
          observer.callback([{ type: 'attributes', target: surface, addedNodes: [] }]);
      });
    },
  };
}

test('entrances hold their first frame through layout and replay on a retained workspace return', () => {
  const f = fixture();
  f.surface();
  for (let visit = 0; visit < 3; visit++) {
    const stop = f.start();
    const current = f.animations.slice(visit * 2);
    assert.equal(current.length, 2);
    assert.ok(
      current.every((animation) => animation.playState === 'paused' && animation.currentTime === 0),
    );
    f.tick();
    assert.ok(current.every((animation) => animation.playState === 'paused'));
    f.tick();
    assert.ok(current.every((animation) => animation.playState === 'running'));
    stop();
    assert.ok(current.every((animation) => animation.playState === 'idle'));
    assert.equal(f.frames.size, 0);
    assert.equal(f.root.count() + f.window.count() + f.media.count() + f.document.count(), 0);
  }
});

test('slow first results get their own entrance, while ordinary data updates do not replay it', () => {
  const f = fixture();
  const list = f.surface();
  list.loading = true;
  const stop = f.start();
  assert.equal(f.animations.length, 1);
  f.tick();
  f.tick();
  f.ready(list);
  assert.equal(f.animations.length, 2);
  assert.equal(f.animations[1].target, list);
  assert.equal(f.animations[1].playState, 'paused');
  f.tick();
  f.tick();
  assert.equal(f.animations[1].playState, 'running');
  f.ready(list);
  assert.equal(f.animations.length, 2);
  stop();
});

test('leaving or disabling motion cancels pending frames before stale entrances can play', () => {
  const f = fixture();
  f.surface();
  const stop = f.start();
  stop();
  f.tick();
  f.tick();
  assert.ok(f.animations.every((animation) => animation.playState === 'idle'));
  const cleanup = f.start();
  f.state.reduced = true;
  f.media.emit('change');
  f.tick();
  f.tick();
  assert.ok(f.animations.every((animation) => animation.playState === 'idle'));
  assert.ok(f.observers.every((observer) => !observer.connected));
  cleanup();
  const count = f.animations.length;
  assert.equal(f.start(), undefined);
  assert.equal(f.animations.length, count);
});

test('interacting with a loading card leaves its controls still while other cards keep easing in', () => {
  const f = fixture();
  const first = f.surface();
  const second = f.surface();
  first.loading = true;
  const input = f.control(first);
  const stop = f.start();
  f.document.activeElement = input;
  f.root.emit('focusin', { target: input });
  f.ready(first);
  f.tick();
  f.tick();
  assert.equal(f.animations.find((animation) => animation.target === f.root).playState, 'idle');
  assert.equal(f.animations.find((animation) => animation.target === second).playState, 'running');
  assert.equal(
    f.animations.some((animation) => animation.target === first),
    false,
  );
  stop();
});
