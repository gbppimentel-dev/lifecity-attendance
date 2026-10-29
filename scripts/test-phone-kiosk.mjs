import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

// Exercise the real kiosk handler and effects without a camera, fullscreen
// permission, browser, or backend. The phone must keep desktop fullscreen intact.
const source = readFileSync(new URL('../src/components/AttendanceScanner.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('AttendanceScanner.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AttendanceScanner')
assert.ok(component?.body)
const toggle = component.body.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'toggleKioskMode')
assert.ok(toggle, 'Production kiosk handler must be available')
const effects = component.body.statements.filter(node => ts.isExpressionStatement(node)
  && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === 'useEffect')
  .map(node => node.expression.arguments[0])
const viewportEffect = effects.find(node => node?.getText(ast).includes('--lc-scan-viewport-height'))
const isolationEffect = effects.find(node => node?.getText(ast).includes('document.body.style.overflow'))
assert.ok(viewportEffect, 'Production phone viewport effect must be available')
assert.ok(isolationEffect, 'Production kiosk isolation effect must be available')
const compiled = ts.transpileModule(`${toggle.getText(ast)}
globalThis.toggle = toggleKioskMode
globalThis.mountViewport = ${viewportEffect.getText(ast)}
globalThis.mountIsolation = ${isolationEffect.getText(ast)}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText

function events(extra = {}) {
  const listeners = new Map()
  return { ...extra, listeners,
    addEventListener(name, callback) { listeners.set(name, callback) },
    removeEventListener(name, callback) { if (listeners.get(name) === callback) listeners.delete(name) },
  }
}
function fixture({ phone = true, kiosk = false, nativeFullscreen = false, rejectFullscreen = false } = {}) {
  const calls = { requested: 0, exited: 0, focus: [] }
  class Element {
    constructor(parent = null, inert = false) {
      this.parentElement = parent; this.children = []; this.inert = inert
      if (parent) parent.children.push(this)
    }
  }
  const body = new Element(), app = new Element(body), topbar = new Element(app)
  const content = new Element(app), bottomNav = new Element(app, true), scanner = new Element(content)
  body.style = { overflow: 'auto' }
  const properties = new Map()
  scanner.style = { setProperty: (name, value) => properties.set(name, value), removeProperty: name => properties.delete(name) }
  scanner.requestFullscreen = async () => { calls.requested++; if (rejectFullscreen) throw Error('Fullscreen unavailable') }
  const viewport = events({ height: 743.9, offsetTop: 5.9 })
  const media = events({ matches: phone })
  const window = events({ visualViewport: viewport, innerHeight: 800 })
  const document = { body, fullscreenElement: nativeFullscreen ? scanner : null, async exitFullscreen() { calls.exited++; document.fullscreenElement = null } }
  const frames = new Map(); let serial = 0
  const state = {
    HTMLElement: Element, Math,
    window, document, isKioskMode: kiosk,
    scannerLayoutRef: { current: scanner },
    kioskButtonRef: { current: { focus: value => calls.focus.push(value.preventScroll) } },
    setIsKioskMode: value => { state.isKioskMode = value },
    matchMedia(query) { assert.equal(query, '(max-width:900px)'); return media },
    requestAnimationFrame(callback) { const id = ++serial; frames.set(id, callback); return id },
    cancelAnimationFrame(id) { frames.delete(id) },
  }
  runInNewContext(compiled, state)
  return { state, calls, properties, window, document, media, viewport, topbar, bottomNav,
    flushFrames() { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()) },
    pendingFrames: () => frames.size,
  }
}

test('phone kiosk fills the app viewport without requesting browser fullscreen', async () => {
  const f = fixture()
  await f.state.toggle()
  assert.equal(f.state.isKioskMode, true)
  assert.equal(f.calls.requested, 0)
  await f.state.toggle()
  assert.equal(f.state.isKioskMode, false)
  assert.equal(f.calls.exited, 0)
})

test('desktop kiosk keeps native fullscreen entry, exit and denied-fullscreen fallback', async () => {
  const f = fixture({ phone: false })
  await f.state.toggle()
  assert.equal(f.state.isKioskMode, true)
  assert.equal(f.calls.requested, 1)
  f.document.fullscreenElement = f.state.scannerLayoutRef.current
  await f.state.toggle()
  assert.equal(f.state.isKioskMode, false)
  assert.equal(f.calls.exited, 1)
  const fallback = fixture({ phone: false, rejectFullscreen: true })
  await fallback.state.toggle()
  assert.equal(fallback.state.isKioskMode, true)
  assert.equal(fallback.calls.requested, 1)
})

test('exiting kiosk never closes another element’s fullscreen session', async () => {
  const f = fixture({ kiosk: true })
  f.document.fullscreenElement = {}
  await f.state.toggle()
  assert.equal(f.state.isKioskMode, false)
  assert.equal(f.calls.exited, 0)
})

test('phone kiosk follows visible viewport changes and removes its sizing on desktop/exit', () => {
  const f = fixture({ kiosk: true })
  const clean = f.state.mountViewport()
  assert.equal(f.properties.get('--lc-scan-viewport-height'), '743px')
  assert.equal(f.properties.get('--lc-scan-viewport-top'), '5px')
  f.viewport.height = 501.6; f.viewport.offsetTop = 0
  f.viewport.listeners.get('resize')()
  f.flushFrames()
  assert.equal(f.properties.get('--lc-scan-viewport-height'), '501px')
  assert.equal(f.properties.get('--lc-scan-viewport-top'), '0px')
  f.media.matches = false; f.media.listeners.get('change')(); f.flushFrames()
  assert.equal(f.properties.size, 0)
  f.viewport.listeners.get('scroll')()
  assert.equal(f.pendingFrames(), 1)
  clean()
  assert.equal(f.pendingFrames(), 0)
  assert.equal(f.viewport.listeners.size, 0)
  assert.equal(f.window.listeners.size, 0)
  assert.equal(f.media.listeners.size, 0)
  assert.equal(f.properties.size, 0)
})

test('non-kiosk scanner does not install phone viewport tracking', () => {
  const f = fixture()
  assert.equal(f.state.mountViewport(), undefined)
  assert.equal(f.properties.size, 0)
  assert.equal(f.viewport.listeners.size, 0)
  assert.equal(f.window.listeners.size, 0)
})

test('kiosk exit restores scroll, existing inert state and keyboard focus', () => {
  const f = fixture({ kiosk: true })
  const clean = f.state.mountIsolation()
  assert.equal(f.document.body.style.overflow, 'hidden')
  assert.equal(f.topbar.inert, true)
  assert.equal(f.bottomNav.inert, true)
  assert.deepEqual(f.calls.focus, [true])
  f.window.listeners.get('keydown')({ key: 'Escape' })
  assert.equal(f.state.isKioskMode, false)
  clean()
  assert.equal(f.document.body.style.overflow, 'auto')
  assert.equal(f.topbar.inert, false)
  assert.equal(f.bottomNav.inert, true)
  assert.equal(f.window.listeners.size, 0)
  assert.deepEqual(f.calls.focus, [true, true])
})
