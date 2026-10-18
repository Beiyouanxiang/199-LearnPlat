// 199 错题本 · AI 老师 — 前端逻辑（纯 vanilla JS，无构建步骤）
// 安全约束：CSP script-src 'self'，无内联脚本；Markdown 经 marked + DOMPurify 清洗后渲染。
(function () {
  'use strict'

  // ---------- 工具 ----------
  const $ = (sel, root = document) => root.querySelector(sel)
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]
  const h = (tag, attrs = {}, children = []) => {
    const el = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v
      else if (k === 'html') el.innerHTML = v
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v)
      else if (v !== null && v !== undefined) el.setAttribute(k, v)
    }
    for (const c of [].concat(children)) {
      if (c == null) continue
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
    }
    return el
  }
  const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

  let toastTimer = null
  function toast(msg, ms = 2200) {
    let t = $('.toast')
    if (t) t.remove()
    t = h('div', { class: 'toast' }, msg)
    document.body.appendChild(t)
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => t.remove(), ms)
  }

  // 把常见 LaTeX 转纯文本（AI 偶尔忽略"禁用 LaTeX"指令时的兜底；前端不渲染 LaTeX）
  function stripLatex(md) {
    let s = String(md || '')
    // 行间 \[ ... \] 与 \( ... \) 定界符
    s = s.replace(/\\\[([\s\S]*?)\\\]/g, '\n$1\n').replace(/\\\(([\s\S]*?)\\\)/g, '$1')
    // $$..$$ 与 $..$（避免误伤纯数字如 $5——只匹配含反斜杠命令或 ^ _ 的片段）
    s = s.replace(/\$\$([\s\S]*?)\$\$/g, '\n$1\n')
    s = s.replace(/\$([^$\n]*\\[^$\n]*)\$/g, '$1')
    // 分数：\frac{a}{b} -> (a)/(b)；\dfrac 同理
    s = s.replace(/\\d?frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
    // 常用命令
    s = s.replace(/\\times/g, '×').replace(/\\div/g, '÷').replace(/\\pm/g, '±')
    s = s.replace(/\\leq/g, '≤').replace(/\\geq/g, '≥').replace(/\\neq/g, '≠').replace(/\\ne\b/g, '≠')
    s = s.replace(/\\approx/g, '≈').replace(/\\infty/g, '∞').replace(/\\cdot/g, '·')
    s = s.replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
    s = s.replace(/\\left|\\right/g, '')
    s = s.replace(/\\text\{([^{}]*)\}/g, '$1').replace(/\\mathrm\{([^{}]*)\}/g, '$1')
    // 剩余的孤立反斜杠命令（\quad \, \; 等）去掉
    s = s.replace(/\\[a-zA-Z]+/g, '')
    // 上标 ^{2} -> ² 简单情形
    s = s.replace(/\^\{([0-9]+)\}/g, (_, d) => {
      const sup = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }
      return d.split('').map((c) => sup[c]).join('')
    })
    // 下标 _{1} -> ₁ 简单情形
    s = s.replace(/_\{([0-9]+)\}/g, (_, d) => {
      const sub = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' }
      return d.split('').map((c) => sub[c]).join('')
    })
    return s
  }

  function renderMarkdown(md) {
    if (!md) return ''
    try {
      const raw = window.marked.parse(stripLatex(md))
      return window.DOMPurify.sanitize(raw)
    } catch {
      return '<pre>' + escapeHtml(md) + '</pre>'
    }
  }

  // ---------- API ----------
  const API = {
    token: localStorage.getItem('token') || '',
    async req(path, opts = {}) {
      const headers = { 'Content-Type': 'application/json' }
      if (API.token) headers.Authorization = 'Bearer ' + API.token
      let body
      if (opts.body !== undefined) {
        body = JSON.stringify(opts.body)
      }
      const resp = await fetch(path, { ...opts, headers: { ...headers, ...(opts.headers || {}) }, body })
      const text = await resp.text()
      let data
      try { data = text ? JSON.parse(text) : {} } catch { data = { error: '响应解析失败' } }
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`)
      return data
    },
    setToken(t) { API.token = t; localStorage.setItem('token', t) },
    clearToken() { API.token = ''; localStorage.removeItem('token') },
  }

  // ---------- 题型/学科/错因常量 ----------
  const SUBJECTS = [
    { key: 'math', label: '数学', badge: 'badge-math' },
    { key: 'logic', label: '逻辑', badge: 'badge-logic' },
    { key: 'writing', label: '写作', badge: 'badge-writing' },
  ]
  const TYPES = {
    math: [
      { key: 'problem_solving', label: '问题求解' },
      { key: 'sufficient_condition', label: '条件充分性判断' },
    ],
    logic: [{ key: 'logic_reasoning', label: '逻辑推理' }],
    writing: [
      { key: 'argument_analysis', label: '论证有效性分析' },
      { key: 'essay', label: '论说文' },
    ],
  }
  const MASTERY = [
    { key: 'unlearned', label: '未学', badge: 'badge-mastery-unlearned' },
    { key: 'learning', label: '学习中', badge: 'badge-mastery-learning' },
    { key: 'mastered', label: '已掌握', badge: 'badge-mastery-mastered' },
  ]
  const ERRORS = ['概念不清', '审题', '计算', '方法', '时间', '其他']

  const subjectLabel = (k) => SUBJECTS.find((s) => s.key === k)?.label || k
  const typeLabel = (k) => {
    for (const s of Object.values(TYPES)) {
      const f = s.find((t) => t.key === k)
      if (f) return f.label
    }
    return k
  }

  // ---------- 认证 ----------
  let authMode = 'login'
  const authScreen = $('#auth-screen')
  const appEl = $('#app')

  async function initAuth() {
    const form = $('#auth-form')
    const toggle = $('#auth-toggle')
    const submit = $('#auth-submit')
    const invite = $('#invite-field')
    const errEl = $('#auth-error')

    // 检查是否需要邀请码
    try {
      const info = await API.req('/api/info')
      if (info.auth_required === false || info.features) {
        // 生产需要邀请码时显示
      }
    } catch {}

    function setMode(m) {
      authMode = m
      submit.textContent = m === 'login' ? '登录' : '注册'
      toggle.textContent = m === 'login' ? '去注册' : '去登录'
      invite.hidden = m !== 'register'
      errEl.hidden = true
    }
    toggle.addEventListener('click', () => setMode(authMode === 'login' ? 'register' : 'login'))

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd = new FormData(form)
      const payload = { username: fd.get('username'), password: fd.get('password') }
      if (authMode === 'register') payload.inviteCode = fd.get('inviteCode') || ''
      submit.disabled = true
      errEl.hidden = true
      try {
        const path = authMode === 'login' ? '/api/auth/login' : '/api/auth/register'
        const data = await API.req(path, { method: 'POST', body: payload })
        API.setToken(data.token)
        enterApp(data.user)
      } catch (err) {
        errEl.textContent = err.message
        errEl.hidden = false
      } finally {
        submit.disabled = false
      }
    })

    // 若已有 token，尝试恢复会话
    if (API.token) {
      try {
        const data = await API.req('/api/auth/me')
        enterApp(data.user)
        return
      } catch {
        API.clearToken()
      }
    }
    setMode('login')
    authScreen.hidden = false
  }

  function enterApp(user) {
    authScreen.hidden = true
    appEl.hidden = false
    $('#user-name').textContent = user.username
    $('#logout-btn').onclick = () => { API.clearToken(); location.reload() }
    $$('#nav a').forEach((a) => a.addEventListener('click', (e) => {
      $$('#nav a').forEach((x) => x.classList.remove('active'))
      a.classList.add('active')
    }))
    window.addEventListener('hashchange', router)
    if (!location.hash) location.hash = '#/home'
    router()
  }

  // ---------- 路由 ----------
  const view = $('#view')
  function router() {
    const route = (location.hash || '#/home').slice(2) || 'home'
    const [name, param] = route.split('/')
    $$('#nav a').forEach((a) => {
      a.classList.toggle('active', a.dataset.route === name)
    })
    view.innerHTML = ''
    const map = { home: renderHome, capture: renderCapture, list: renderList, review: renderReview, more: renderMore, question: () => renderQuestion(param) }
    ;(map[name] || renderHome)(param).catch((err) => {
      if (err.message.includes('未登录')) { API.clearToken(); location.reload() }
      view.innerHTML = `<div class="empty"><div class="em-icon">⚠️</div><div class="em-text">${escapeHtml(err.message)}</div></div>`
    })
  }

  // ---------- 首页 ----------
  async function renderHome() {
    view.appendChild(h('h1', { class: 'page-title' }, '学习工作台'))
    const loading = h('div', { class: 'loading' }, '加载中…')
    view.appendChild(loading)
    let stats, review, recent
    try {
      ;[stats, review, recent] = await Promise.all([
        API.req('/api/stats'),
        API.req('/api/review'),
        API.req('/api/questions?limit=5'),
      ])
    } catch (err) {
      loading.remove()
      throw err
    }
    loading.remove()

    // 录题入口
    view.appendChild(h('div', { class: 'entry-cards' }, [
      entryCard('📝', '拍照录题', '上传或粘贴题目图片，OCR 识别后校对保存', () => { location.hash = '#/capture' }),
      entryCard('🔁', '待复习', `今天有 ${review.items.length} 道题待复习`, () => { location.hash = '#/review' }),
      entryCard('📚', '错题本', `共 ${stats.total} 道错题`, () => { location.hash = '#/list' }),
      entryCard('📤', '导入导出', '备份与恢复题目数据', () => { location.hash = '#/more' }),
    ]))

    // 统计
    view.appendChild(h('div', { class: 'section-title' }, '学习概况'))
    const sg = h('div', { class: 'stats-grid' })
    sg.appendChild(statCard(stats.total, '总题数'))
    sg.appendChild(statCard(stats.by_mastery?.mastered || 0, '已掌握'))
    sg.appendChild(statCard(stats.by_mastery?.learning || 0, '学习中'))
    sg.appendChild(statCard(stats.review_due || 0, '今日待复习'))
    view.appendChild(sg)

    // 待复习
    if (review.items.length) {
      view.appendChild(h('div', { class: 'section-title' }, '今日待复习'))
      view.appendChild(renderQuestionList(review.items.slice(0, 5)))
    }

    // 最近错题
    if (recent.items.length) {
      view.appendChild(h('div', { class: 'section-title' }, '最近录题'))
      view.appendChild(renderQuestionList(recent.items))
    }
  }

  function entryCard(icon, title, desc, onClick) {
    return h('div', { class: 'entry-card', onclick: onClick }, [
      h('div', { class: 'ic-icon' }, icon),
      h('div', { class: 'ic-title' }, title),
      h('div', { class: 'ic-desc' }, desc),
    ])
  }
  function statCard(num, label) {
    return h('div', { class: 'stat-card' }, [h('div', { class: 'stat-num' }, String(num)), h('div', { class: 'stat-label' }, label)])
  }

  // ---------- 题目列表组件 ----------
  function renderQuestionList(items) {
    if (!items.length) return h('div', { class: 'empty' }, [h('div', { class: 'em-icon' }, '📭'), h('div', { class: 'em-text' }, '暂无题目')])
    const wrap = h('div', { class: 'q-list' })
    for (const q of items) {
      wrap.appendChild(h('div', { class: 'q-item', onclick: () => { location.hash = '#/question/' + q.id } }, [
        h('div', { class: 'q-thumb' + (q.thumb_url ? '' : ' empty') }, q.thumb_url ? h('img', { src: q.thumb_url, alt: '' }) : '无图'),
        h('div', { class: 'q-body' }, [
          h('div', { class: 'q-title' }, q.title || '(无标题)'),
          h('div', { class: 'q-meta' }, [
            h('span', { class: 'badge badge-subject ' + (SUBJECTS.find((s) => s.key === q.subject)?.badge || '') }, subjectLabel(q.subject)),
            h('span', {}, typeLabel(q.question_type)),
            q.error_reason ? h('span', { class: 'badge badge-error' }, q.error_reason) : null,
            h('span', {}, new Date(q.created_at).toLocaleDateString('zh-CN')),
          ]),
          ...(q.tags || []).length ? [h('div', { class: 'q-tags' }, q.tags.slice(0, 4).map((t) => h('span', { class: 'badge badge-tag' }, t)))] : [],
        ]),
      ]))
    }
    return wrap
  }

  // ---------- 录题 ----------
  async function renderCapture() {
    view.appendChild(h('h1', { class: 'page-title' }, '录题'))
    const images = [] // { dataUri, mime }

    const card = h('div', { class: 'card' })
    const zone = h('div', { class: 'capture-zone', tabindex: '0' }, [
      h('div', { class: 'cz-icon' }, '📷'),
      h('div', {}, '点击选择 / 拖拽 / 粘贴图片（Ctrl/⌘+V）'),
      h('div', { class: 'cz-hint' }, '支持一题多图，用于跨页题目'),
    ])
    // 相册选择（所有设备）
    const fileInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/bmp', multiple: 'true', style: 'display:none' })
    // 直接调相机（手机）；capture 环境属性会触发系统相机而非相册
    const cameraInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', capture: 'environment', style: 'display:none' })
    const strip = h('div', { class: 'image-strip' })

    zone.addEventListener('click', () => fileInput.click())
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover') })
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'))
    zone.addEventListener('drop', (e) => {
      e.preventDefault(); zone.classList.remove('dragover')
      handleFiles(e.dataTransfer.files)
    })
    fileInput.addEventListener('change', () => handleFiles(fileInput.files))
    cameraInput.addEventListener('change', () => { handleFiles(cameraInput.files); cameraInput.value = '' })

    // 拍照按钮：触屏/窄屏显示，桌面隐藏（桌面有拖拽/粘贴/选择）
    const cameraBtn = h('button', { class: 'btn btn-primary', style: 'margin-top:10px;width:100%', onclick: () => cameraInput.click() }, '📸 拍照录题')
    if (!('ontouchstart' in window) && !window.matchMedia('(max-width: 760px)').matches) {
      cameraBtn.style.display = 'none'
    }
    card.appendChild(zone)
    card.appendChild(fileInput)
    card.appendChild(cameraInput)
    card.appendChild(cameraBtn)

    async function handleFiles(files) {
      for (const f of files) {
        if (!f.type.startsWith('image/')) continue
        const dataUri = await fileToDataUri(f)
        images.push({ dataUri, mime: f.type })
      }
      renderStrip()
    }
    function renderStrip() {
      strip.innerHTML = ''
      images.forEach((im, i) => {
        strip.appendChild(h('div', { class: 'image-thumb' }, [
          h('img', { src: im.dataUri, alt: '' }),
          h('div', { class: 'img-order' }, String(i + 1)),
          h('div', { class: 'img-actions' }, [
            h('button', { onclick: () => rotateImage(i) }, '旋转'),
            h('button', { onclick: () => moveImage(i, -1) }, '◀'),
            h('button', { onclick: () => moveImage(i, 1) }, '▶'),
            h('button', { onclick: () => { images.splice(i, 1); renderStrip() } }, '删除'),
          ]),
        ]))
      })
      // 同步 OCR 按钮 disabled：images 变化时重设（创建时 disabled 固定，必须显式同步）
      ocrBtn.disabled = images.length === 0
    }
    function rotateImage(i) {
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = img.height; c.height = img.width
        const ctx = c.getContext('2d')
        ctx.translate(c.width / 2, c.height / 2)
        ctx.rotate(Math.PI / 2)
        ctx.drawImage(img, -img.width / 2, -img.height / 2)
        images[i].dataUri = c.toDataURL(images[i].mime)
        images[i].mime = 'image/png'
        renderStrip()
      }
      img.src = images[i].dataUri
    }
    function moveImage(i, dir) {
      const j = i + dir
      if (j < 0 || j >= images.length) return
      ;[images[i], images[j]] = [images[j], images[i]]
      renderStrip()
    }

    // zone/fileInput/cameraInput/cameraBtn 已在上方 append，这里只加缩略图条
    card.appendChild(strip)

    // OCR
    const ocrBtn = h('button', { class: 'btn btn-primary', onclick: doOcr, disabled: images.length === 0 ? '' : null }, '🔍 识别题目')
    const ocrStatus = h('div', { class: '', style: 'margin-top:10px;color:var(--text-dim);font-size:13px' })
    async function doOcr() {
      if (!images.length) return toast('请先添加图片')
      ocrBtn.disabled = true
      ocrStatus.textContent = images.length > 1 ? `识别中…（合并 ${images.length} 张）` : '识别中…'
      try {
        // 合并多图识别：layout_parsing 端点 file 接受 string | string[]
        const result = await API.req('/api/ocr', {
          method: 'POST',
          body: { image: images.length === 1 ? images[0].dataUri : images.map((im) => im.dataUri) },
        })
        const md = result.markdown || ''
        stemField.value = md
        // 保留原始 OCR markdown 到 dataset，保存时写入 stem_raw（不被校对稿覆盖）
        stemField.dataset.ocrRaw = md
        ocrStatus.textContent = `识别完成，耗时 ${(result.elapsedMs / 1000).toFixed(1)}s，已填入题干（可校对编辑）`
        toast('识别完成，请校对')
        // 多题检测与拆分提示
        const blocks = splitQuestions(md)
        if (blocks.length > 1) showSplitPrompt(blocks, md)
      } catch (err) {
        ocrStatus.textContent = ''
        toast('识别失败：' + err.message)
      } finally {
        ocrBtn.disabled = images.length === 0
      }
    }
    // 按行首题号（"1. "/"1、"/"（1）" 等）切块
    function splitQuestions(md) {
      const lines = md.split('\n')
      const blocks = []
      let cur = ''
      for (const line of lines) {
        if (/^\s*\d+[.、)）]/.test(line) && cur) {
          blocks.push(cur); cur = line
        } else {
          cur = cur ? cur + '\n' + line : line
        }
      }
      if (cur) blocks.push(cur)
      return blocks.map((b) => b.trim()).filter(Boolean)
    }
    function showSplitPrompt(blocks, rawMd) {
      const n = blocks.length
      const wrap = h('div', { style: 'margin-top:6px' }, [
        h('span', { style: 'color:var(--text-dim);font-size:13px' }, `检测到 ${n} 道题 `),
        h('button', { class: 'btn btn-sm', style: 'margin-left:6px', onclick: async (e) => {
          if (!confirm(`按题号拆分为 ${n} 道题并一次性保存？\n图片共享，首行作为标题`)) return
          e.target.disabled = true
          try {
            const ids = []
            for (let i = 0; i < blocks.length; i++) {
              const block = blocks[i]
              const firstLine = block.split('\n')[0]
              const title = firstLine.replace(/^\s*\d+[.、)）]\s*/, '').slice(0, 50) || `题 ${i + 1}`
              const q = await API.req('/api/questions', { method: 'POST', body: {
                subject: subjectSel.value,
                question_type: typeSel.value,
                title,
                stem: block,
                stem_raw: rawMd,
                images: images.map((im) => im.dataUri),
              }})
              ids.push(q.id)
            }
            toast(`已创建 ${ids.length} 道题`)
            location.hash = '#/question/' + ids[0]
          } catch (err) { toast('拆分失败：' + err.message); e.target.disabled = false }
        } }, `✂️ 拆为 ${n} 道题`),
      ])
      ocrStatus.appendChild(wrap)
    }
    card.appendChild(h('div', { style: 'margin-top:12px;display:flex;gap:8px' }, [ocrBtn, ocrStatus]))

    // 题干
    const stemField = h('textarea', { placeholder: '题干（OCR 识别后可在此校对编辑）', style: 'width:100%;min-height:120px;font-family:inherit;border:1px solid var(--border-strong);border-radius:8px;padding:10px;font-size:14px' })
    card.appendChild(h('div', { class: 'field', style: 'margin-top:16px' }, [h('span', {}, '题干（校对后）'), stemField]))

    // 元数据
    const subjectSel = h('select', {}, SUBJECTS.map((s) => h('option', { value: s.key }, s.label)))
    const typeSel = h('select', {})
    function refreshTypes() {
      typeSel.innerHTML = ''
      const sub = subjectSel.value
      for (const t of TYPES[sub] || []) typeSel.appendChild(h('option', { value: t.key }, t.label))
    }
    subjectSel.addEventListener('change', refreshTypes)
    refreshTypes()

    const correctInput = h('input', { type: 'text', placeholder: '如 A / B / 充分 / 详见解析' })
    const userInput = h('input', { type: 'text', placeholder: '你当时选的答案' })
    const sourceInput = h('input', { type: 'text', placeholder: '如 2024真题 / 模拟卷3' })
    const kpInput = h('input', { type: 'text', placeholder: '逗号分隔，如 行程问题,比例' })
    const tagInput = h('input', { type: 'text', placeholder: '逗号分隔' })
    const errorSel = h('select', {}, [h('option', { value: '' }, '选择错因…'), ...ERRORS.map((e) => h('option', { value: e }, e))])
    const errorNote = h('input', { type: 'text', placeholder: '错因备注（可选）' })

    card.appendChild(h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px' }, [
      field('学科', subjectSel),
      field('题型', typeSel),
      field('正确答案', correctInput),
      field('你的答案', userInput),
      field('来源', sourceInput),
      field('知识点', kpInput),
      field('错因', errorSel),
      field('错因备注', errorNote),
      field('标签', tagInput),
    ]))

    const saveBtn = h('button', { class: 'btn btn-primary btn-block', style: 'margin-top:16px', onclick: save }, '💾 保存到错题本')
    async function save() {
      const payload = {
        subject: subjectSel.value,
        question_type: typeSel.value,
        stem: stemField.value,
        // stem_raw 用 OCR 原始 markdown（不被校对稿覆盖）；无 OCR 时回退到 stem
        stem_raw: stemField.dataset.ocrRaw || stemField.value,
        correct_answer: correctInput.value,
        user_answer: userInput.value,
        source: sourceInput.value,
        knowledge_points: kpInput.value.split(',').map((s) => s.trim()).filter(Boolean),
        error_reason: errorSel.value,
        error_reason_note: errorNote.value,
        tags: tagInput.value.split(',').map((s) => s.trim()).filter(Boolean),
        images: images.map((im) => im.dataUri),
      }
      if (!payload.stem) return toast('题干不能为空')
      saveBtn.disabled = true
      saveBtn.textContent = '保存中…'
      try {
        const q = await API.req('/api/questions', { method: 'POST', body: payload })
        toast('已保存')
        location.hash = '#/question/' + q.id
      } catch (err) {
        toast('保存失败：' + err.message)
      } finally {
        saveBtn.disabled = false
        saveBtn.textContent = '💾 保存到错题本'
      }
    }
    card.appendChild(saveBtn)
    view.appendChild(card)

    // 粘贴监听
    function onPaste(e) {
      if (location.hash !== '#/capture') return
      const items = e.clipboardData?.items || []
      for (const it of items) {
        if (it.type.startsWith('image/')) {
          const f = it.getAsFile()
          if (f) handleFiles([f])
        }
      }
    }
    document.addEventListener('paste', onPaste)
  }

  function field(label, child) {
    return h('div', { class: 'field' }, [h('span', {}, label), child])
  }
  function fileToDataUri(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = reject
      r.readAsDataURL(file)
    })
  }

  // ---------- 错题列表 ----------
  async function renderList() {
    view.appendChild(h('h1', { class: 'page-title' }, '错题本'))
    const subjectSel = h('select', {}, [h('option', { value: '' }, '全部学科'), ...SUBJECTS.map((s) => h('option', { value: s.key }, s.label))])
    const masterySel = h('select', {}, [h('option', { value: '' }, '全部状态'), ...MASTERY.map((m) => h('option', { value: m.key }, m.label))])
    const search = h('input', { type: 'search', placeholder: '搜索题干、知识点、标签、来源…' })
    const list = h('div', { class: 'q-list' })
    const loading = h('div', { class: 'loading' }, '加载中…')

    const bar = h('div', { class: 'filter-bar' }, [subjectSel, masterySel, search])
    view.appendChild(bar)
    view.appendChild(loading)

    let timer = null
    async function load() {
      loading.hidden = false
      list.innerHTML = ''
      const params = new URLSearchParams()
      if (subjectSel.value) params.set('subject', subjectSel.value)
      if (masterySel.value) params.set('mastery', masterySel.value)
      if (search.value) params.set('q', search.value)
      try {
        const data = await API.req('/api/questions?' + params)
        loading.hidden = true
        if (data.items.length) {
          list.appendChild(renderQuestionList(data.items))
        } else {
          list.appendChild(h('div', { class: 'empty' }, [h('div', { class: 'em-icon' }, '📭'), h('div', { class: 'em-text' }, '没有符合条件的题目')]))
        }
      } catch (err) {
        loading.hidden = true
        list.appendChild(h('div', { class: 'empty' }, '加载失败：' + escapeHtml(err.message)))
      }
    }
    ;[subjectSel, masterySel].forEach((s) => s.addEventListener('change', load))
    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 350) })
    view.appendChild(list)
    load()
  }

  // ---------- 复习 ----------
  async function renderReview() {
    view.appendChild(h('h1', { class: 'page-title' }, '复习计划'))
    const loading = h('div', { class: 'loading' }, '加载中…')
    view.appendChild(loading)
    let data
    try { data = await API.req('/api/review') } catch (err) { loading.remove(); throw err }
    loading.remove()
    if (!data.items.length) {
      view.appendChild(h('div', { class: 'empty' }, [h('div', { class: 'em-icon' }, '🎉'), h('div', { class: 'em-text' }, '今天没有待复习的题目')]))
      return
    }
    view.appendChild(h('div', { class: 'section-title' }, `待复习 ${data.items.length} 道`))
    view.appendChild(renderQuestionList(data.items))
  }

  // ---------- 题目详情 ----------
  async function renderQuestion(id) {
    view.appendChild(h('div', { class: 'loading' }, '加载中…'))
    let q
    try { q = await API.req('/api/questions/' + id) } catch (err) { view.innerHTML = ''; throw err }
    view.innerHTML = ''

    // 头部
    view.appendChild(h('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap' }, [
      h('a', { href: '#/list', class: 'btn btn-sm' }, '← 返回列表'),
      h('span', { class: 'badge badge-subject ' + (SUBJECTS.find((s) => s.key === q.subject)?.badge || '') }, subjectLabel(q.subject)),
      h('span', { class: 'badge' }, typeLabel(q.question_type)),
      h('span', { class: 'badge ' + (MASTERY.find((m) => m.key === q.mastery)?.badge || '') }, MASTERY.find((m) => m.key === q.mastery)?.label || q.mastery),
    ]))

    // 主体：左图右题
    const layout = h('div', { class: 'qd-layout' })
    const imgCol = h('div', { class: 'qd-images' })
    if (q.images?.length) {
      q.images.forEach((im, i) => {
        imgCol.appendChild(h('div', { class: 'qd-image' }, h('img', { src: im.access_url || ('/api/images/' + im.id), alt: '题图 ' + (i + 1) })))
      })
    } else {
      imgCol.appendChild(h('div', { class: 'empty' }, '本题无图片'))
    }

    const body = h('div', {}, [
      h('div', { class: 'section-title' }, '题干'),
      h('div', { class: 'qd-stem' }, h('div', { class: 'q-stem-markdown', html: renderMarkdown(q.stem || q.stem_raw) })),
    ])

    if (q.options?.length) {
      const ol = h('ul', { class: 'qd-options' })
      q.options.forEach((o) => {
        const isCorrect = q.correct_answer && o.key.toUpperCase() === q.correct_answer.toUpperCase()
        const isWrong = q.user_answer && o.key.toUpperCase() === q.user_answer.toUpperCase() && !isCorrect
        ol.appendChild(h('li', { class: isCorrect ? 'correct' : isWrong ? 'wrong' : '' }, [
          h('strong', {}, o.key + '. '),
          ' ' + o.text,
          isCorrect ? ' ✓' : isWrong ? ' ✗(你选的)' : '',
        ]))
      })
      body.appendChild(ol)
    }
    // 正确答案不在此处展示，避免重做时上方泄露（仅在重做揭晓后显示）
    if (q.user_answer) body.appendChild(h('p', { style: 'color:var(--danger)' }, '你的答案：' + escapeHtml(q.user_answer)))
    if (q.error_reason) body.appendChild(h('p', {}, [h('span', { class: 'badge badge-error' }, '错因：' + q.error_reason), q.error_reason_note ? ' ' + escapeHtml(q.error_reason_note) : '']))
    if (q.source) body.appendChild(h('p', { style: 'color:var(--text-dim)' }, '来源：' + escapeHtml(q.source)))
    if (q.knowledge_points?.length) body.appendChild(h('p', { style: 'color:var(--text-dim)' }, '知识点：' + q.knowledge_points.join('、')))
    if (q.tags?.length) body.appendChild(h('div', { class: 'q-tags', style: 'margin-top:8px' }, q.tags.map((t) => h('span', { class: 'badge badge-tag' }, t))))

    layout.appendChild(imgCol)
    layout.appendChild(body)
    view.appendChild(layout)

    // AI 老师
    view.appendChild(h('div', { class: 'section-title' }, 'AI 老师'))
    const tutorBox = h('div', { class: 'tutor-box' })
    const tutorInput = h('textarea', { placeholder: '向老师提问（可选）…' })
    let currentReqId = null
    let histToken = null

    // 重开题目时加载历史讲解（修复：原版每次进入都是空白，讲解只存库不回显）
    ;(async () => {
      const viewToken = Symbol('hist')
      histToken = viewToken
      try {
        const hist = await API.req('/api/questions/' + q.id + '/tutor')
        if (histToken !== viewToken) return // 已切题，丢弃
        for (const s of hist.items || []) {
          const modeLabel = s.mode === 'hint' ? '提示' : s.mode === 'explain' ? '讲解' : s.mode === 'discuss' ? '讨论' : s.mode
          const role = s.user_prompt ? modeLabel : modeLabel
          if (s.user_prompt) tutorBox.appendChild(h('div', { class: 'tutor-msg user' }, [h('div', { class: 'msg-role' }, '你'), h('div', {}, escapeHtml(s.user_prompt))]))
          tutorBox.appendChild(h('div', { class: 'tutor-msg ai' }, [
            h('div', { class: 'msg-role' }, `${role} · ${s.provider || '?'}/${s.model || '?'}`),
            h('div', { class: 'md-body', html: renderMarkdown(s.response_markdown || '') }),
          ]))
        }
        tutorBox.scrollTop = tutorBox.scrollHeight
      } catch { /* 历史加载失败不阻塞 */ }
    })()

    async function callTutor(mode, prompt) {
      const reqId = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8)
      currentReqId = reqId
      const btns = $$('.tutor-btn')
      btns.forEach((b) => (b.disabled = true))
      const loadingMsg = h('div', { class: 'tutor-msg ai' }, [h('div', { class: 'msg-role' }, mode === 'hint' ? '提示' : mode === 'explain' ? '讲解' : '讨论'), h('div', {}, h('span', { class: 'spinner' }), ' 思考中…')])
      tutorBox.appendChild(loadingMsg)
      tutorBox.scrollTop = tutorBox.scrollHeight
      try {
        const data = await API.req('/api/questions/' + q.id + '/tutor', {
          method: 'POST',
          body: { mode, requestId: reqId, prompt: prompt || '', useImage: true },
        })
        if (currentReqId !== reqId) return // 切换题目/取消，忽略旧响应
        loadingMsg.remove()
        tutorBox.appendChild(h('div', { class: 'tutor-msg ai' }, [
          h('div', { class: 'msg-role' }, `${data.provider}/${data.model}${data.imagesUsed ? ' · 含图' : ' · 纯文本'}`),
          h('div', { class: 'md-body', html: renderMarkdown(data.markdown) }),
        ]))
      } catch (err) {
        loadingMsg.remove()
        tutorBox.appendChild(h('div', { class: 'tutor-msg ai' }, [h('div', { class: 'msg-role' }, '错误'), h('div', { style: 'color:var(--danger)' }, err.message)]))
      } finally {
        btns.forEach((b) => (b.disabled = false))
        tutorBox.scrollTop = tutorBox.scrollHeight
      }
    }

    const btnRow = h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
      h('button', { class: 'btn btn-primary btn-sm tutor-btn', onclick: () => callTutor('hint', '') }, '💡 给我提示'),
      h('button', { class: 'btn btn-sm tutor-btn', onclick: () => callTutor('explain', '') }, '📖 完整讲解'),
    ])
    const discussRow = h('div', { class: 'tutor-input' }, [
      tutorInput,
      h('button', { class: 'btn btn-sm tutor-btn', onclick: () => { const p = tutorInput.value.trim(); if (p) { callTutor('discuss', p); tutorInput.value = '' } } }, '继续讨论'),
    ])
    view.appendChild(btnRow)
    view.appendChild(tutorBox)
    view.appendChild(discussRow)

    // 重做
    view.appendChild(h('div', { class: 'section-title' }, '重做检验'))
    const redoState = { revealed: false, answer: '' }
    const redoCover = h('div', { class: 'redo-cover' }, '答案与讲解已隐藏，先独立做一遍')
    const redoInput = h('input', { type: 'text', placeholder: '输入你的重做答案', style: 'flex:1' })
    const redoBtn = h('button', { class: 'btn btn-sm', onclick: () => {
      const ans = redoInput.value.trim()
      if (!ans) return toast('请输入答案')
      // 无正确答案时判 partial（无法判定对错），需补录正确答案后才能自动判掌握
      let result
      if (!q.correct_answer) result = 'partial'
      else result = ans.toUpperCase() === q.correct_answer.toUpperCase() ? 'correct' : 'wrong'
      redoCover.remove()
      redoState.revealed = true
      redoSubmit(ans, result)
    } }, '提交')
    const redoRow = h('div', { class: 'tutor-input' }, [redoInput, redoBtn])
    const redoResult = h('div')
    view.appendChild(redoCover)
    view.appendChild(redoRow)
    view.appendChild(redoResult)
    async function redoSubmit(ans, result) {
      try {
        const data = await API.req('/api/questions/' + q.id + '/redo', { method: 'POST', body: { redoAnswer: ans, result, durationMs: 0 } })
        const label = result === 'correct' ? '✓ 重做正确，已标记掌握' : result === 'partial' ? '◐ 该题未记录正确答案，无法自动判定（请在编辑中补录）' : '✗ 重做有误，已标记学习中'
        redoResult.appendChild(h('div', { class: 'redo-result ' + result }, label))
        redoResult.appendChild(h('div', { style: 'margin-top:8px;color:var(--text-dim);font-size:13px' }, '正确答案：' + escapeHtml(q.correct_answer || '(未记录)')))
      } catch (err) { toast(err.message) }
    }

    // 复习设置
    view.appendChild(h('div', { class: 'section-title' }, '复习安排'))
    const reviewSel = h('select', {}, [
      h('option', { value: '0' }, '不安排'),
      h('option', { value: '1' }, '明天'),
      h('option', { value: '3' }, '3天后'),
      h('option', { value: '7' }, '1周后'),
      h('option', { value: '14' }, '2周后'),
    ])
    reviewSel.value = ''
    reviewSel.addEventListener('change', async () => {
      const days = Number(reviewSel.value)
      const due = days ? Date.now() + days * 86400000 : 0
      try { await API.req('/api/questions/' + q.id + '/review', { method: 'PATCH', body: { reviewDueAt: due } }); toast(days ? `已安排 ${days} 天后复习` : '已取消复习') } catch (e) { toast(e.message) }
    })
    view.appendChild(h('div', { style: 'display:flex;gap:8px;align-items:center' }, [h('span', {}, '安排复习：'), reviewSel]))

    // 删除
    view.appendChild(h('div', { style: 'margin-top:24px' }, [
      h('button', { class: 'btn btn-danger btn-sm', onclick: async () => {
        if (!confirm('确认删除此题？含图片与讲解将一并删除，不可恢复。')) return
        try { await API.req('/api/questions/' + q.id, { method: 'DELETE' }); toast('已删除'); location.hash = '#/list' } catch (e) { toast(e.message) }
      } }, '🗑 删除此题'),
    ]))
  }

  // ---------- 更多（导入导出/统计） ----------
  async function renderMore() {
    view.appendChild(h('h1', { class: 'page-title' }, '更多'))
    const card = h('div', { class: 'card' })
    card.appendChild(h('div', { class: 'section-title' }, '数据'))
    card.appendChild(h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
      h('button', { class: 'btn', onclick: async () => {
        try {
          const data = await API.req('/api/export')
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
          const a = h('a', { href: URL.createObjectURL(blob), download: 'exam199-export-' + Date.now() + '.json' })
          a.click()
          toast('已导出')
        } catch (e) { toast(e.message) }
      } }, '📤 导出全部题目（含图片）'),
      h('label', { class: 'btn', style: 'cursor:pointer' }, [
        '📥 导入题目',
        (() => { const inp = h('input', { type: 'file', accept: '.json', style: 'display:none' }); inp.addEventListener('change', async () => {
          const f = inp.files[0]; if (!f) return
          try { const text = await f.text(); const json = JSON.parse(text); const r = await API.req('/api/import', { method: 'POST', body: json }); toast(`已导入 ${r.imported} 题`) } catch (e) { toast(e.message) }
        }); return inp })(),
      ]),
    ]))
    view.appendChild(card)

    // 考试信息
    const info = h('div', { class: 'card', style: 'margin-top:16px' })
    info.appendChild(h('div', { class: 'section-title' }, '关于 199 管理类联考综合能力'))
    info.appendChild(h('div', { html: '<p>满分 200 分 / 180 分钟。数学 75 分（问题求解 15 题 + 条件充分性判断 10 题，每题 3 分）；逻辑 60 分（30 题，每题 2 分）；写作 65 分（论证有效性分析 30 分 + 论说文 35 分）。</p><p style="color:var(--text-dim);font-size:13px">详见 docs/EXAM-199-INFO.md</p>' }))
    view.appendChild(info)
  }

  // ---------- 启动 ----------
  initAuth()
})()
