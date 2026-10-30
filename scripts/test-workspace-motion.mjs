import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/motion.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;

function runtime({ enabled = true, reduced = false, supportsAnimation = true } = {}) {
  const animations = [];
  const documentElement = { dataset: {} };
  const page = supportsAnimation
    ? {
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
      }
    : {};
  const module = { exports: {} };
  let flushes = 0;
  const context = {
    module,
    exports: module.exports,
    require(name) {
      if (name === 'react') return {};
      if (name === 'react/jsx-runtime') return {};
      if (name === 'react-dom')
        return {
          flushSync(update) {
            flushes++;
            update();
          },
        };
      if (name === '../components/AnimatedContent') return {};
      if (name === '../demo/mode') return { demoPreferenceKey: (key) => key };
      throw Error('Unexpected module: ' + name);
    },
    document: { documentElement, querySelector: () => page },
    window: { matchMedia: () => ({ matches: reduced }) },
    localStorage: { getItem: () => (enabled ? 'on' : 'off') },
  };
  runInNewContext(compiled, context);
  return {
    ...module.exports,
    animations,
    documentElement,
    get flushes() {
      return flushes;
    },
  };
}

test('navigation commits synchronously before the shared content runtime observes it', () => {
  const motion = runtime();
  let page = 'Dashboard';
  motion.changeWithMotion(() => {
    page = 'Services';
    assert.equal(motion.animations.length, 0);
  });
  assert.equal(page, 'Services');
  assert.equal(motion.flushes, 1);

  assert.equal(motion.animations.length, 0);
});

test('rapid navigation commits every requested destination exactly once', () => {
  const motion = runtime();
  const changes = [];
  motion.changeWithMotion(() => changes.push('Services'));
  motion.changeWithMotion(() => changes.push('Members'));
  assert.deepEqual(changes, ['Services', 'Members']);
  assert.equal(motion.flushes, 2);
  assert.equal(motion.animations.length, 0);
});

test('turning motion off keeps the next navigation immediate without a flush or page effect', () => {
  const motion = runtime();
  motion.changeWithMotion(() => {});
  motion.documentElement.dataset.lcMotion = 'off';
  let committed = false;
  motion.changeWithMotion(() => {
    committed = true;
  });
  assert.equal(committed, true);
  assert.equal(motion.flushes, 1);
  assert.equal(motion.animations.length, 0);
});

test('the saved off preference performs navigation without scheduling animation', () => {
  const motion = runtime({ enabled: false });
  let committed = 0;
  motion.changeWithMotion(() => {
    committed++;
  });
  assert.equal(committed, 1);
  assert.equal(motion.motionEnabled(), false);
  assert.equal(motion.animations.length, 0);
});

test('device reduced motion overrides a saved on preference', () => {
  const motion = runtime({ reduced: true });
  let committed = false;
  motion.changeWithMotion(() => {
    committed = true;
  });
  assert.equal(committed, true);
  assert.equal(motion.documentElement.dataset.lcMotion, 'off');
  assert.equal(motion.animations.length, 0);
});

test('browsers without Web Animations still commit navigation', () => {
  const motion = runtime({ supportsAnimation: false });
  let committed = 0;
  motion.changeWithMotion(() => {
    committed++;
  });
  assert.equal(committed, 1);
  assert.equal(motion.animations.length, 0);
});
