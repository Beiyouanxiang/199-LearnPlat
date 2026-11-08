import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash, randomBytes, webcrypto} from 'node:crypto'
import {Script, createContext} from 'node:vm'

// 直接运行前端实际使用的兼容函数，避免测试副本与页面实现脱节。
const appSource = await readFile(new URL('../public/app.js', import.meta.url), 'utf8')
const helperSource = appSource.match(/\/\/ ---------- HTTP 非安全上下文兼容[^\n]*\n([\s\S]+?)\/\/ ---------- 批量上传与校对/)
assert.ok(helperSource, '应能找到独立的非安全上下文兼容函数段')
const helpers = new Script(helperSource[1] + '\n;({makeUUID, sha256Pure, sha256Hex, copyText})', {filename:'public/app.js'})
const load = (globals = {}) => helpers.runInContext(createContext({isSecureContext:false, ...globals}))
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function checkUUID(value) {
  assert.match(value, uuidPattern)
  const bytes = Buffer.from(value.replaceAll('-', ''), 'hex')
  assert.equal(bytes[6] >>> 4, 4)
  assert.equal(bytes[8] >>> 6, 2)
}

for (const [name, globals] of [
  ['仅 getRandomValues', {crypto:{getRandomValues:bytes => webcrypto.getRandomValues(bytes)}}],
  ['crypto 缺失，使用 Math.random', {}],
  ['crypto 无随机 API，使用 Math.random', {crypto:{}}]
]) {
  test('HTTP makeUUID 格式、版本位和 1000 次唯一性：' + name, () => {
    const {makeUUID} = load(globals)
    const ids = Array.from({length:1000}, () => makeUUID())
    ids.forEach(checkUUID)
    assert.equal(new Set(ids).size, ids.length)
  })
}

test('makeUUID 正确覆盖全 0 / 全 1 随机字节的 version/variant 位', () => {
  for (const byte of [0, 255]) {
    const {makeUUID} = load({crypto:{getRandomValues:bytes => bytes.fill(byte)}})
    checkUUID(makeUUID())
  }
})

test('makeUUID 优先使用原生 randomUUID 并保留调用接收者', () => {
  const expected = 'a837c39e-5448-424f-92e2-3aa9ed74dc9e'
  const crypto = {
    randomUUID() { assert.equal(this, crypto); return expected },
    getRandomValues() { assert.fail('不应进入降级') }
  }
  assert.equal(load({isSecureContext:true, crypto}).makeUUID(), expected)
})

const payloads = [
  ['空缓冲', Buffer.alloc(0)],
  ['短 ASCII', Buffer.from('abc')],
  ['UTF-8', Buffer.from('中文批改材料 🌏 café\n\u0000')],
  ...[1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1024, 65536].map(length =>
    ['随机二进制 ' + length + ' 字节', randomBytes(length)])
]
for (const [name, bytes] of payloads) {
  test('HTTP SHA-256 与 Node 逐字节一致：' + name, async () => {
    const expected = createHash('sha256').update(bytes).digest()
    const buffer = Uint8Array.from(bytes).buffer
    for (const globals of [{}, {crypto:{}}, {crypto:{subtle:{}}}]) {
      const {sha256Hex, sha256Pure} = load(globals)
      const hex = await sha256Hex(buffer)
      assert.match(hex, /^[0-9a-f]{64}$/)
      assert.equal(hex, expected.toString('hex'))
      assert.deepEqual(Buffer.from(hex, 'hex'), expected)
      assert.equal(sha256Pure(new Uint8Array(buffer)), hex)
    }
  })
}

test('sha256Hex 原生与降级路径都只读取 BufferSource 视图范围', async () => {
  const bytes = randomBytes(160)
  const inputs = [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    new Uint8Array(bytes.buffer, bytes.byteOffset + 7, 93),
    new DataView(bytes.buffer, bytes.byteOffset + 13, 71)]
  let calls = 0
  const subtle = {digest(algorithm, data) {
    assert.equal(this, subtle)
    assert.equal(algorithm, 'SHA-256')
    calls++
    return webcrypto.subtle.digest(algorithm, data)
  }}
  const native = load({isSecureContext:true, crypto:{subtle}})
  const fallback = load()
  for (const input of inputs) {
    const view = ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : new Uint8Array(input)
    const expected = createHash('sha256').update(view).digest('hex')
    assert.equal(await native.sha256Hex(input), expected)
    assert.equal(await fallback.sha256Hex(input), expected)
  }
  assert.equal(calls, inputs.length)
})

function clipboardDOM(exec = () => true) {
  const children = [], commands = [], created = []
  const document = {
    createElement(tag) {
      assert.equal(tag, 'textarea')
      const element = {style:{}, attributes:{}, selected:false,
        setAttribute(name, value) { this.attributes[name] = value },
        select() { assert.ok(children.includes(this)); this.selected = true }
      }
      created.push(element)
      return element
    },
    body:{
      appendChild(element) { children.push(element) },
      removeChild(element) {
        assert.equal(children.indexOf(element), 0)
        children.splice(0, 1)
      }
    }
  }
  if (exec) document.execCommand = function (command) {
    assert.equal(this, document)
    assert.equal(command, 'copy')
    assert.equal(children.length, 1)
    assert.equal(children[0].selected, true)
    commands.push({command, text:children[0].value})
    return exec()
  }
  return {document, children, commands, created}
}

for (const [name, navigator] of [
  ['navigator 缺失', undefined],
  ['clipboard 缺失', {}],
  ['writeText 缺失', {clipboard:{}}],
  ['writeText 同步抛错', {clipboard:{writeText() { throw new Error('denied') }}}],
  ['writeText 异步拒绝', {clipboard:{async writeText() { throw new Error('denied') }}}]
]) {
  test('HTTP copyText 使用 textarea 复制并清理：' + name, async () => {
    const dom = clipboardDOM()
    const text = '批改材料\n含 "引文" 与 emoji 📝'
    await load({navigator, document:dom.document}).copyText(text)
    assert.deepEqual(dom.commands, [{command:'copy', text}])
    assert.equal(dom.created.length, 1)
    assert.equal(dom.created[0].attributes.readonly, '')
    assert.deepEqual(dom.children, [])
  })
}

test('copyText 原生成功时不创建 textarea', async () => {
  const dom = clipboardDOM()
  const copied = []
  const clipboard = {async writeText(text) { assert.equal(this, clipboard); copied.push(text) }}
  await load({isSecureContext:true, navigator:{clipboard}, document:dom.document}).copyText('材料')
  assert.deepEqual(copied, ['材料'])
  assert.deepEqual(dom.created, [])
  assert.deepEqual(dom.commands, [])
})

for (const [name, exec] of [
  ['execCommand 缺失', null],
  ['execCommand 返回 false', () => false],
  ['execCommand 抛错', () => { throw new Error('blocked') }]
]) {
  test('copyText 降级失败给出操作建议并清理：' + name, async () => {
    const dom = clipboardDOM(exec)
    await assert.rejects(load({document:dom.document}).copyText('材料'), /当前浏览器限制自动复制，请改用下载或手动复制/)
    assert.deepEqual(dom.children, [])
  })
}
