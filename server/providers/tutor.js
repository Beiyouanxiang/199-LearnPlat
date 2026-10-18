// AI 老师 tutor provider 适配层。
// 支持 deepseek / glm / kimi（均 OpenAI 兼容 chat/completions）。
// OCR provider 与 tutor provider 分离，模型名、端点、能力可独立配置。
// 真实 Key 仅服务端环境变量；缺 Key 时返回明确错误，不伪造成功结果。

const TUTOR_TIMEOUT_MS = Number(process.env.TUTOR_TIMEOUT_MS || 120_000)

// 按 provider 名解析其 Key / 端点 / 模型；缺 Key 返回 null。
// glm 文字模型与视觉模型（glm-4v-plus 等）共用同一 Key；deepseek-chat 为纯文本，无视觉。
function resolveProvider(name) {
  if (name === 'glm') {
    const key = process.env.GLM_API_KEY || ''
    if (!key) return null
    const baseUrl = (process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/$/, '')
    return {
      provider: 'glm',
      apiKey: key,
      baseUrl,
      model: process.env.GLM_TUTOR_MODEL || 'glm-4-flash',
      visionKey: key,
      visionBaseUrl: baseUrl,
      visionModel: process.env.GLM_VISION_MODEL || process.env.GLM_OCR_MODEL || '',
    }
  }
  if (name === 'deepseek') {
    const key = process.env.DEEPSEEK_API_KEY || ''
    if (!key) return null
    return {
      provider: 'deepseek',
      apiKey: key,
      baseUrl: (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, ''),
      model: process.env.DEEPSEEK_TUTOR_MODEL || 'deepseek-chat',
      visionKey: '',
      visionBaseUrl: '',
      visionModel: '',
    }
  }
  return null
}

// 选定主 provider：优先 DEFAULT_TUTOR_PROVIDER；否则尝试通用 TUTOR_API_KEY fallback。
const DEFAULT_PROVIDER = process.env.DEFAULT_TUTOR_PROVIDER || ''
let ACTIVE = null
if (DEFAULT_PROVIDER) {
  ACTIVE = resolveProvider(DEFAULT_PROVIDER)
} else if (process.env.TUTOR_API_KEY) {
  ACTIVE = {
    provider: process.env.TUTOR_PROVIDER || 'deepseek',
    apiKey: process.env.TUTOR_API_KEY,
    baseUrl: (process.env.TUTOR_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, ''),
    model: process.env.TUTOR_MODEL || 'deepseek-chat',
    visionKey: process.env.TUTOR_VISION_API_KEY || '',
    visionBaseUrl: (process.env.TUTOR_VISION_BASE_URL || '').replace(/\/$/, ''),
    visionModel: process.env.TUTOR_VISION_MODEL || '',
  }
}

export function isTutorAvailable() {
  return !!ACTIVE?.apiKey
}

export function isVisionAvailable() {
  return !!(ACTIVE?.visionKey && ACTIVE?.visionModel && ACTIVE?.visionBaseUrl)
}

export function getTutorInfo() {
  if (!ACTIVE) return { available: false, provider: '', model: '', vision: null }
  return {
    available: !!ACTIVE.apiKey,
    provider: ACTIVE.provider,
    model: ACTIVE.model,
    vision: isVisionAvailable()
      ? { provider: ACTIVE.provider, model: ACTIVE.visionModel }
      : null,
  }
}

// ---------- 按题型定制讲解框架 ----------
const FRAMEWORKS = {
  // 数学：问题求解
  problem_solving: [
    '【考点】本题考查的知识点是什么',
    '【关键条件】题干中哪些条件是解题的关键',
    '【解题过程】给出完整的推导步骤',
    '【易错点】这类题常见误区',
    '【验证方法】如何快速检验答案正确',
  ],
  // 数学：条件充分性判断（管理类联考特色题型）
  sufficient_condition: [
    '【考点】本题考查的知识点',
    '【结论与条件】明确题干结论，以及条件(1)、条件(2)分别是什么',
    '【充分性判断方法】判断条件是否充分推出结论的方法',
    '【逐条件分析】分别分析条件(1)、(2)单独是否充分，以及联立是否充分',
    '【易错点】充分性判断常见误区（如把必要当充分）',
  ],
  // 逻辑：逻辑推理
  logic_reasoning: [
    '【题型识别】这是一道什么类型的逻辑题（加强/削弱/假设/解释/结论等）',
    '【题干结构】前提是什么，结论是什么，论证链条如何',
    '【推理路径】如何从前提到达正确选项',
    '【选项辨析】逐个分析五个选项为何对/错',
    '【易错点】这类逻辑题常见误区',
  ],
  // 写作：论证有效性分析
  argument_analysis: [
    '【论证结构】材料的论证框架是什么',
    '【逻辑漏洞定位】材料中有哪些逻辑缺陷（概念混淆/以偏概全/不当类比/因果倒置/非黑即白等）',
    '【分析写法】如何条理清晰地写出分析',
    '【易错点】论证有效性分析常见误区',
  ],
  // 写作：论说文
  essay: [
    '【立意】如何从材料提炼核心观点',
    '【结构】议论文如何安排篇章结构',
    '【论证展开】如何有说服力地展开论证',
    '【语言】语言表达的注意事项',
  ],
}

const SUBJECT_LABEL = {
  math: '数学',
  logic: '逻辑',
  writing: '写作',
}

const TYPE_LABEL = {
  problem_solving: '问题求解',
  sufficient_condition: '条件充分性判断',
  logic_reasoning: '逻辑推理',
  argument_analysis: '论证有效性分析',
  essay: '论说文',
}

// ---------- 构造 system prompt ----------
function buildSystemPrompt(question, mode, visionUsed) {
  const subject = SUBJECT_LABEL[question.subject] || '综合'
  const type = TYPE_LABEL[question.question_type] || question.question_type
  const framework = FRAMEWORKS[question.question_type] || FRAMEWORKS.problem_solving

  const base = [
    '你是一位为考生准备 199 管理类联考综合能力的私人辅导老师，针对妻子备考，态度温和、讲解清晰、循序渐进。',
    `本题属于【${subject} · ${type}】题型。`,
  ]

  if (mode === 'hint') {
    base.push(
      '现在请只给出一个【提示】，引导学生自己思考，不要直接给出完整答案或标准答案。',
      '提示应指出思考方向或关键切入点，简短有力，控制在 150 字以内。',
      '如果题目信息不足以给出有效提示，请明确说明缺了什么，不要编造。',
      '数学公式用纯文本写（如 x/2、a²+b²=c²），不要用 LaTeX（\\frac、$ 符号等），前端不渲染。'
    )
  } else if (mode === 'explain') {
    base.push(
      '现在请按以下框架完整讲解本题（可用 Markdown）:',
      ...framework,
      '讲解要清晰、准确。涉及公式请用行内或行间代码表示。',
      '重要规则：',
      '1. 不要编造"标准答案"或"官方答案"，也不要编造教材出处、页码。',
      '2. 区分"考生自己填写的答案"与"你推导出的答案"。考生答案在下方会标注，你的推导要独立得出，若与考生答案矛盾，请明确指出并重新检查。',
      '3. 若计算或逻辑出现矛盾，先说明矛盾点，再重新推导，不要强行圆场。',
      '4. 数学公式一律用纯文本写（如 a² + b² = c²、x/2、3×4=12），不要用 LaTeX 语法（不要输出 \\frac、\\times、\\( \\)、\\[ \\]、$ 符号），前端不渲染 LaTeX，原始符号会直接显示给用户。'
    )
  } else {
    // discuss
    base.push(
      '现在是自由讨论环节，根据考生的追问继续讲解。',
      '仍然遵守：不编造标准答案与教材出处；计算/逻辑矛盾要说明；不清楚就追问或要求补充。',
      '数学公式用纯文本写，不要用 LaTeX（\\frac、$ 符号等），前端不渲染。'
    )
  }

  if (!visionUsed && question.question_type !== 'essay' && question.question_type !== 'argument_analysis') {
    base.push(
      '【能力限制】本次讲解未传入题图，仅依据 OCR 文本。若题干涉及几何图形、统计图表、表格等 OCR 无法完整表达的关系，',
      '且这些关系对解题是必要的，请明确告知"此处需要看原图才能准确判断"，不要虚构角度、长度、点线关系。'
    )
  }

  if (visionUsed) {
    base.push('【已附图】本次讲解已附上题目原图，请结合图像内容分析。')
  }

  return base.join('\n')
}

// ---------- 构造 user message ----------
function buildUserContent(question, userPrompt, imageDataUris, useImage) {
  const parts = []

  const sections = []
  if (question.title) sections.push(`标题：${question.title}`)
  sections.push('题干：')
  sections.push(question.stem || question.stem_raw || '（无题干文本）')

  if (Array.isArray(question.options) && question.options.length) {
    sections.push('选项：')
    for (const opt of question.options) {
      sections.push(`${opt.key}. ${opt.text}`)
    }
  }
  if (question.correct_answer) {
    sections.push(`考生填写的正确答案：${question.correct_answer}`)
  }
  if (question.user_answer) {
    sections.push(`考生自己的答案：${question.user_answer}`)
  }
  if (question.source) {
    sections.push(`来源：${question.source}`)
  }
  if (Array.isArray(question.knowledge_points) && question.knowledge_points.length) {
    sections.push(`知识点：${question.knowledge_points.join('、')}`)
  }
  if (question.error_reason) {
    sections.push(`错因：${question.error_reason}${question.error_reason_note ? '（' + question.error_reason_note + '）' : ''}`)
  }
  if (userPrompt) {
    sections.push(`考生请求：${userPrompt}`)
  }

  parts.push({ type: 'text', text: sections.join('\n') })

  if (useImage && Array.isArray(imageDataUris)) {
    for (const uri of imageDataUris) {
      parts.push({ type: 'image_url', image_url: { url: uri } })
    }
  }

  return parts
}

// ---------- 调用 chat/completions ----------
async function callChat(baseUrl, apiKey, model, messages, { signal } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TUTOR_TIMEOUT_MS)
  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.6,
        max_tokens: 2048,
      }),
      signal: controller.signal,
    })
    const text = await resp.text()
    if (!resp.ok) {
      console.error(`[tutor] ${model} 返回 ${resp.status}: ${text.slice(0, 500)}`)
      return {
        error: resp.status === 429 ? 'AI 服务限流，请稍后重试' : `AI 服务返回错误（${resp.status}）`,
        status: 502,
      }
    }
    let data
    try {
      data = JSON.parse(text)
    } catch {
      return { error: 'AI 服务返回无法解析的内容', status: 502 }
    }
    const content = data?.choices?.[0]?.message?.content || ''
    if (!content) {
      return { error: 'AI 服务返回了空内容', status: 502 }
    }
    return {
      markdown: content,
      tokens: data.usage?.total_tokens || 0,
    }
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { error: 'AI 讲解超时，请稍后重试', status: 504 }
    }
    console.error('[tutor] 调用失败:', err?.message || err)
    return { error: '调用 AI 服务失败', status: 502 }
  } finally {
    clearTimeout(timer)
  }
}

// ---------- 对外主入口 ----------
// opts: { mode, question, history[], userPrompt, imageDataUris[], useImage, signal, requestId }
export async function callTutor(opts) {
  if (!isTutorAvailable()) {
    return { error: '服务端未配置 AI 老师 API Key', status: 503 }
  }

  const { mode = 'hint', question, history = [], userPrompt = '', imageDataUris = [], useImage = false, signal } = opts

  // 决定用哪个 provider：含图且开启图像且 vision 可用 -> vision provider；否则默认 provider
  const wantVision = useImage && imageDataUris.length > 0 && isVisionAvailable()
  const provider = ACTIVE.provider
  const model = wantVision ? ACTIVE.visionModel : ACTIVE.model
  const baseUrl = wantVision ? ACTIVE.visionBaseUrl : ACTIVE.baseUrl
  const apiKey = wantVision ? ACTIVE.visionKey : ACTIVE.apiKey

  const systemPrompt = buildSystemPrompt(question, mode, wantVision)
  const messages = [{ role: 'system', content: systemPrompt }]

  // 历史（discuss 上下文）
  for (const h of history) {
    messages.push({ role: h.role, content: h.content })
  }

  // user message（含图时用多模态结构）
  const userContent = buildUserContent(question, userPrompt, imageDataUris, wantVision)
  messages.push({ role: 'user', content: userContent })

  const started = Date.now()
  const result = await callChat(baseUrl, apiKey, model, messages, { signal })
  const elapsedMs = Date.now() - started

  if (result.error) {
    return { ...result, elapsedMs, provider, model }
  }

  return {
    markdown: result.markdown,
    tokens: result.tokens,
    elapsedMs,
    provider,
    model,
    imagesUsed: wantVision ? 1 : 0,
  }
}
