import './env.js'

import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import express from 'express'
import { installBatch } from './batch.js'
import { installEssays } from './essays.js'
import { createQuestionHttp, updateQuestionHttp, addQuestionImageHttp } from './question-write.js'
import { installJobRoutes, startJobs, consumeCall } from './jobs.js'
import { JSON_BODY_LIMIT, prepareImage } from './image-work.js'

import db, {
  createUser,
  findUserByUsername,
  findUserById,
  safeParseJson,
  createQuestion,
  getQuestion,
  updateQuestion,
  deleteQuestion,
  listQuestions,
  countQuestions,
  listAllTags,
  saveImageFile,
  addImage,
  getImageById,
  getImageByIdAnyUser,
  listImages,
  updateImage,
  deleteImage,
  getImageAbsPath,
  saveTutorSession,
  listTutorSessions,
  saveRedo,
  listRedos,
  getStats,
  getKnowledgeStats,
  getActivity,
  listCardReviews,
  gradeCard,
  markTopicViewed,
  saveTopicAttempt,
  getTopicProgress,
} from './db.js'
import { TOPIC_MODULES, TOPIC_LIST, TOPIC_MAP } from './content/topics/index.js'
import {
  KNOWLEDGE_TREE,
  FORMULA_CARDS,
  CARD_KEYS,
  SUFFICIENCY_OPTIONS,
  moduleOf,
} from './content/math.js'
import {
  hashPassword,
  comparePassword,
  signToken,
  requireAuth,
  signImageAccess,
  verifyImageAccess,
  isProduction,
  getInviteCode,
} from './auth.js'
import {
  isOcrAvailable,
  getOcrInfo,
  parseImageInput,
  callOcr,
} from './providers/ocr.js'
import {
  isTutorAvailable,
  isVisionAvailable,
  getTutorInfo,
  callTutor,
  suggestQuestionMeta,
} from './providers/tutor.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const require = createRequire(import.meta.url)

const PORT = Number(process.env.PORT || 3005)
const HOST = process.env.HOST || '127.0.0.1'
const NODE_ENV = process.env.NODE_ENV || 'development'
const UPLOAD_DIR = path.join(ROOT, 'uploads')

const INVITE_CODE = getInviteCode()

// ---------- fail-fast ----------
if (!process.env.JWT_SECRET) {
  const msg = '[exam199] FATAL: 缺少 JWT_SECRET'
  if (isProduction()) {
    console.error(msg)
    process.exit(1)
  }
  console.warn(msg + '（开发环境将使用临时密钥）')
}
if (!INVITE_CODE) {
  const msg = '[exam199] FATAL: 生产环境必须设置 INVITE_CODE（注册邀请码）'
  if (isProduction()) {
    console.error(msg)
    process.exit(1)
  }
  console.warn(msg + '（开发环境允许开放注册）')
}
if (!isOcrAvailable()) {
  console.warn('[exam199] 未配置 GLM_API_KEY，OCR 识别不可用（仍可手动录题）')
}
if (!isTutorAvailable()) {
  console.warn('[exam199] 未配置 TUTOR_API_KEY，AI 老师不可用（仍可浏览与重做）')
}

// ---------- 图片鉴权中间件 ----------
// 优先接受 query ?t=&e= 短期签名（用于 <img> 直连，浏览器不会带 Authorization）；
// 验签成功后从 image→user 关联注入 req.userId。
// 无签名则回退到 Bearer（API 场景）。
function imageAuth(req, res, next) {
  const t = String(req.query.t || '')
  const e = String(req.query.e || '')
  const id = Number(req.params.id)
  if (t && e && Number.isFinite(id) && verifyImageAccess(id, t, e)) {
    const img = getImageByIdAnyUser(id)
    if (img) {
      req.userId = img.user_id
      return next()
    }
    return res.status(404).json({ error: '图片不存在' })
  }
  return requireAuth(req, res, next)
}

// 给 image 加 access_url（用于前端 <img> 直连，已签短期 token）
function withAccessUrl(im) {
  const { t, e } = signImageAccess(im.id)
  return { ...im, access_url: `/api/images/${im.id}?t=${t}&e=${e}` }
}

// ---------- Express ----------
const app = express()
app.disable('x-powered-by')
// 生产经本机 Nginx 反代，只信任回环地址的 X-Forwarded-For，避免伪造 IP 绕过限流
app.set('trust proxy', 'loopback')
app.use(express.json({ limit: JSON_BODY_LIMIT }))

// 安全响应头
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=()')
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "media-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  )
  next()
})

// ---------- 限流（复用 OCR-Page makeRateLimit）----------
function makeRateLimit(windowMs, max, keyFn) {
  const buckets = new Map()
  const clean = setInterval(() => {
    const now = Date.now()
    for (const [k, v] of buckets) {
      if (now - v.start > windowMs) buckets.delete(k)
    }
  }, windowMs)
  clean.unref()
  return (req, res, next) => {
    const key = keyFn(req)
    if (!key) return next()
    const now = Date.now()
    const rec = buckets.get(key)
    if (!rec || now - rec.start > windowMs) {
      buckets.set(key, { start: now, count: 1 })
      return next()
    }
    rec.count += 1
    if (rec.count > max) {
      return res.status(429).json({ error: '请求过于频繁，请稍后再试' })
    }
    next()
  }
}

const authRateLimit = makeRateLimit(10 * 60 * 1000, 20, (req) => req.ip || 'unknown')
const ocrRateLimit = makeRateLimit(
  10 * 60 * 1000,
  Number(process.env.RATE_MAX || 60),
  (req) => String(req.userId || req.ip || 'unknown')
)
const tutorRateLimit = makeRateLimit(
  10 * 60 * 1000,
  Number(process.env.RATE_MAX_TUTOR || 20),
  (req) => String(req.userId || req.ip || 'unknown')
)
const suggestRateLimit = makeRateLimit(
  10 * 60 * 1000,
  Number(process.env.RATE_MAX_SUGGEST || 30),
  (req) => String(req.userId || req.ip || 'unknown')
)

// ---------- vendor 静态文件 ----------
function serveFromNodeModules(routePath, pkgPath) {
  try {
    const abs = require.resolve(pkgPath)
    app.get(routePath, (req, res) => {
      res.type('application/javascript').sendFile(abs)
    })
  } catch (err) {
    console.warn(`[exam199] 无法定位 ${pkgPath}: ${err.message}`)
  }
}
serveFromNodeModules('/vendor/marked.min.js', 'marked/marked.min.js')
serveFromNodeModules('/vendor/purify.min.js', 'dompurify/dist/purify.min.js')
// KaTeX：js/css/字体整目录提供（css 内以相对路径引用 fonts/）
try {
  const katexDist = path.dirname(require.resolve('katex/dist/katex.min.js'))
  app.use('/vendor/katex', express.static(katexDist, { index: false, maxAge: '7d' }))
} catch (err) {
  console.warn(`[exam199] 无法定位 katex: ${err.message}`)
}

// ---------- 静态资源 ----------
app.use(express.static(path.join(ROOT, 'public'), { index: 'index.html' }))

// ---------- 工具 ----------
function readImageAsDataUri(absPath, mime) {
  try {
    const buf = fs.readFileSync(absPath)
    const m = mime || 'image/jpeg'
    return `data:${m};base64,${buf.toString('base64')}`
  } catch {
    return ''
  }
}

// ---------- 公开路由 ----------
app.get('/health', (req, res) => res.json({ ok: true }))

app.get('/api/info', (req, res) => {
  res.json({
    name: 'exam199-study',
    version: '1.0.0',
    status: isOcrAvailable() && isTutorAvailable() ? 'ready' : isOcrAvailable() ? 'partial' : 'manual',
    auth_required: true,
    features: {
      ocr: isOcrAvailable(),
      tutor: isTutorAvailable(),
      vision: isVisionAvailable(),
      capture: true,
      redo: true,
      review: true,
      export: true,
    },
    ocr: getOcrInfo(),
    tutor: getTutorInfo(),
  })
})

// ---------- 认证路由 ----------
app.post('/api/auth/register', authRateLimit, async (req, res) => {
  const { username, password, inviteCode } = req.body || {}
  if (INVITE_CODE && inviteCode !== INVITE_CODE) {
    return res.status(403).json({ error: '邀请码错误' })
  }
  if (!username || typeof username !== 'string' || username.length < 2 || username.length > 32) {
    return res.status(400).json({ error: '用户名长度 2-32 个字符' })
  }
  if (!/^[a-zA-Z0-9_\-\u4e00-\u9fa5]+$/.test(username)) {
    return res.status(400).json({ error: '用户名只能包含中英文、数字、下划线和短横线' })
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: '密码至少 6 位' })
  }
  const existing = findUserByUsername(username)
  if (existing) return res.status(409).json({ error: '用户名已被占用' })
  const passwordHash = await hashPassword(password)
  const user = createUser(username, passwordHash)
  const token = signToken({ userId: user.id, username: user.username })
  res.json({ token, user: { id: user.id, username: user.username } })
})

app.post('/api/auth/login', authRateLimit, async (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) {
    return res.status(400).json({ error: '请填写用户名和密码' })
  }
  const user = findUserByUsername(username)
  if (!user) return res.status(401).json({ error: '用户名或密码错误' })
  const ok = await comparePassword(password, user.password_hash)
  if (!ok) return res.status(401).json({ error: '用户名或密码错误' })
  const token = signToken({ userId: user.id, username: user.username })
  res.json({ token, user: { id: user.id, username: user.username } })
})

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = findUserById(req.userId)
  if (!user) return res.status(401).json({ error: '用户不存在' })
  res.json({ user })
})

// ---------- OCR ----------
app.post('/api/ocr', requireAuth, ocrRateLimit, async (req, res) => {
  if (!isOcrAvailable()) {
    return res.status(503).json({ error: '服务端未配置 GLM_API_KEY' })
  }
  // 支持 string | string[]：数组=多图合并识别（智谱 layout_parsing 的 file 接受 string[]）
  const raw = req.body?.image
  const sources = Array.isArray(raw) ? raw : [typeof raw === 'string' ? raw : req.body]
  if (!sources.length || (sources.length === 1 && sources[0] == null)) {
    return res.status(400).json({ error: '缺少 image 字段' })
  }
  const uris = []
  for (const source of sources) {
    const parsed = parseImageInput(typeof source === 'string' ? { image: source } : (source || {}))
    if (parsed.error) return res.status(parsed.status || 400).json({ error: parsed.error })
    const prepared = await prepareImage(Buffer.from(parsed.b64, 'base64'))
    uris.push(`data:${prepared.mime};base64,${prepared.buffer.toString('base64')}`)
  }

  const result = await callOcr(uris.length === 1 ? uris[0] : uris, { beforeCall: () => consumeCall(req.userId, "ocr") })
  if (result.error) {
    return res.status(result.status || 502).json({ error: result.error, detail: result.detail })
  }
  res.json({
    markdown: result.markdown,
    layout: result.layout,
    usage: result.usage,
    elapsedMs: result.elapsedMs,
  })
})

// ---------- 录题预填建议（题型 / 知识点 / 参考答案，仅供确认）----------
app.post('/api/suggest', requireAuth, suggestRateLimit, async (req, res) => {
  if (!isTutorAvailable()) {
    return res.status(503).json({ error: '服务端未配置 AI 老师 API Key' })
  }
  const stem = String(req.body?.stem || '').trim().slice(0, 4000)
  if (!stem) return res.status(400).json({ error: '缺少题干' })

  consumeCall(req.userId, "grade")
  const result = await suggestQuestionMeta({ stem })
  if (result.error) {
    return res.status(result.status || 502).json({ error: result.error })
  }
  res.json({
    question_type: result.question_type,
    knowledge_points: result.knowledge_points,
    answer: result.answer,
    answer_verified: false,
    provider: result.provider,
    model: result.model,
    elapsedMs: result.elapsedMs,
  })
})

// ---------- 题目：创建（含多图）----------
app.post('/api/questions', requireAuth, createQuestionHttp)

// ---------- 题目：列表/筛选/搜索 ----------
app.get('/api/questions', requireAuth, (req, res) => {
  const opts = {
    subject: req.query.subject || '',
    mastery: req.query.mastery || '',
    tag: req.query.tag || '',
    kp: req.query.kp || '',
    untidy: req.query.untidy === '1',
    q: req.query.q || '',
    limit: Math.min(Number(req.query.limit) || 50, 200),
    offset: Math.max(Number(req.query.offset) || 0, 0),
    reviewOnly: req.query.review === '1',
    orderBy: req.query.orderBy === 'review_due_at' ? 'review_due_at' : 'created_at',
  }
  const items = listQuestions(req.userId, opts)
  // 列表附缩略图（已签 query token，前端 <img> 可直连）
  for (const q of items) {
    const imgs = listImages(req.userId, q.id)
    q.thumb_id = imgs[0]?.id || 0
    q.image_count = imgs.length
    if (imgs[0]) {
      const { t, e } = signImageAccess(imgs[0].id)
      q.thumb_url = `/api/images/${imgs[0].id}/thumb?t=${t}&e=${e}`
    } else {
      q.thumb_url = ''
    }
    delete q.stem_raw
  }
  const total = countQuestions(req.userId, opts)
  res.json({ items, total, limit: opts.limit, offset: opts.offset })
})

// ---------- 题目：详情 ----------
app.get('/api/questions/:id', requireAuth, async (req, res) => {
  const q = getQuestion(req.userId, Number(req.params.id))
  if (!q) return res.status(404).json({ error: '题目不存在' })
  q.images = listImages(req.userId, q.id).map(withAccessUrl)
  res.json(q)
})

// ---------- 题目：更新 ----------
app.patch('/api/questions/:id', requireAuth, updateQuestionHttp)

// ---------- 题目：删除 ----------
app.delete('/api/questions/:id', requireAuth, (req, res) => {
  const ok = deleteQuestion(req.userId, Number(req.params.id))
  if (!ok) return res.status(404).json({ error: '题目不存在' })
  res.json({ ok: true })
})

// ---------- 图片：新增 ----------
app.post('/api/questions/:id/images', requireAuth, addQuestionImageHttp)

// ---------- 图片：获取（原图/缩略图）----------
// 优先 query 签名（<img> 直连），否则 Bearer（API 场景）。归属校验统一在 handler 内通过 req.userId 走 getImageById。
app.get('/api/images/:id', imageAuth, (req, res) => {
  const img = getImageById(req.userId, Number(req.params.id))
  if (!img) return res.status(404).json({ error: '图片不存在' })
  const abs = getImageAbsPath(img.file_path)
  if (!abs || !fs.existsSync(abs)) return res.status(404).json({ error: '文件丢失' })
  res.type(img.mime || 'image/jpeg').sendFile(abs)
})

app.get('/api/images/:id/thumb', imageAuth, (req, res) => {
  const img = getImageById(req.userId, Number(req.params.id))
  if (!img) return res.status(404).json({ error: '图片不存在' })
  const abs = getImageAbsPath(img.thumbnail_path || img.file_path)
  if (!abs || !fs.existsSync(abs)) return res.status(404).json({ error: '文件丢失' })
  res.type('image/jpeg').sendFile(abs)
})

// ---------- 图片：排序/旋转 ----------
app.patch('/api/images/:id', requireAuth, (req, res) => {
  const patch = {}
  if (req.body?.sort_order !== undefined) patch.sort_order = Number(req.body.sort_order)
  if (req.body?.rotation !== undefined) patch.rotation = Number(req.body.rotation) % 360
  const ok = updateImage(req.userId, Number(req.params.id), patch)
  if (!ok) return res.status(404).json({ error: '图片不存在' })
  res.json({ ok: true })
})

// ---------- 图片：删除 ----------
app.delete('/api/images/:id', requireAuth, (req, res) => {
  const ok = deleteImage(req.userId, Number(req.params.id))
  if (!ok) return res.status(404).json({ error: '图片不存在' })
  res.json({ ok: true })
})

// ---------- AI 老师：提示/讲解/讨论 ----------
app.post('/api/questions/:id/tutor', requireAuth, tutorRateLimit, async (req, res) => {
  if (!isTutorAvailable()) {
    return res.status(503).json({ error: '服务端未配置 AI 老师 API Key，AI 老师不可用' })
  }
  const qid = Number(req.params.id)
  const question = getQuestion(req.userId, qid)
  if (!question) return res.status(404).json({ error: '题目不存在' })

  const mode = ['hint', 'explain', 'discuss'].includes(req.body?.mode) ? req.body.mode : 'hint'
  const requestId = String(req.body?.requestId || '').slice(0, 64) || `${Date.now()}-${Math.random()}`
  const userPrompt = String(req.body?.prompt || '').slice(0, 2000)
  const useImage = !!req.body?.useImage

  // 取题图 data URI（vision 时传入）
  let imageDataUris = []
  if (useImage && isVisionAvailable()) {
    const imgs = listImages(req.userId, qid)
    imageDataUris = imgs.map((im) => readImageAsDataUri(getImageAbsPath(im.file_path), im.mime)).filter(Boolean)
  }

  // 分级提示：同一题第 n 次请求提示，给第 n 级（最多 3 级），逐步加深
  let hintLevel = 0
  if (mode === 'hint') {
    const prior = listTutorSessions(req.userId, qid, 100).filter((s) => s.mode === 'hint').length
    hintLevel = Math.min(prior + 1, 3)
  }

  // discuss 模式带上历史
  let history = []
  if (mode === 'discuss') {
    const sessions = listTutorSessions(req.userId, qid, 10)
    history = sessions.map((s) => [
      { role: 'user', content: s.user_prompt || '(无)' },
      { role: 'assistant', content: s.response_markdown || '' },
    ]).flat()
  }

  consumeCall(req.userId, "grade")
  const result = await callTutor({
    mode,
    question,
    history,
    userPrompt,
    imageDataUris,
    useImage,
    hintLevel,
  })

  if (result.error) {
    return res.status(result.status || 502).json({ error: result.error })
  }

  const sessionId = saveTutorSession(req.userId, qid, {
    request_id: requestId,
    provider: result.provider,
    model: result.model,
    mode,
    user_prompt: userPrompt,
    response_markdown: result.markdown,
    images_used: result.imagesUsed,
    tokens: result.tokens,
    elapsed_ms: result.elapsedMs,
  })

  res.json({
    id: sessionId,
    requestId,
    mode,
    hintLevel,
    markdown: result.markdown,
    provider: result.provider,
    model: result.model,
    imagesUsed: result.imagesUsed,
    tokens: result.tokens,
    elapsedMs: result.elapsedMs,
  })
})

// ---------- AI 老师：历史 ----------
app.get('/api/questions/:id/tutor', requireAuth, (req, res) => {
  const q = getQuestion(req.userId, Number(req.params.id))
  if (!q) return res.status(404).json({ error: '题目不存在' })
  const items = listTutorSessions(req.userId, Number(req.params.id), 100)
  res.json({ items })
})

// ---------- 重做 ----------
app.post('/api/questions/:id/redo', requireAuth, (req, res) => {
  const qid = Number(req.params.id)
  const q = getQuestion(req.userId, qid)
  if (!q) return res.status(404).json({ error: '题目不存在' })
  const result = ['correct', 'wrong', 'partial'].includes(req.body?.result) ? req.body.result : 'wrong'
  const detail = req.body?.detail && typeof req.body.detail === 'object'
    ? JSON.stringify(req.body.detail).slice(0, 2000)
    : ''
  const { id, schedule } = saveRedo(req.userId, qid, {
    redo_answer: String(req.body?.redoAnswer || '').slice(0, 500),
    result,
    duration_ms: Math.min(Math.max(Number(req.body?.durationMs) || 0, 0), 6 * 3600000),
    detail,
  })
  res.json({ id, result, mastery: schedule.mastery, review_stage: schedule.stage, review_due_at: schedule.due })
})

app.get('/api/questions/:id/redo', requireAuth, (req, res) => {
  const q = getQuestion(req.userId, Number(req.params.id))
  if (!q) return res.status(404).json({ error: '题目不存在' })
  res.json({ items: listRedos(req.userId, Number(req.params.id)) })
})

// ---------- 复习 ----------
app.patch('/api/questions/:id/review', requireAuth, (req, res) => {
  const qid = Number(req.params.id)
  const dueAt = Number(req.body?.reviewDueAt) || 0
  const q = updateQuestion(req.userId, qid, { review_due_at: dueAt })
  if (!q) return res.status(404).json({ error: '题目不存在' })
  res.json({ ok: true, review_due_at: dueAt })
})

app.get('/api/review', requireAuth, (req, res) => {
  const items = listQuestions(req.userId, { reviewOnly: true, orderBy: 'review_due_at', limit: 200 })
  for (const q of items) {
    const imgs = listImages(req.userId, q.id)
    q.thumb_id = imgs[0]?.id || 0
    q.image_count = imgs.length
    if (imgs[0]) {
      const { t, e } = signImageAccess(imgs[0].id)
      q.thumb_url = `/api/images/${imgs[0].id}/thumb?t=${t}&e=${e}`
    } else {
      q.thumb_url = ''
    }
    delete q.stem_raw
    delete q.stem
  }
  res.json({ items })
})

// ---------- 标签 / 统计 ----------
app.get('/api/tags', requireAuth, (req, res) => {
  res.json({ tags: listAllTags(req.userId) })
})

app.get('/api/stats', requireAuth, (req, res) => {
  res.json(getStats(req.userId))
})

// ---------- 数学：知识点 / 公式卡片 / 今日任务 ----------
app.get('/api/knowledge', requireAuth, (req, res) => {
  const stats = getKnowledgeStats(req.userId)
  res.json({
    tree: KNOWLEDGE_TREE,
    stats,
    sufficiency_options: SUFFICIENCY_OPTIONS,
    suggest: isTutorAvailable(),
  })
})

function cardsWithProgress(userId) {
  const progress = Object.fromEntries(listCardReviews(userId).map((r) => [r.card_key, r]))
  return FORMULA_CARDS.map((c) => {
    const p = progress[c.key]
    return {
      ...c,
      module: c.kp ? moduleOf(c.kp) : '条件充分性',
      stage: p?.stage || 0,
      due_at: p?.due_at || 0,
      review_count: p?.review_count || 0,
      is_new: !p,
    }
  })
}

// 今日卡片：已到期的 + 每天限量引入新卡（按内置顺序）
const NEW_CARDS_PER_DAY = 12
function dueCards(userId) {
  const all = cardsWithProgress(userId)
  const now = Date.now()
  const due = all.filter((c) => !c.is_new && c.due_at <= now)
  const fresh = all.filter((c) => c.is_new).slice(0, NEW_CARDS_PER_DAY)
  return { due, fresh, total: all.length, learned: all.filter((c) => !c.is_new).length }
}

app.get('/api/cards', requireAuth, (req, res) => {
  if (req.query.all === '1') return res.json({ items: cardsWithProgress(req.userId) })
  const { due, fresh, total, learned } = dueCards(req.userId)
  res.json({ items: [...due, ...fresh], due: due.length, fresh: fresh.length, total, learned })
})

app.post('/api/cards/:key/grade', requireAuth, (req, res) => {
  const key = String(req.params.key)
  if (!CARD_KEYS.has(key)) return res.status(404).json({ error: '卡片不存在' })
  const grade = ['good', 'fuzzy', 'again'].includes(req.body?.grade) ? req.body.grade : 'again'
  res.json(gradeCard(req.userId, key, grade))
})

// ---------- 题型讲解 ----------
// 进度汇总：status = new（没看过）| viewed（看过没练）| practicing（练过但没过关）| done（全部做过，最近一次至多错 1 道）
function topicStatus(topic, prog) {
  const items = prog?.items || {}
  const done = Object.keys(items).length
  const correct = Object.values(items).filter(Boolean).length
  const total = topic.practice.length
  let status = 'new'
  if (done === total && correct >= total - 1) status = 'done'
  else if (done) status = 'practicing'
  else if (prog?.viewed_at) status = 'viewed'
  return { status, done, correct, total }
}

function nextTopic(progress) {
  return TOPIC_LIST.find((t) => topicStatus(t, progress[t.id]).status !== 'done') || null
}

// 练习题对前端隐藏答案与解析（思路提示 hint 可以先给），作答后由服务端判分并返回
const publicItem = ({ answer, solution, swapped, ...rest }) => rest

app.get('/api/topics', requireAuth, (req, res) => {
  const progress = getTopicProgress(req.userId)
  const next = nextTopic(progress)
  res.json({
    next_id: next?.id || '',
    modules: TOPIC_MODULES.map((m) => ({
      id: m.id,
      name: m.name,
      chapters: m.chapters.map((c) => ({
        id: c.id,
        name: c.name,
        intro: c.intro,
        topics: c.topics.map((t) => ({
          id: t.id,
          name: t.name,
          freq: t.freq,
          think: t.think,
          signals: t.signals,
          kp: t.kp,
          ...topicStatus(t, progress[t.id]),
        })),
      })),
    })),
  })
})

app.get('/api/topics/:id', requireAuth, (req, res) => {
  const t = TOPIC_MAP[req.params.id]
  if (!t) return res.status(404).json({ error: '题型不存在' })
  markTopicViewed(req.userId, t.id)
  const progress = getTopicProgress(req.userId)
  res.json({
    ...t,
    practice: t.practice.map(publicItem),
    progress: { ...topicStatus(t, progress[t.id]), items: progress[t.id]?.items || {} },
    prev_id: TOPIC_LIST[t.order - 1]?.id || '',
    next_id: TOPIC_LIST[t.order + 1]?.id || '',
  })
})

app.post('/api/topics/:id/practice', requireAuth, (req, res) => {
  const t = TOPIC_MAP[req.params.id]
  const index = Number(req.body?.index)
  const item = t?.practice[index]
  if (!item) return res.status(404).json({ error: '题目不存在' })
  const answer = String(req.body?.answer || '').toUpperCase().slice(0, 1)
  const correct = answer === item.answer
  saveTopicAttempt(req.userId, t.id, {
    index,
    answer,
    correct,
    duration_ms: Math.min(Math.max(Number(req.body?.durationMs) || 0, 0), 3600000),
  })
  res.json({ correct, answer: item.answer, solution: item.solution })
})

// 练习做错了：存进错题本，带上题型和知识点，进入间隔复习
app.post('/api/topics/:id/wrongbook', requireAuth, (req, res) => {
  const t = TOPIC_MAP[req.params.id]
  const index = Number(req.body?.index)
  const item = t?.practice[index]
  if (!item) return res.status(404).json({ error: '题目不存在' })
  const optionsMd = item.type === 'ps' ? '\n\n' + item.options.map((o, i) => `${'ABCDE'[i]}. ${o}`).join('　') : ''
  const q = createQuestion(req.userId, {
    subject: 'math',
    question_type: item.type === 'sc' ? 'sufficient_condition' : 'problem_solving',
    title: `${t.name} · 练习 ${index + 1}`,
    stem: item.stem + optionsMd,
    stem_raw: '',
    correct_answer: item.answer,
    user_answer: String(req.body?.answer || '').slice(0, 10),
    source: `题型练习：${t.name}`,
    knowledge_points: [t.kp],
    tags: ['题型练习'],
    error_reason_note: '',
  })
  res.json({ id: q.id })
})

app.get('/api/today', requireAuth, (req, res) => {
  const stats = getStats(req.userId)
  const cards = dueCards(req.userId)
  const activity = getActivity(req.userId)
  // 薄弱知识点：未掌握题目多、最近答错多的排前面
  const kpStats = getKnowledgeStats(req.userId)
  const weak = Object.entries(kpStats)
    .map(([kp, s]) => ({ kp, module: moduleOf(kp), ...s, unmastered: s.total - s.mastered }))
    .filter((s) => s.unmastered > 0)
    .sort((a, b) => b.last_wrong - a.last_wrong || b.unmastered - a.unmastered)
    .slice(0, 5)
  const topicProgress = getTopicProgress(req.userId)
  const next = nextTopic(topicProgress)
  const topicsDone = TOPIC_LIST.filter((t) => topicStatus(t, topicProgress[t.id]).status === 'done').length
  res.json({
    next_topic: next ? { id: next.id, name: next.name, chapter: next.chapter, think: next.think, ...topicStatus(next, topicProgress[next.id]) } : null,
    topics_done: topicsDone,
    topics_total: TOPIC_LIST.length,
    review_due: stats.review_due,
    untidy: stats.untidy,
    total: stats.total,
    cards_due: cards.due.length,
    cards_new: cards.fresh.length,
    cards_learned: cards.learned,
    cards_total: cards.total,
    activity,
    weak,
  })
})

// ---------- 导出 ----------
app.get('/api/export', requireAuth, (req, res) => {
  const questions = listQuestions(req.userId, { limit: 10000, offset: 0 })
  const exportData = []
  for (const q of questions) {
    const imgs = listImages(req.userId, q.id)
    const images = imgs.map((im) => ({
      sort_order: im.sort_order,
      rotation: im.rotation,
      mime: im.mime,
      data: readImageAsDataUri(getImageAbsPath(im.file_path), im.mime),
    }))
    const tutor = listTutorSessions(req.userId, q.id, 500)
    const redos = listRedos(req.userId, q.id)
    exportData.push({ ...q, images, tutor, redos })
  }
  const user = findUserById(req.userId)
  res.setHeader('Content-Disposition', `attachment; filename="exam199-export-${Date.now()}.json"`)
  res.json({ exported_at: Date.now(), user: { id: user.id, username: user.username }, questions: exportData })
})

// ---------- 导入 ----------
app.post('/api/import', requireAuth, async (req, res) => {
  const incoming = Array.isArray(req.body?.questions) ? req.body.questions : []
  if (!incoming.length) return res.status(400).json({ error: '没有可导入的题目' })
  let imported = 0
  for (const item of incoming) {
    const q = createQuestion(req.userId, {
      subject: item.subject || 'math',
      question_type: item.question_type || 'problem_solving',
      title: item.title || '',
      stem: item.stem || '',
      stem_raw: item.stem_raw || item.stem || '',
      options: Array.isArray(item.options) ? item.options : [],
      correct_answer: item.correct_answer || '',
      user_answer: item.user_answer || '',
      source: item.source || '',
      knowledge_points: Array.isArray(item.knowledge_points) ? item.knowledge_points : [],
      error_reason: item.error_reason || '',
      error_reason_note: item.error_reason_note || '',
      tags: Array.isArray(item.tags) ? item.tags : [],
      mastery: item.mastery || 'unlearned',
      review_due_at: item.review_due_at || 0,
    })
    if (Array.isArray(item.images)) {
      for (let i = 0; i < item.images.length; i++) {
        const im = item.images[i]
        if (!im.data) continue
        const parsed = parseImageInput({ image: im.data })
        if (parsed.status === 413) return res.status(413).json({ error: parsed.error })
        if (parsed.error) continue
        const meta = await saveImageFile(req.userId, q.id, Buffer.from(parsed.b64, 'base64'))
        addImage(req.userId, q.id, meta, i)
      }
    }
    // 恢复 AI 老师历史（修复：原版只恢复 questions+images，tutor/redos 丢失）
    if (Array.isArray(item.tutor)) {
      for (const s of item.tutor) {
        saveTutorSession(req.userId, q.id, {
          request_id: s.request_id || '',
          provider: s.provider || '',
          model: s.model || '',
          mode: s.mode || 'hint',
          user_prompt: s.user_prompt || '',
          response_markdown: s.response_markdown || '',
          images_used: s.images_used || 0,
          tokens: s.tokens || 0,
          elapsed_ms: s.elapsed_ms || 0,
          created_at: s.created_at || Date.now(),
        })
      }
    }
    // 恢复重做记录
    if (Array.isArray(item.redos)) {
      for (const r of item.redos) {
        saveRedo(req.userId, q.id, {
          redo_answer: r.redo_answer || '',
          result: r.result || 'wrong',
          duration_ms: r.duration_ms || 0,
          detail: typeof r.detail === 'string' ? r.detail : '',
          created_at: r.created_at || Date.now(),
        }, { applySchedule: false })
      }
    }
    imported += 1
  }
  res.json({ ok: true, imported })
})

installJobRoutes(app, requireAuth, ocrRateLimit)
installBatch(app, requireAuth, ocrRateLimit, withAccessUrl)
installEssays(app, requireAuth, tutorRateLimit, makeRateLimit)

// ---------- 404 / 错误 ----------
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' })
})

app.use((err, req, res, next) => {
  if (err?.code === 'DAILY_LIMIT') return res.status(429).json({ error: err.message })
  if (err?.code === 'MEMORY_LOW') {
    res.set('Retry-After', String(err.retryAfter || 30))
    return res.status(503).json({ error: err.message })
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: '请求体过大，单张图片请控制在 8MB 以内并压缩后再试' })
  }
  console.error('[exam199] 未处理异常:', err)
  res.status(500).json({ error: '服务器内部错误' })
})

// ---------- 启动 ----------
if (NODE_ENV !== 'test') {
  startJobs()
  app.listen(PORT, HOST, () => {
    console.log(`[exam199] listening on http://${HOST}:${PORT} (env=${NODE_ENV})`)
    console.log(`[exam199] ocr=${isOcrAvailable() ? 'on' : 'off'} tutor=${isTutorAvailable() ? 'on' : 'off'} vision=${isVisionAvailable() ? 'on' : 'off'}`)
  })
}

export default app
