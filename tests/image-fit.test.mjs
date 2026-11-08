import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {Script, createContext} from 'node:vm'

const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8')
const matched = source.match(/function fitLongEdge\(width, height, maxEdge = 2000\) \{[\s\S]*?\n  \}/)
assert.ok(matched, '页面里应有 fitLongEdge')
const fitLongEdge = new Script(matched[0] + '\nfitLongEdge', {filename:'public/app.js'}).runInContext(createContext({}))

function size(width, height) {
  const got = fitLongEdge(width, height)
  return [got.width, got.height]
}
test('长边缩放：超过 2000 才缩小，不放大', () => {
  assert.deepEqual(size(4000, 3000), [2000, 1500])
  assert.deepEqual(size(1000, 4000), [500, 2000])
  assert.deepEqual(size(2000, 1000), [2000, 1000])
  assert.deepEqual(size(800, 600), [800, 600])
  assert.deepEqual(size(0, 0), [1, 1])
})
