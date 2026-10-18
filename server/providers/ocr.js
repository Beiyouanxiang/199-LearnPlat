// OCR provider 适配层：复用 OCR-Page（/data/data_home/xuyifan/OCR-Page）的智谱 GLM-OCR 调用经验。
// 仅提取通用识别能力，不耦合其用户/数据库/密钥。来源记录见 README「复用说明」。

const GLM_API_KEY = process.env.GLM_API_KEY || ''
const GLM_OCR_URL =
  process.env.GLM_OCR_URL || 'https://open.bigmodel.cn/api/paas/v4/layout_parsing'
const GLM_OCR_MODEL = process.env.GLM_OCR_MODEL || 'glm-ocr'
const OCR_TIMEOUT_MS = Number(process.env.OCR_TIMEOUT_MS || 120_000)

export function isOcrAvailable() {
  return !!GLM_API_KEY
}

export function getOcrInfo() {
  return {
    available: !!GLM_API_KEY,
    model: GLM_OCR_MODEL,
    endpoint: GLM_OCR_URL,
  }
}

// ---------- 图片输入校验（复用 OCR-Page parseImageInput）----------
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp'])
const MAX_IMAGE_BYTES = Number(process.env.MAX_IMAGE_BYTES || 10 * 1024 * 1024)

export function parseImageInput(body) {
  const raw = typeof body?.image === 'string' ? body.image : ''
  if (!raw) return { error: '缺少 image 字段' }

  let mime = ''
  let b64 = ''
  const m = raw.match(/^data:([^;,]+);base64,(.*)$/s)
  if (m) {
    mime = m[1].toLowerCase()
    b64 = m[2]
  } else {
    mime = (typeof body?.mime === 'string' ? body.mime : 'image/png').toLowerCase()
    b64 = raw
  }

  if (!ALLOWED_MIME.has(mime)) {
    return { error: `不支持的图片类型：${mime}（仅支持 PNG / JPEG / WEBP / BMP）` }
  }
  b64 = b64.replace(/\s+/g, '')
  if (!b64) return { error: '图片内容为空' }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
    return { error: '图片数据格式不合法（不是有效的 base64）' }
  }
  const bytes = Math.floor((b64.length * 3) / 4)
  if (bytes > MAX_IMAGE_BYTES) {
    return { error: `图片过大（约 ${(bytes / 1024 / 1024).toFixed(1)}MB），单图上限 ${MAX_IMAGE_BYTES / 1024 / 1024}MB` }
  }
  return { mime, b64, bytes, dataUri: `data:${mime};base64,${b64}` }
}

// ---------- 版面坐标归一化（复用 OCR-Page normalizeLayout）----------
export function normalizeLayout(layoutDetails, dataInfo) {
  if (!Array.isArray(layoutDetails)) return []
  return layoutDetails.map((pageBlocks, pageIndex) => {
    const dims = dataInfo?.pages?.[pageIndex] || {}
    const pw0 = Number(dims.width) || 0
    const ph0 = Number(dims.height) || 0
    const blocks = Array.isArray(pageBlocks) ? pageBlocks : []
    return blocks.map((b) => {
      let box = Array.isArray(b.bbox_2d) ? b.bbox_2d : null
      const pw = Number(b.width) || pw0
      const ph = Number(b.height) || ph0
      if (box && box.length === 4 && box.every((v) => typeof v === 'number')) {
        const isNormalized = box.every((v) => v >= 0 && v <= 1)
        if (!isNormalized && pw > 0 && ph > 0) {
          box = [box[0] / pw, box[1] / ph, box[2] / pw, box[3] / ph]
        }
        box = box.map((v) => Math.min(1, Math.max(0, v)))
      } else {
        box = null
      }
      return {
        index: b.index ?? null,
        label: b.label || 'text',
        nativeLabel: b.native_label || '',
        bbox: box,
        content: b.content ?? '',
      }
    })
  })
}

export function deriveTitle(markdown) {
  const first = (markdown || '').trim().split('\n')[0] || ''
  return first.replace(/^#+\s*/, '').slice(0, 80)
}

// ---------- 调用智谱 GLM-OCR ----------
// imageDataUri: string | string[]（数组=多图：端点只收单 string，逐张调用后拼接）
export async function callOcr(imageDataUri, { signal } = {}) {
  if (Array.isArray(imageDataUri)) {
    const parts = []
    let totalUsage = null
    let totalMs = 0
    for (let i = 0; i < imageDataUri.length; i++) {
      const r = await callOcr(imageDataUri[i], { signal })
      if (r.error) return r
      if (r.markdown) parts.push(r.markdown)
      if (r.usage) {
        totalUsage = totalUsage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        totalUsage.prompt_tokens += r.usage.prompt_tokens || 0
        totalUsage.completion_tokens += r.usage.completion_tokens || 0
        totalUsage.total_tokens += r.usage.total_tokens || 0
      }
      totalMs += r.elapsedMs || 0
    }
    return {
      markdown: parts.filter(Boolean).join('\n\n'),
      layout: [],
      usage: totalUsage,
      elapsedMs: totalMs,
    }
  }
  return callOcrSingle(imageDataUri, { signal })
}

async function callOcrSingle(imageDataUri, { signal } = {}) {
  if (!GLM_API_KEY) {
    return { error: '服务端未配置 GLM_API_KEY', status: 503 }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS)
  // 允许外部 signal 取消（切题/退出）
  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  const started = Date.now()
  try {
    const upstream = await fetch(GLM_OCR_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GLM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GLM_OCR_MODEL,
        file: imageDataUri,
      }),
      signal: controller.signal,
    })

    const text = await upstream.text()
    if (!upstream.ok) {
      console.error(`[ocr] GLM 返回 ${upstream.status}: ${text.slice(0, 500)}`)
      return {
        error: `识别服务返回错误（${upstream.status}）`,
        detail: upstream.status === 429 ? '接口限流，请稍后重试' : undefined,
        status: 502,
      }
    }

    let data
    try {
      data = JSON.parse(text)
    } catch {
      return { error: '识别服务返回了无法解析的内容', status: 502 }
    }

    // 多图时 md_results 可能是 string[]（每图一段），合并为一段 markdown
    const rawMd = data.md_results
    const markdown = Array.isArray(rawMd) ? rawMd.filter(Boolean).join('\n\n') : rawMd || ''

    return {
      markdown,
      layout: normalizeLayout(data.layout_details, data.data_info),
      dataInfo: data.data_info || null,
      usage: data.usage || null,
      elapsedMs: Date.now() - started,
    }
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { error: '识别超时，请稍后重试或换一张更小的图片', status: 504 }
    }
    console.error('[ocr] 调用失败:', err?.message || err)
    return { error: '调用识别服务失败', status: 502 }
  } finally {
    clearTimeout(timer)
  }
}
