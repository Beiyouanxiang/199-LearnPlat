// 录题、改题、补图。网页 JWT 和代理令牌共用这些处理函数，避免两套校验分叉。
import {
  createQuestion,
  getQuestion,
  updateQuestion,
  saveImageFile,
  addImage,
  listImages,
} from './db.js'
import { deriveTitle, parseImageInput } from './providers/ocr.js'
import { signImageAccess } from './auth.js'

function withAccessUrl(im) {
  const { t, e } = signImageAccess(im.id)
  return { ...im, access_url: `/api/images/${im.id}?t=${t}&e=${e}` }
}

export async function createQuestionHttp(req, res) {
  const b = req.body || {}
  const data = {
    subject: b.subject || 'math',
    question_type: b.question_type || 'problem_solving',
    title: b.title || '',
    stem: b.stem || '',
    // stem_raw 严格用传入值，不 fallback 到 stem（否则校对稿会覆盖原始 OCR 文本）
    stem_raw: b.stem_raw || '',
    options: Array.isArray(b.options) ? b.options : [],
    correct_answer: b.correct_answer || '',
    user_answer: b.user_answer || '',
    source: b.source || '',
    knowledge_points: Array.isArray(b.knowledge_points) ? b.knowledge_points : [],
    error_reason: b.error_reason || '',
    error_reason_note: b.error_reason_note || '',
    tags: Array.isArray(b.tags) ? b.tags : [],
    mastery: b.mastery || 'unlearned',
    // 未指定时由 createQuestion 默认安排明天复习
    review_due_at: Number.isFinite(b.review_due_at) ? b.review_due_at : undefined,
  }
  const parsedImages = []
  if (Array.isArray(b.images)) {
    for (const image of b.images) {
      const parsed = parseImageInput({ image })
      if (parsed.status === 413) return res.status(413).json({ error: parsed.error })
      if (!parsed.error) parsedImages.push(parsed)
    }
  }
  const hasImages = parsedImages.length > 0
  // 快速收藏：只有图片、暂不录题干也允许保存，之后再整理
  if (!data.stem && !data.stem_raw && !hasImages) {
    return res.status(400).json({ error: '题干和图片至少要有一项' })
  }
  if (!data.title) {
    data.title = deriveTitle(data.stem || data.stem_raw) ||
      `待整理 · ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
  }

  const question = createQuestion(req.userId, data)

  // 保存多图（修复：原版只 saveImageFile 未 addImage，导致关联图片数为 0）
  for (let i = 0; i < parsedImages.length; i++) {
    const parsed = parsedImages[i]
    const buffer = Buffer.from(parsed.b64, 'base64')
    const meta = await saveImageFile(req.userId, question.id, buffer)
    addImage(req.userId, question.id, meta, i)
  }

  const full = getQuestion(req.userId, question.id)
  full.images = listImages(req.userId, question.id).map(withAccessUrl)
  res.json(full)
}

export function updateQuestionHttp(req, res) {
  const b = req.body || {}
  const patch = {}
  const allow = [
    'subject', 'question_type', 'title', 'stem', 'stem_raw',
    'correct_answer', 'user_answer', 'source', 'error_reason', 'error_reason_note',
    'mastery', 'review_due_at',
  ]
  for (const k of allow) {
    if (b[k] !== undefined) patch[k] = b[k]
  }
  if (Array.isArray(b.options)) patch.options = b.options
  if (Array.isArray(b.knowledge_points)) patch.knowledge_points = b.knowledge_points
  if (Array.isArray(b.tags)) patch.tags = b.tags
  // 快速收藏的题补上题干后，用题干首行替换"待整理"占位标题
  if (patch.stem && patch.title === undefined) {
    const existing = getQuestion(req.userId, Number(req.params.id))
    if (existing && existing.title.startsWith('待整理')) patch.title = deriveTitle(patch.stem)
  }
  const q = updateQuestion(req.userId, Number(req.params.id), patch)
  if (!q) return res.status(404).json({ error: '题目不存在' })
  q.images = listImages(req.userId, q.id).map(withAccessUrl)
  res.json(q)
}

export async function addQuestionImageHttp(req, res) {
  const qid = Number(req.params.id)
  const q = getQuestion(req.userId, qid)
  if (!q) return res.status(404).json({ error: '题目不存在' })
  const parsed = parseImageInput(req.body || {})
  if (parsed.error) return res.status(parsed.status || 400).json({ error: parsed.error })
  const buffer = Buffer.from(parsed.b64, 'base64')
  const meta = await saveImageFile(req.userId, qid, buffer)
  const imgs = listImages(req.userId, qid)
  const sortOrder = imgs.length
  const id = addImage(req.userId, qid, meta, sortOrder)
  res.json({ id, ...meta })
}
