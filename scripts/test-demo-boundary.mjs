import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

function compile(file) {
  return ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('import.meta.env', '__env'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText
}

function modeRuntime(pathname = '/', env = {}) {
  const module = { exports: {} }
  runInNewContext(compile('../src/demo/mode.ts'), {
    module, exports: module.exports, __env: env, URL, window: { location: { pathname } },
  })
  return module.exports
}

test('only the explicit demo path or a dedicated demo build selects the showcase', () => {
  const mode = modeRuntime()
  for (const path of ['/demo', '/demo/', '/demo/member']) assert.equal(mode.demoModeFor(undefined, path), true)
  for (const path of ['/', '/members', '/democracy', '/demo-preview', '/anything/demo']) assert.equal(mode.demoModeFor(undefined, path), false)
  assert.equal(mode.demoModeFor('demo', '/'), true)
  assert.equal(mode.demoModeFor('live', '/'), false)
})

test('demo motion preferences cannot overwrite the real app preference', () => {
  assert.equal(modeRuntime('/').demoPreferenceKey('lifecity-motion-enabled'), 'lifecity-motion-enabled')
  assert.equal(modeRuntime('/demo/').demoPreferenceKey('lifecity-motion-enabled'), 'lifecity-demo:lifecity-motion-enabled')
  assert.equal(modeRuntime('/', { VITE_APP_MODE: 'demo' }).demoPreferenceKey('lifecity-motion-enabled'), 'lifecity-demo:lifecity-motion-enabled')
})

test('original-site links use the documented HTTPS site when configuration is invalid', () => {
  for (const value of ['javascript:alert(1)', 'http://example.com', 'https://user:pass@example.com', 'invalid']) {
    assert.equal(modeRuntime('/', { VITE_ORIGINAL_SITE_URL: value }).originalSiteUrl, 'https://lifecity-attendance.vercel.app/')
  }
  assert.equal(modeRuntime('/', { VITE_ORIGINAL_SITE_URL: 'https://example.com/app/' }).originalSiteUrl, 'https://example.com/app/')
})

function clientRuntime(demo, env) {
  const calls = { live: [], demo: 0 }
  const demoClient = { kind: 'local-demo' }, liveClient = { kind: 'live' }, module = { exports: {} }
  runInNewContext(compile('../src/lib/supabase.ts'), {
    module, exports: module.exports, __env: env,
    require(name) {
      if (name === '@supabase/supabase-js') return { createClient: (...args) => { calls.live.push(args); return liveClient } }
      if (name === '../demo/client') return { createDemoClient: () => { calls.demo++; return demoClient } }
      if (name === '../demo/mode') return { isDemoMode: () => demo }
      throw new Error(`Unexpected module ${name}`)
    },
  })
  return { calls, client: module.exports.supabase, demoClient, liveClient }
}

test('demo startup never creates a live Supabase/auth/realtime client, even with live settings present', () => {
  for (const env of [{}, { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-key' }]) {
    const runtime = clientRuntime(true, env)
    assert.equal(runtime.client, runtime.demoClient)
    assert.equal(runtime.calls.demo, 1)
    assert.deepEqual(runtime.calls.live, [])
  }
})

test('the real site continues to require and use its existing Supabase settings', () => {
  assert.throws(() => clientRuntime(false, {}), /Missing Supabase settings/)
  const runtime = clientRuntime(false, { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-key' })
  assert.equal(runtime.client, runtime.liveClient)
  assert.equal(runtime.calls.demo, 0)
  assert.deepEqual(runtime.calls.live, [['https://example.supabase.co', 'public-key']])
})

test('every named RPC used by a shared screen has an explicit local demo implementation', () => {
  const required = new Set()
  function inspect(url) {
    for (const entry of readdirSync(url, { withFileTypes: true })) {
      const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), url)
      if (entry.isDirectory()) { if (entry.name !== 'demo') inspect(child); continue }
      if (!/\.tsx?$/.test(entry.name)) continue
      const source = ts.createSourceFile(child.pathname, readFileSync(child, 'utf8'), ts.ScriptTarget.Latest, true)
      function visit(node) {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'rpc' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) required.add(node.arguments[0].text)
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
  }
  inspect(new URL('../src/', import.meta.url))
  const implemented = new Set()
  const source = ts.createSourceFile('demo-client.ts', readFileSync(new URL('../src/demo/client.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true)
  function visit(node) {
    if (ts.isCaseClause(node) && ts.isStringLiteral(node.expression)) implemented.add(node.expression.text)
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken && ts.isIdentifier(node.left) && node.left.text === 'name' && ts.isStringLiteral(node.right)) implemented.add(node.right.text)
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.deepEqual([...required].filter(name => !implemented.has(name)), [], 'A shared app operation has no isolated demo handler')
})

test('Vercel demo rewrites and the demo PWA identity leave the real root route separate', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.deepEqual(config.rewrites, [{ source: '/demo', destination: '/index.html' }, { source: '/demo/:path*', destination: '/index.html' }])
  const demo = JSON.parse(readFileSync(new URL('../public/manifest-demo.webmanifest', import.meta.url), 'utf8'))
  assert.equal(demo.id, '/demo/'); assert.equal(demo.start_url, '/demo/'); assert.equal(demo.scope, '/demo/')
  assert.equal(demo.name, 'LifeCity Attendance Demo')
})
