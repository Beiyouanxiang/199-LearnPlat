import test, {describe} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'learnplat-image-'))
Object.assign(process.env, {
  NODE_ENV: 'test',
  LEARNPLAT_DATA_DIR: path.join(root, 'data'),
  LEARNPLAT_UPLOAD_DIR: path.join(root, 'uploads'),
  JWT_SECRET: 'image-guard-test-only',
  OCR_MOCK: '1',
  RATE_MAX_TUTOR: '100',
})
const {parseImageInput} = await import('../server/providers/ocr.js')
const {
  prepareImage, runImageTask, resetImageQueueStats, imageQueueStats,
  setFreeMemoryProbe, resetFreeMemoryProbe, JSON_BODY_LIMIT, MAX_IMAGE_BYTES,
} = await import('../server/image-work.js')
const {default: app} = await import('../server/index.js')
const {default: db, createUser} = await import('../server/db.js')
const {signToken} = await import('../server/auth.js')
const {startJobs} = await import('../server/jobs.js')
const server = app.listen(0, '127.0.0.1')
await new Promise((resolve) => server.once('listening', resolve))
const stop = startJobs()
const base = 'http://127.0.0.1:' + server.address().port
const user = createUser('photos', 'test')
const jwt = signToken({userId: user.id})
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8//8/AwMDEwMDAwMDAwAkBgMB/DXemwAAAABJRU5ErkJggg=='

async function api(url, body, token = jwt, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(base + url, {
    method,
    headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  return {status: response.status, retryAfter: response.headers.get('retry-after'), data: text ? JSON.parse(text) : null}
}
async function token(scopes) {
  const created = await api('/api/tokens', {name: 'agent', scopes})
  assert.equal(created.status, 200)
  return created.data.token
}

describe('图片限额、缩放、队列和内存保护', {concurrency: 1}, () => {
test('解码超过 8MB 的图片返回 413', async () => {
  const tooBig = Buffer.alloc(MAX_IMAGE_BYTES + 32 * 1024, 7).toString('base64')
  const parsed = parseImageInput({image: tooBig, mime: 'image/jpeg'})
  assert.equal(parsed.status, 413)
  assert.match(parsed.error, /8MB/)
  assert.ok(Buffer.byteLength(JSON.stringify({image: 'data:image/jpeg;base64,' + tooBig})) < JSON_BODY_LIMIT)
  const agent = await token(['essays:create'])
  const essay = await api('/api/agent/essays', {kind: 'essay'}, agent)
  const uploaded = await api('/api/agent/essays/' + essay.data.id + '/images', {
    role: 'answer', position: 0, image: 'data:image/jpeg;base64,' + tooBig,
  }, agent)
  assert.equal(uploaded.status, 413)
  assert.match(uploaded.data.error, /压缩/)
})

test('大图入库后长边不超过 2000，并写成 JPEG', async () => {
  const raw = await sharp({
    create: {width: 2400, height: 800, channels: 3, background: {r: 20, g: 90, b: 160}},
  }).jpeg().toBuffer()
  const saved = await prepareImage(raw)
  assert.equal(saved.mime, 'image/jpeg')
  assert.equal(Math.max(saved.width, saved.height), 2000)
  assert.ok(saved.width <= 2000 && saved.height <= 2000)
  const agent = await token(['essays:create'])
  const essay = await api('/api/agent/essays', {kind: 'essay'}, agent)
  const uploaded = await api('/api/agent/essays/' + essay.data.id + '/images', {
    role: 'answer', position: 0, image: 'data:image/jpeg;base64,' + raw.toString('base64'),
  }, agent)
  assert.equal(uploaded.status, 200)
  const essayImage = db.prepare('SELECT file_path, mime FROM essay_images WHERE id=?').get(uploaded.data.id)
  assert.equal(essayImage.mime, 'image/jpeg')
  const meta = await sharp(path.join(process.env.LEARNPLAT_UPLOAD_DIR, essayImage.file_path)).metadata()
  assert.ok(Math.max(meta.width, meta.height) <= 2000)
})

test('图片处理队列同时只跑一个任务', async () => {
  resetImageQueueStats()
  let active = 0
  let overlap = 0
  await Promise.all([0, 1, 2].map(() => runImageTask(async () => {
    active += 1
    overlap = Math.max(overlap, active)
    await new Promise((resolve) => setTimeout(resolve, 40))
    active -= 1
  })))
  assert.equal(overlap, 1)
  assert.equal(imageQueueStats().maxActive, 1)
})

test('内存不足时上传返回 503，OCR 任务推迟而不是失败', async () => {
  const agent = await token(['essays:create'])
  const essay = await api('/api/agent/essays', {kind: 'essay'}, agent)
  assert.equal((await api('/api/agent/essays/' + essay.data.id + '/images', {role: 'answer', position: 0, image: png}, agent)).status, 200)
  setFreeMemoryProbe(() => 1024)
  try {
    const blocked = await api('/api/agent/essays/' + essay.data.id + '/images', {role: 'answer', position: 1, image: png}, agent)
    assert.equal(blocked.status, 503)
    assert.match(blocked.data.error, /内存/)
    assert.ok(Number(blocked.retryAfter) >= 1)
    const queued = await api('/api/agent/essays/' + essay.data.id + '/ocr', {}, agent)
    assert.equal(queued.status, 200)
    let row
    for (let i = 0; i < 20; i++) {
      row = db.prepare('SELECT status, attempts, next_run_at, error FROM jobs WHERE id=?').get(queued.data.id)
      if (row && row.next_run_at > Date.now()) break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.equal(row.status, 'queued')
    assert.equal(row.attempts, 0)
    assert.equal(row.error, '')
    assert.ok(row.next_run_at > Date.now())
  } finally {
    resetFreeMemoryProbe()
  }
})

test.after(async () => {
  resetFreeMemoryProbe()
  stop()
  await new Promise((resolve) => server.close(resolve))
  db.close()
  await fs.rm(root, {recursive: true, force: true})
})
})
