// 图片解码、缩放和 OCR 读图共用一把锁，避免多张大图同时进内存。
import fs from 'node:fs'
import os from 'node:os'
import sharp from 'sharp'

sharp.cache(false)
sharp.concurrency(1)

export const MAX_IMAGE_BYTES = Math.max(1, Number(process.env.MAX_IMAGE_BYTES || 8 * 1024 * 1024))
// 一张图的 base64 加上 JSON 外壳。请求体再大就在进业务前被 413 挡住。
export const JSON_BODY_LIMIT = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 512 * 1024
const MAX_EDGE = 2000
const JPEG_QUALITY = 82

export class MemoryLowError extends Error {
  constructor(message = '服务器内存紧张，请稍后再上传或识别') {
    super(message)
    this.name = 'MemoryLowError'
    this.code = 'MEMORY_LOW'
    this.status = 503
    this.retryAfter = Math.max(1, Number(process.env.IMAGE_RETRY_AFTER || 30))
  }
}

let memoryProbe = null
export function setFreeMemoryProbe(fn) { memoryProbe = typeof fn === 'function' ? fn : null }
export function resetFreeMemoryProbe() { memoryProbe = null }

function readMeminfo() {
  try {
    const text = fs.readFileSync('/proc/meminfo', 'utf8')
    const grab = (name) => {
      const matched = text.match(new RegExp('^' + name + ':\\s+(\\d+)\\s+kB', 'm'))
      return matched ? Number(matched[1]) * 1024 : null
    }
    return { memFree: grab('MemFree'), memAvailable: grab('MemAvailable') }
  } catch {
    return null
  }
}

// 可用内存 = 空闲 + 可回收缓存。Linux 上 Node 的 freemem 往往已经等于 MemAvailable，
// 那时不再把 MemAvailable 加第二次。
export function availableMemoryBytes() {
  if (memoryProbe) return memoryProbe()
  const free = os.freemem()
  const info = readMeminfo()
  if (!info || info.memAvailable == null) return free
  const reclaimable = Math.max(0, info.memAvailable - (info.memFree ?? info.memAvailable))
  if (info.memFree != null && free <= info.memFree + reclaimable * 0.25) return free + reclaimable
  return Math.max(free, info.memAvailable)
}

export function minFreeBytes() {
  return Math.max(0, Number(process.env.IMAGE_MIN_FREE_MB || 150)) * 1024 * 1024
}

export function assertImageMemory() {
  if (availableMemoryBytes() < minFreeBytes()) throw new MemoryLowError()
}

let active = 0
let maxActive = 0
const waiters = []

export function resetImageQueueStats() { maxActive = active }
export function imageQueueStats() { return { active, maxActive, waiting: waiters.length } }

export function runImageTask(fn) {
  return new Promise((resolve, reject) => {
    waiters.push({ fn, resolve, reject })
    drainImageQueue()
  })
}

function drainImageQueue() {
  if (active >= 1 || waiters.length === 0) return
  const job = waiters.shift()
  active += 1
  maxActive = Math.max(maxActive, active)
  Promise.resolve()
    .then(() => {
      assertImageMemory()
      return job.fn()
    })
    .then(job.resolve, job.reject)
    .finally(() => {
      active -= 1
      drainImageQueue()
    })
}

export async function prepareImage(input) {
  return runImageTask(() => encodeImage(input))
}

async function encodeImage(input) {
  try {
    const opts = { sequentialRead: true, limitInputPixels: 40_000_000, failOn: 'error' }
    const oriented = sharp(input, opts).rotate()
    const meta = await oriented.clone().metadata()
    const keepPng = meta.hasAlpha === true
    const pipeline = oriented.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    const main = keepPng
      ? await pipeline.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
      : await pipeline.jpeg({ quality: JPEG_QUALITY }).toBuffer({ resolveWithObject: true })
    const thumb = await sharp(main.data)
      .resize({ width: 240, height: 240, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer()
    return {
      buffer: main.data,
      thumb,
      mime: keepPng ? 'image/png' : 'image/jpeg',
      width: main.info.width,
      height: main.info.height,
    }
  } catch (err) {
    if (err?.code === 'MEMORY_LOW') throw err
    if (/pixel limit|exceeds/i.test(err?.message || '')) {
      throw Object.assign(new Error('图片像素过多，请压缩后再上传'), { status: 413 })
    }
    throw Object.assign(new Error('图片无法处理，请换一张或压缩后再试'), { status: 400 })
  }
}
