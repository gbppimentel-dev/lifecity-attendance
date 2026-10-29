import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

// Exercise the real picker keyboard handler, including focus, without a browser
// or a test-only copy of its navigation logic.
const source = readFileSync(new URL('../src/components/ServiceTimePicker.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('ServiceTimePicker.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'ServiceTimePicker')
const handler = component?.body?.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'choiceKey')
assert.ok(handler, 'Production time picker keyboard handler must be available')
const compiled = ts.transpileModule(`${handler.getText(ast)}\nglobalThis.choiceKey = choiceKey`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText

const hours = Array.from({ length: 12 }, (_, index) => index + 1)
function fixture(columns) {
  const style = { gridTemplateColumns: Array(columns).fill('48px').join(' ') }
  const calls = { value: null, focus: null, prevented: false }
  const state = { getComputedStyle: () => style }
  runInNewContext(compiled, state)
  return {
    resize(next) { style.gridTemplateColumns = Array(next).fill('48px').join(' ') },
    press(key, current, values = hours, columnMode = 'grid') {
      Object.assign(calls, { value: null, focus: null, prevented: false })
      const parent = { querySelectorAll: () => values.map(value => ({ focus: () => { calls.focus = value } })) }
      state.choiceKey({ key, currentTarget: { parentElement: parent }, preventDefault: () => { calls.prevented = true } },
        values, current, columnMode, value => { calls.value = value })
      return { ...calls }
    },
  }
}

test('phone hour arrows select and focus the next visual row, wrapping at its ends', () => {
  const picker = fixture(4)
  assert.deepEqual(picker.press('ArrowDown', 1), { value: 5, focus: 5, prevented: true })
  assert.deepEqual(picker.press('ArrowDown', 9), { value: 1, focus: 1, prevented: true })
  assert.deepEqual(picker.press('ArrowUp', 1), { value: 9, focus: 9, prevented: true })
})

test('desktop hour arrows retain the six-column navigation', () => {
  const picker = fixture(6)
  assert.equal(picker.press('ArrowDown', 1).focus, 7)
  assert.equal(picker.press('ArrowUp', 7).focus, 1)
})

test('resizing an open picker immediately changes keyboard row navigation', () => {
  const picker = fixture(6)
  assert.equal(picker.press('ArrowDown', 2).value, 8)
  picker.resize(4)
  assert.equal(picker.press('ArrowDown', 2).value, 6)
  picker.resize(6)
  assert.equal(picker.press('ArrowDown', 2).value, 8)
})

test('horizontal and boundary keys keep selection and focus together', () => {
  const picker = fixture(4)
  for (const [key, from, to] of [['ArrowRight', 12, 1], ['ArrowLeft', 1, 12], ['Home', 8, 1], ['End', 2, 12]]) {
    assert.deepEqual(picker.press(key, from), { value: to, focus: to, prevented: true })
  }
  assert.deepEqual(picker.press('Tab', 2), { value: null, focus: null, prevented: false })
})

test('minute and AM/PM groups keep their existing adjacent-choice navigation', () => {
  const picker = fixture(4)
  assert.equal(picker.press('ArrowDown', '45', ['00', '15', '30', '45'], 1).focus, '00')
  assert.equal(picker.press('ArrowUp', 'AM', ['AM', 'PM'], 1).focus, 'PM')
})
