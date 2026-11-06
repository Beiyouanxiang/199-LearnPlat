// 199 错题本 · AI 老师 — 前端逻辑（纯 vanilla JS，无构建步骤）
// 安全约束：CSP script-src 'self'，无内联脚本；Markdown 经 marked + DOMPurify 清洗后渲染，公式由 KaTeX 渲染。
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
      else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v)
    }
    for (const c of [].concat(children)) {
      if (c == null || c === false) continue
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

  const fmtDuration = (ms) => {
    const s = Math.round(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }
  const fmtDay = (ts) => {
    if (!ts) return '未安排'
    const days = Math.round((new Date(ts).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000)
    if (days <= 0) return '今天'
    if (days === 1) return '明天'
    return `${days} 天后（${new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}）`
  }

  // ---------- Markdown + 公式 ----------
  // 先把公式抽成占位符，Markdown 渲染并经 DOMPurify 清洗后再填回 KaTeX 结果，
  // 避免 marked 破坏 LaTeX 里的 \\、_、* 等字符。KaTeX 默认 trust:false，不会输出链接/脚本。
  function renderMath(md) {
    const store = []
    const put = (tex, displayMode) => {
      let html
      try {
        html = window.katex.renderToString(tex.trim(), { displayMode, throwOnError: false, strict: 'ignore' })
      } catch {
        html = escapeHtml(tex)
      }
      store.push(html)
      return `KMATH${store.length - 1}X`
    }
    let s = String(md)
    s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => put(t, true))
    s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => put(t, true))
    s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_, t) => put(t, false))
    // 行内 $...$：内容首尾不能是空白，避免把 "$5 和 $6" 这类金额误当公式
    s = s.replace(/\$([^\s$](?:[^$\n]*?[^\s$\\])?)\$/g, (_, t) => put(t, false))
    return { text: s, store }
  }

  function renderMarkdown(md) {
    if (!md) return ''
    try {
      if (!window.katex) {
        return window.DOMPurify.sanitize(window.marked.parse(String(md), { breaks: true }))
      }
      const { text, store } = renderMath(md)
      const safe = window.DOMPurify.sanitize(window.marked.parse(text, { breaks: true }))
      return safe.replace(/KMATH(\d+)X/g, (_, i) => store[Number(i)] ?? '')
    } catch {
      return '<pre>' + escapeHtml(md) + '</pre>'
    }
  }
  const mdBlock = (md, cls = 'md-body') => h('div', { class: cls, html: renderMarkdown(md) })

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
  // 数学错因细分：区分"不会"与"会但没做对"，复习时针对性不同
  const ERRORS = ['概念不清', '公式记错', '审题漏条件', '计算失误', '方法不会', '超时', '粗心', '其他']
  const LETTERS = ['A', 'B', 'C', 'D', 'E']

  // 条件充分性判断：每个选项对应的分步判断（s1=条件(1)单独，s2=条件(2)单独，joint=联合）
  const SUFF_STEPS = {
    A: { s1: true, s2: false },
    B: { s1: false, s2: true },
    C: { s1: false, s2: false, joint: true },
    D: { s1: true, s2: true },
    E: { s1: false, s2: false, joint: false },
  }
  function suffLetter({ s1, s2, joint }) {
    if (s1 && s2) return 'D'
    if (s1) return 'A'
    if (s2) return 'B'
    if (joint === true) return 'C'
    if (joint === false) return 'E'
    return ''
  }

  const subjectLabel = (k) => SUBJECTS.find((s) => s.key === k)?.label || k
  const typeLabel = (k) => {
    for (const s of Object.values(TYPES)) {
      const f = s.find((t) => t.key === k)
      if (f) return f.label
    }
    return k
  }
  const isLetterAnswer = (a) => /^[A-E]$/i.test(String(a || '').trim())

  // 知识点树（登录后加载一次）
  let KNOWLEDGE = { tree: [], sufficiency_options: {} }
  async function loadKnowledge() {
    try { KNOWLEDGE = await API.req('/api/knowledge') } catch { /* 不阻塞 */ }
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

  async function enterApp(user) {
    batchOwner = user.id
    authScreen.hidden = true
    appEl.hidden = false
    $('#user-name').textContent = user.username
    $('#logout-btn').onclick = () => { API.clearToken(); location.reload() }
    await loadKnowledge()
    window.addEventListener('hashchange', router)
    if (!location.hash) location.hash = '#/home'
    router()
  }

  // ---------- 路由 ----------
  // 每个视图可注册清理函数（计时器、粘贴监听），切换路由时执行
  let cleanups = []
  const onLeave = (fn) => cleanups.push(fn)
  let pasteHandler = null
  document.addEventListener('paste', (e) => pasteHandler && pasteHandler(e))

  const view = $('#view')
  function router() {
    cleanups.forEach((fn) => { try { fn() } catch {} })
    cleanups = []
    pasteHandler = null
    const raw = (location.hash || '#/home').slice(2) || 'home'
    const [path, qs] = raw.split('?')
    const [name, param] = path.split('/')
    const query = new URLSearchParams(qs || '')
    $$('#nav a').forEach((a) => {
      a.classList.toggle('active', a.dataset.route === name)
    })
    view.innerHTML = ''
    window.scrollTo(0, 0)
    const map = {
      ...window.essayPages({h,view,API,toast,onLeave,preprocessImage}),
      home: renderHome,
      capture: renderCapture,
      batch: renderBatch,
      'review-ocr': renderReviewOcr,
      list: renderList,
      review: renderSession,
      cards: renderCards,
      more: renderMore,
      question: renderQuestion,
      topics: renderTopics,
      topic: renderTopic,
    }
    ;(map[name] || renderHome)(param, query).catch((err) => {
      if (err.message.includes('未登录')) { API.clearToken(); location.reload() }
      view.innerHTML = `<div class="empty"><div class="em-icon">⚠️</div><div class="em-text">${escapeHtml(err.message)}</div></div>`
    })
  }

  // ---------- 首页：今日任务 ----------
  async function renderHome() {
    view.append(h('a',{class:'btn',href:'#/essays'},'写作练习'))
    view.append(h('div', {class:'filter-bar'}, [h('a',{class:'btn',href:'#/batch'},'批量上传'),h('a',{class:'btn',href:'#/review-ocr'},'待校对')]))
    view.appendChild(h('h1', { class: 'page-title' }, '今日任务'))
    const loading = h('div', { class: 'loading' }, '加载中…')
    view.appendChild(loading)
    const [today, recent] = await Promise.all([
      API.req('/api/today'),
      API.req('/api/questions?limit=5'),
    ]).finally(() => loading.remove())

    // 考试倒计时（日期在"更多"里设置，仅存本机）
    const examDate = localStorage.getItem('examDate')
    const act = today.activity
    const banner = h('div', { class: 'today-banner' }, [
      examDate ? h('div', { class: 'tb-count' }, [h('span', {}, '距离考试 '), h('strong', {}, String(Math.max(0, Math.ceil((new Date(examDate + 'T08:30:00+08:00') - Date.now()) / 86400000)))), h('span', {}, ' 天')]) : null,
      h('div', { class: 'tb-stats' }, [
        `今天已重做 ${act.today.redo} 题（对 ${act.today.correct}）· 公式卡 ${act.today.cards} 张`,
        act.streak ? ` · 连续学习 ${act.streak} 天 🔥` : '',
      ].join('')),
    ])
    view.appendChild(banner)

    const tasks = h('div', { class: 'task-list' })
    if (today.next_topic) {
      const nt = today.next_topic
      tasks.appendChild(taskCard('📘', '题型精讲', [`${nt.chapter} · `, mdInline(nt.name), `（已过关 ${today.topics_done}/${today.topics_total}）`], nt.status === 'new' ? '开始学' : '继续学', () => { location.hash = '#/topic/' + nt.id }))
    } else {
      tasks.appendChild(taskCard('📘', '题型精讲', `代数 ${today.topics_total} 个题型全部过关！`, '回顾', () => { location.hash = '#/topics' }, true))
    }
    tasks.appendChild(taskCard('🔁', '错题复习', today.review_due
      ? `${today.review_due} 道题到期，限时重做检验是否真的会了`
      : '今天没有到期的错题', today.review_due ? '开始复习' : null, () => { location.hash = '#/review' }, !today.review_due))
    const cardCount = today.cards_due + today.cards_new
    tasks.appendChild(taskCard('🧠', '公式卡', cardCount
      ? `${today.cards_due} 张到期 + ${today.cards_new} 张新卡（已学 ${today.cards_learned}/${today.cards_total}）`
      : `今天的公式卡已完成（已学 ${today.cards_learned}/${today.cards_total}）`, cardCount ? '开始背' : '浏览', () => { location.hash = cardCount ? '#/cards' : '#/cards/all' }, !cardCount))
    if (today.untidy) {
      tasks.appendChild(taskCard('🗂', '待整理', `${today.untidy} 道题只存了图片，补上答案和知识点后复习更有效`, '去整理', () => { location.hash = '#/list?untidy=1' }))
    }
    tasks.appendChild(taskCard('📸', '录错题', '做题时错了就拍照，可以先只存图，有空再整理', '拍照录题', () => { location.hash = '#/capture' }))
    view.appendChild(tasks)

    if (today.weak.length) {
      view.appendChild(h('div', { class: 'section-title' }, '需要加强的知识点'))
      const wl = h('div', { class: 'weak-list' })
      for (const w of today.weak) {
        wl.appendChild(h('a', { class: 'weak-item', href: '#/list?kp=' + encodeURIComponent(w.kp) }, [
          h('span', { class: 'wi-name' }, w.kp),
          h('span', { class: 'wi-module' }, w.module),
          h('span', { class: 'wi-num' }, `未掌握 ${w.unmastered}/${w.total}` + (w.last_wrong ? ` · 最近错 ${w.last_wrong}` : '')),
        ]))
      }
      view.appendChild(wl)
    }

    if (recent.items.length) {
      view.appendChild(h('div', { class: 'section-title' }, '最近录题'))
      view.appendChild(renderQuestionList(recent.items))
    }
  }

  function taskCard(icon, title, desc, actionLabel, onClick, done = false) {
    return h('div', { class: 'task-card' + (done ? ' done' : '') }, [
      h('div', { class: 'tc-icon' }, icon),
      h('div', { class: 'tc-body' }, [h('div', { class: 'tc-title' }, title), h('div', { class: 'tc-desc' }, desc)]),
      actionLabel ? h('button', { class: 'btn ' + (done ? '' : 'btn-primary'), onclick: onClick }, actionLabel) : h('span', { class: 'tc-done' }, '✓'),
    ])
  }

  // ---------- 题目列表组件 ----------
  function renderQuestionList(items) {
    if (!items.length) return h('div', { class: 'empty' }, [h('div', { class: 'em-icon' }, '📭'), h('div', { class: 'em-text' }, '暂无题目')])
    const wrap = h('div', { class: 'q-list' })
    for (const q of items) {
      wrap.appendChild(h('div', { class: 'q-item', onclick: () => { location.hash = '#/question/' + q.id } }, [
        h('div', { class: 'q-thumb' + (q.thumb_url ? '' : ' empty') }, q.thumb_url ? h('img', { src: q.thumb_url, alt: '' }) : '无图'),
        h('div', { class: 'q-body' }, [
          h('div', { class: 'q-title' }, (q.title || '(无标题)').replace(/\$/g, '')),
          h('div', { class: 'q-meta' }, [
            h('span', { class: 'badge badge-subject ' + (SUBJECTS.find((s) => s.key === q.subject)?.badge || '') }, subjectLabel(q.subject)),
            h('span', {}, typeLabel(q.question_type)),
            q.stem === '' ? h('span', { class: 'badge badge-warn' }, '待整理') : null,
            h('span', { class: 'badge ' + (MASTERY.find((m) => m.key === q.mastery)?.badge || '') }, MASTERY.find((m) => m.key === q.mastery)?.label || q.mastery),
            q.error_reason ? h('span', { class: 'badge badge-error' }, q.error_reason) : null,
            h('span', {}, new Date(q.created_at).toLocaleDateString('zh-CN')),
          ]),
          (q.knowledge_points || []).length ? h('div', { class: 'q-tags' }, q.knowledge_points.slice(0, 4).map((t) => h('span', { class: 'badge badge-tag' }, t))) : null,
        ]),
      ]))
    }
    return wrap
  }

  // ---------- 题目表单（录题与编辑共用） ----------
  function buildQuestionForm(init = {}) {
    const subjectSel = h('select', {}, SUBJECTS.map((s) => h('option', { value: s.key }, s.label)))
    subjectSel.value = init.subject || 'math'
    const typeSel = h('select', {})
    function refreshTypes() {
      typeSel.innerHTML = ''
      for (const t of TYPES[subjectSel.value] || []) typeSel.appendChild(h('option', { value: t.key }, t.label))
    }
    subjectSel.addEventListener('change', () => { refreshTypes(); refreshKp() })
    refreshTypes()
    if (init.question_type) typeSel.value = init.question_type
    let typeTouched = false
    typeSel.addEventListener('change', () => { typeTouched = true })

    // 答案：数学题用 A–E 按钮，其他用文本
    const correctInput = h('input', { type: 'text', placeholder: '如 A / 详见解析', value: init.correct_answer || '' })
    const userInput = h('input', { type: 'text', placeholder: '你当时选的答案', value: init.user_answer || '' })
    const letterPicker = (input) => h('div', { class: 'chip-row letter-row' }, LETTERS.map((L) => {
      const c = h('button', { type: 'button', class: 'chip letter' + (input.value.toUpperCase() === L ? ' active' : ''), onclick: () => {
        input.value = input.value.toUpperCase() === L ? '' : L
        $$('.chip', c.parentNode).forEach((x) => x.classList.toggle('active', x.textContent === input.value))
      } }, L)
      return c
    }))

    const sourceInput = h('input', { type: 'text', placeholder: '如 2024真题 / 模拟卷3', value: init.source || '' })
    const tagInput = h('input', { type: 'text', placeholder: '逗号分隔', value: (init.tags || []).join(',') })
    const errorNote = h('input', { type: 'text', placeholder: '具体错在哪一步（可选）', value: init.error_reason_note || '' })

    // 错因：单选 chip
    let errorReason = init.error_reason || ''
    const errorOpts = ERRORS.includes(errorReason) || !errorReason ? ERRORS : [...ERRORS, errorReason]
    const errorRow = h('div', { class: 'chip-row' }, errorOpts.map((e) => h('button', { type: 'button', class: 'chip' + (e === errorReason ? ' active' : ''), onclick: (ev) => {
      errorReason = errorReason === e ? '' : e
      $$('.chip', errorRow).forEach((x) => x.classList.toggle('active', x.textContent === errorReason))
      ev.preventDefault()
    } }, e)))

    // 知识点：数学按模块分组 chip 多选，另可补充自定义
    const selectedKp = new Set(init.knowledge_points || [])
    const suggestedKp = new Set() // AI 预选的知识点，高亮提示待确认
    const builtin = new Set(KNOWLEDGE.tree.flatMap((m) => m.points))
    const customInput = h('input', { type: 'text', placeholder: '其他知识点，逗号分隔', value: [...selectedKp].filter((k) => !builtin.has(k)).join(',') })
    const kpWrap = h('div', { class: 'kp-picker' })
    function refreshKp() {
      kpWrap.innerHTML = ''
      if (subjectSel.value !== 'math') return
      for (const m of KNOWLEDGE.tree) {
        kpWrap.appendChild(h('div', { class: 'kp-group' }, [
          h('span', { class: 'kp-module' }, m.module),
          h('div', { class: 'chip-row' }, m.points.map((p) => h('button', { type: 'button', class: 'chip' + (selectedKp.has(p) ? ' active' : '') + (suggestedKp.has(p) ? ' suggested' : ''), title: suggestedKp.has(p) ? 'AI 建议，请确认' : null, onclick: (ev) => {
            selectedKp.has(p) ? selectedKp.delete(p) : selectedKp.add(p)
            ev.currentTarget.classList.toggle('active', selectedKp.has(p))
          } }, p))),
        ]))
      }
    }
    refreshKp()

    const correctField = field('正确答案', h('div', {}, [letterPicker(correctInput), correctInput]))
    const userField = field('你的答案', h('div', {}, [letterPicker(userInput), userInput]))

    const suggestNote = h('div', { class: 'ai-suggest', hidden: '' })

    const el = h('div', { class: 'q-form' }, [
      suggestNote,
      h('div', { class: 'form-grid' }, [field('学科', subjectSel), field('题型', typeSel), correctField, userField]),
      field('知识点', h('div', {}, [kpWrap, customInput])),
      field('错因', errorRow),
      h('div', { class: 'form-grid' }, [field('错因备注', errorNote), field('来源', sourceInput), field('标签', tagInput)]),
    ])

    const split = (s) => s.split(/[,，]/).map((x) => x.trim()).filter(Boolean)
    function values() {
      const kps = subjectSel.value === 'math' ? [...selectedKp].filter((k) => builtin.has(k)) : []
      return {
        subject: subjectSel.value,
        question_type: typeSel.value,
        correct_answer: correctInput.value.trim(),
        user_answer: userInput.value.trim(),
        source: sourceInput.value.trim(),
        knowledge_points: [...new Set([...kps, ...split(customInput.value)])],
        error_reason: errorReason,
        error_reason_note: errorNote.value.trim(),
        tags: split(tagInput.value),
      }
    }
    // 应用 AI 预填建议：只动数学题；题型在用户未手动改过时才覆盖；
    // 知识点在用户还没选时才预选（已选则只高亮）；答案仅展示，不写入正确答案。
    function applySuggestion(s) {
      if (!s || subjectSel.value !== 'math') return
      const kps = (s.knowledge_points || []).filter((k) => builtin.has(k))
      const typeOk = TYPES.math.some((t) => t.key === s.question_type)
      if (!kps.length && !typeOk && !s.answer) return
      if (typeOk && !typeTouched) typeSel.value = s.question_type
      const preselect = selectedKp.size === 0
      suggestedKp.clear()
      for (const k of kps) {
        suggestedKp.add(k)
        if (preselect) selectedKp.add(k)
      }
      refreshKp()
      const parts = []
      if (typeOk) parts.push('题型「' + typeLabel(s.question_type) + '」')
      if (kps.length) parts.push('知识点「' + kps.join('、') + '」')
      suggestNote.innerHTML = ''
      suggestNote.appendChild(h('div', {}, '✨ AI 建议：' + (parts.join('，') || '无') + (kps.length ? '（已高亮' + (preselect ? '并预选' : '') + '，不对就点掉）' : '')))
      if (s.answer) suggestNote.appendChild(h('div', { class: 'dim' }, '可能的答案：' + s.answer + '（AI 推测，未核实，不会自动填入）'))
      suggestNote.hidden = false
    }

    return { el, values, subjectSel, typeSel, applySuggestion }
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

  // ---------- 录题 ----------
  async function renderCapture() {
    view.appendChild(h('h1', { class: 'page-title' }, '录题'))
    view.append(h('a',{class:'btn',href:'#/batch'},'多题批量上传'))
    const images = [] // { dataUri, mime }

    const card = h('div', { class: 'card' })
    const zone = h('div', { class: 'capture-zone', tabindex: '0' }, [
      h('div', { class: 'cz-icon' }, '📷'),
      h('div', {}, '点击选择 / 拖拽 / 粘贴图片（Ctrl/⌘+V）'),
      h('div', { class: 'cz-hint' }, '支持一题多图，用于跨页题目'),
    ])
    const fileInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/bmp', multiple: 'true', style: 'display:none' })
    // capture 属性直接调起系统相机
    const cameraInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', capture: 'environment', style: 'display:none' })
    const strip = h('div', { class: 'image-strip' })

    zone.addEventListener('click', () => fileInput.click())
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover') })
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'))
    zone.addEventListener('drop', (e) => {
      e.preventDefault(); zone.classList.remove('dragover')
      handleFiles(e.dataTransfer.files)
    })
    fileInput.addEventListener('change', () => { handleFiles(fileInput.files); fileInput.value = '' })
    cameraInput.addEventListener('change', () => { handleFiles(cameraInput.files); cameraInput.value = '' })

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
      ocrBtn.disabled = images.length === 0
      quickBtn.disabled = images.length === 0
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
        images[i].dataUri = c.toDataURL('image/png')
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
    card.appendChild(strip)

    // 快速收藏：只存图片，之后在"待整理"里补充
    const form = buildQuestionForm()
    const quickBtn = h('button', { class: 'btn', disabled: '', onclick: async () => {
      quickBtn.disabled = true
      try {
        const v = form.values()
        await API.req('/api/questions', { method: 'POST', body: { ...v, images: images.map((im) => im.dataUri) } })
        toast('已收藏，可在“待整理”里补充')
        images.length = 0
        renderStrip()
      } catch (err) {
        toast('保存失败：' + err.message)
        quickBtn.disabled = false
      }
    } }, '⚡ 只存图片，稍后整理')

    // OCR
    const ocrBtn = h('button', { class: 'btn btn-primary', onclick: doOcr, disabled: '' }, '🔍 识别题目')
    const ocrStatus = h('div', { class: 'ocr-status' })
    let ocrSeq = 0
    async function doOcr() {
      if (!images.length) return toast('请先添加图片')
      const seq = ++ocrSeq
      ocrBtn.disabled = true
      ocrStatus.textContent = images.length > 1 ? `识别中…（${images.length} 张）` : '识别中…'
      try {
        const result = await API.req('/api/ocr', {
          method: 'POST',
          body: { image: images.length === 1 ? images[0].dataUri : images.map((im) => im.dataUri) },
        })
        if (seq !== ocrSeq || !document.body.contains(stemField)) return // 已离开页面
        const md = result.markdown || ''
        stemField.value = md
        // 原始 OCR 单独保存到 stem_raw，不被校对稿覆盖
        stemField.dataset.ocrRaw = md
        updatePreview()
        ocrStatus.textContent = `识别完成，耗时 ${(result.elapsedMs / 1000).toFixed(1)}s，请对照原图校对`
        toast('识别完成，请校对')
        const blocks = splitQuestions(md)
        if (blocks.length > 1) showSplitPrompt(blocks, md)
        suggestMeta(md, seq)
      } catch (err) {
        ocrStatus.textContent = ''
        toast('识别失败：' + err.message)
      } finally {
        ocrBtn.disabled = images.length === 0
      }
    }
    // OCR 后让 AI 预填题型/知识点；未配置 Key 或失败时静默跳过，不影响录题
    async function suggestMeta(md, seq) {
      if (!KNOWLEDGE.suggest || !md.trim()) return
      try {
        const s = await API.req('/api/suggest', { method: 'POST', body: { stem: md } })
        if (seq !== ocrSeq || !document.body.contains(form.el)) return
        form.applySuggestion(s)
      } catch { /* 静默 */ }
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
      ocrStatus.appendChild(h('div', { style: 'margin-top:6px' }, [
        h('span', {}, `检测到 ${n} 道题 `),
        h('button', { class: 'btn btn-sm', onclick: async (e) => {
          if (!confirm(`按题号拆分为 ${n} 道题并一次性保存？\n图片共享，首行作为标题`)) return
          e.target.disabled = true
          try {
            const ids = []
            const v = form.values()
            for (let i = 0; i < blocks.length; i++) {
              const block = blocks[i]
              const title = block.split('\n')[0].replace(/^\s*\d+[.、)）]\s*/, '').slice(0, 50) || `题 ${i + 1}`
              const q = await API.req('/api/questions', { method: 'POST', body: {
                ...v, title, stem: block, stem_raw: rawMd, images: images.map((im) => im.dataUri),
              } })
              ids.push(q.id)
            }
            toast(`已创建 ${ids.length} 道题`)
            location.hash = '#/question/' + ids[0]
          } catch (err) { toast('拆分失败：' + err.message); e.target.disabled = false }
        } }, `✂️ 拆为 ${n} 道题`),
      ]))
    }
    card.appendChild(h('div', { class: 'capture-actions' }, [ocrBtn, quickBtn]))
    card.appendChild(ocrStatus)

    // 题干 + 公式预览
    const stemField = h('textarea', { class: 'stem-input', placeholder: '题干（OCR 识别后在此校对；公式可写 $x^2$）' })
    const preview = h('div', { class: 'stem-preview md-body' })
    let previewTimer = null
    function updatePreview() {
      preview.innerHTML = stemField.value ? renderMarkdown(stemField.value) : '<span class="dim">公式预览</span>'
    }
    stemField.addEventListener('input', () => { clearTimeout(previewTimer); previewTimer = setTimeout(updatePreview, 250) })
    updatePreview()
    card.appendChild(h('div', { class: 'field', style: 'margin-top:16px' }, [h('span', {}, '题干（校对后）'), stemField, preview]))

    card.appendChild(form.el)

    const saveBtn = h('button', { class: 'btn btn-primary btn-block', style: 'margin-top:16px', onclick: save }, '💾 保存到错题本')
    async function save() {
      const payload = {
        ...form.values(),
        stem: stemField.value,
        stem_raw: stemField.dataset.ocrRaw || stemField.value,
        images: images.map((im) => im.dataUri),
      }
      if (!payload.stem && !payload.images.length) return toast('题干和图片至少要有一项')
      saveBtn.disabled = true
      saveBtn.textContent = '保存中…'
      try {
        const q = await API.req('/api/questions', { method: 'POST', body: payload })
        toast('已保存，明天会出现在复习里')
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

    pasteHandler = (e) => {
      const files = [...(e.clipboardData?.items || [])].filter((it) => it.type.startsWith('image/')).map((it) => it.getAsFile()).filter(Boolean)
      if (files.length) handleFiles(files)
    }
    onLeave(() => { ocrSeq++ })
  }

  // ---------- 错题列表 ----------
  async function renderList(_, query) {
    view.appendChild(h('div', { class: 'page-head' }, [h('h1', { class: 'page-title' }, '错题本'), h('a', { class: 'btn btn-primary btn-sm', href: '#/capture' }, '📸 录题')]))
    const subjectSel = h('select', {}, [h('option', { value: '' }, '全部学科'), ...SUBJECTS.map((s) => h('option', { value: s.key }, s.label))])
    const masterySel = h('select', {}, [h('option', { value: '' }, '全部状态'), ...MASTERY.map((m) => h('option', { value: m.key }, m.label))])
    const kpSel = h('select', {}, [
      h('option', { value: '' }, '全部知识点'),
      ...KNOWLEDGE.tree.map((m) => h('optgroup', { label: m.module }, m.points.map((p) => h('option', { value: p }, p)))),
    ])
    const untidyBox = h('input', { type: 'checkbox' })
    const search = h('input', { type: 'search', placeholder: '搜索题干、知识点、标签、来源…' })
    kpSel.value = query.get('kp') || ''
    untidyBox.checked = query.get('untidy') === '1'
    const list = h('div', { class: 'q-list' })
    const loading = h('div', { class: 'loading' }, '加载中…')
    const countEl = h('div', { class: 'list-count' })

    view.appendChild(h('div', { class: 'filter-bar' }, [subjectSel, kpSel, masterySel, h('label', { class: 'check' }, [untidyBox, ' 只看待整理']), search]))
    view.appendChild(countEl)
    view.appendChild(loading)

    let timer = null
    let seq = 0
    async function load() {
      const my = ++seq
      loading.hidden = false
      list.innerHTML = ''
      const params = new URLSearchParams()
      if (subjectSel.value) params.set('subject', subjectSel.value)
      if (masterySel.value) params.set('mastery', masterySel.value)
      if (kpSel.value) params.set('kp', kpSel.value)
      if (untidyBox.checked) params.set('untidy', '1')
      if (search.value) params.set('q', search.value)
      try {
        const data = await API.req('/api/questions?' + params)
        if (my !== seq) return
        loading.hidden = true
        countEl.textContent = `共 ${data.total} 道`
        list.appendChild(data.items.length
          ? renderQuestionList(data.items)
          : h('div', { class: 'empty' }, [h('div', { class: 'em-icon' }, '📭'), h('div', { class: 'em-text' }, '没有符合条件的题目')]))
      } catch (err) {
        loading.hidden = true
        list.appendChild(h('div', { class: 'empty' }, '加载失败：' + err.message))
      }
    }
    ;[subjectSel, masterySel, kpSel, untidyBox].forEach((s) => s.addEventListener('change', load))
    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 350) })
    view.appendChild(list)
    load()
  }

  // ---------- 题目展示（图 + 题干） ----------
  function questionBody(q) {
    const layout = h('div', { class: 'qd-layout' })
    const imgCol = h('div', { class: 'qd-images' })
    if (q.images?.length) {
      q.images.forEach((im, i) => {
        const img = h('img', { src: im.access_url || ('/api/images/' + im.id), alt: '题图 ' + (i + 1) })
        if (im.rotation) img.style.transform = `rotate(${im.rotation}deg)`
        imgCol.appendChild(h('div', { class: 'qd-image' }, img))
      })
    } else {
      imgCol.appendChild(h('div', { class: 'empty' }, '本题无图片'))
    }
    const body = h('div', {}, [
      h('div', { class: 'section-title', style: 'margin-top:0' }, '题干'),
      q.stem || q.stem_raw
        ? h('div', { class: 'qd-stem' }, mdBlock(q.stem || q.stem_raw, 'q-stem-markdown md-body'))
        : h('div', { class: 'empty', style: 'padding:16px' }, '还没有题干文字，请看左侧原图（可点“编辑”补录）'),
    ])
    if (q.question_type === 'sufficient_condition') body.appendChild(suffLegend())
    layout.appendChild(imgCol)
    layout.appendChild(body)
    return { layout, body }
  }

  function suffLegend() {
    const opts = KNOWLEDGE.sufficiency_options || {}
    return h('details', { class: 'suff-legend' }, [
      h('summary', {}, '条件充分性判断 A–E 含义'),
      h('ul', {}, Object.entries(opts).map(([k, v]) => h('li', {}, [h('strong', {}, k + '：'), v]))),
    ])
  }

  // ---------- 条件充分性分步判断（重做与题型练习共用） ----------
  // 分三步判断，自动换算成选项；onSubmit(letter, steps) 收到选项和每一步的判断
  function suffSteps(onSubmit, extraActions = []) {
    const st = { s1: null, s2: null, joint: null }
    const box = h('div', { class: 'suff-steps' })
    const out = h('div', { class: 'suff-out' })
    const submit = h('button', { class: 'btn btn-primary', disabled: '', onclick: () => onSubmit(suffLetter(st), { ...st }) }, '提交')
    const step = (key, label) => h('div', { class: 'suff-step', 'data-key': key }, [
      h('div', { class: 'ss-label' }, label),
      h('div', { class: 'chip-row' }, [['充分', true], ['不充分', false]].map(([t, v]) => h('button', { type: 'button', class: 'chip', onclick: (e) => {
        st[key] = v
        $$('.chip', e.currentTarget.parentNode).forEach((x) => x.classList.toggle('active', x === e.currentTarget))
        refresh()
      } }, t))),
    ])
    const jointStep = step('joint', '③ 两个条件联合起来，能推出结论吗？')
    box.append(step('s1', '① 只用条件(1)，能推出结论吗？'), step('s2', '② 只用条件(2)，能推出结论吗？'), jointStep)
    function refresh() {
      const needJoint = st.s1 === false && st.s2 === false
      jointStep.hidden = !needJoint
      if (!needJoint) st.joint = null
      const letter = st.s1 !== null && st.s2 !== null ? suffLetter(st) : ''
      out.textContent = letter ? `你的判断对应选项：${letter}` : ''
      submit.disabled = !letter
    }
    refresh()
    return h('div', {}, [box, out, h('div', { class: 'redo-actions' }, [submit, ...extraActions])])
  }

  // 逐步对照：指出条件充分性判断错在哪一步
  function suffReview(correctLetter, detail) {
    const exp = SUFF_STEPS[String(correctLetter).toUpperCase()]
    if (!exp || !detail) return null
    const yn = (v) => (v ? '充分' : '不充分')
    const rows = [['条件(1)单独', 's1'], ['条件(2)单独', 's2'], ['联合', 'joint']]
      .filter(([, k]) => exp[k] !== undefined || detail[k] !== null)
      .map(([label, k]) => {
        const ok = exp[k] === detail[k]
        return h('li', { class: ok ? 'ok' : 'bad' }, `${ok ? '✓' : '✗'} ${label}：你判断${detail[k] === null ? '（未判断）' : yn(detail[k])}，应为${exp[k] === undefined ? '（无需判断）' : yn(exp[k])}`)
      })
    return h('ul', { class: 'suff-review' }, rows)
  }

  // ---------- 重做组件 ----------
  // 计时作答 → 判分 → 自动安排下次复习。onRevealed(result) 在提交后调用（用于显示讲解、下一题）。
  function buildRedo(q, { onStart, onRevealed, autoStart = false } = {}) {
    const wrap = h('div', { class: 'redo-box' })
    const isMath = q.subject === 'math'
    const letterMode = isMath || isLetterAnswer(q.correct_answer)
    let started = 0
    let tick = null
    const timerEl = h('span', { class: 'redo-timer' }, '0:00')

    function start() {
      started = Date.now()
      wrap.innerHTML = ''
      tick = setInterval(() => { timerEl.textContent = fmtDuration(Date.now() - started) }, 1000)
      onLeave(() => clearInterval(tick))
      onStart && onStart()
      wrap.appendChild(h('div', { class: 'redo-head' }, [h('span', {}, '⏱ 用时 '), timerEl, isMath ? h('span', { class: 'dim' }, '　考场节奏建议约 2–3 分钟/题') : null]))
      if (q.question_type === 'sufficient_condition') suffStepper()
      else if (letterMode) letterAnswer()
      else textAnswer()
    }

    function letterAnswer() {
      let picked = ''
      const submit = h('button', { class: 'btn btn-primary', disabled: '', onclick: () => finish(picked) }, '提交')
      const row = h('div', { class: 'chip-row letter-row big' }, LETTERS.map((L) => h('button', { type: 'button', class: 'chip letter', onclick: (e) => {
        picked = L
        $$('.chip', row).forEach((x) => x.classList.toggle('active', x === e.currentTarget))
        submit.disabled = false
      } }, L)))
      wrap.appendChild(row)
      wrap.appendChild(h('div', { class: 'redo-actions' }, [submit, giveUpBtn()]))
    }

    function textAnswer() {
      const input = h('input', { type: 'text', placeholder: '输入你的答案或要点', class: 'redo-text' })
      wrap.appendChild(h('div', { class: 'tutor-input' }, [input, h('button', { class: 'btn btn-primary', onclick: () => finish(input.value.trim()) }, '提交')]))
    }

    function suffStepper() {
      wrap.appendChild(suffSteps((letter, st) => finish(letter, st), [giveUpBtn()]))
    }

    function giveUpBtn() {
      return h('button', { class: 'btn btn-ghost', onclick: () => finish('', null, true) }, '不会做')
    }

    async function finish(answer, detail = null, gaveUp = false) {
      if (!gaveUp && !answer) return toast('请先作答')
      clearInterval(tick)
      const duration = Date.now() - started
      const correct = String(q.correct_answer || '').trim()
      let result
      if (gaveUp) result = 'wrong'
      else if (!correct) result = 'partial'
      else if (letterMode && isLetterAnswer(correct)) result = answer.toUpperCase() === correct.toUpperCase() ? 'correct' : 'wrong'
      else result = null // 非选择题：揭晓答案后自评
      wrap.innerHTML = ''
      if (result === null) return selfGrade(answer, duration)
      await submitResult(answer, result, duration, detail)
    }

    function selfGrade(answer, duration) {
      wrap.appendChild(h('div', { class: 'redo-answer' }, [h('div', { class: 'dim' }, '参考答案'), mdBlock(q.correct_answer)]))
      wrap.appendChild(h('div', { class: 'redo-actions' }, [
        h('button', { class: 'btn btn-primary', onclick: () => { wrap.innerHTML = ''; submitResult(answer, 'correct', duration) } }, '我做对了'),
        h('button', { class: 'btn', onclick: () => { wrap.innerHTML = ''; submitResult(answer, 'wrong', duration) } }, '没做对'),
      ]))
    }

    async function submitResult(answer, result, duration, detail) {
      let data
      try {
        data = await API.req('/api/questions/' + q.id + '/redo', { method: 'POST', body: { redoAnswer: answer, result, durationMs: duration, detail } })
      } catch (err) {
        toast(err.message)
        return
      }
      const label = result === 'correct' ? '✓ 做对了！' : result === 'partial' ? '◐ 该题没有记录正确答案，无法判对错（可点“编辑”补录）' : answer ? '✗ 这次没做对，没关系，明天再练一次' : '这题先看讲解，明天再来'
      wrap.appendChild(h('div', { class: 'redo-result ' + result }, label))
      const info = [`你的答案：${answer || '（未作答）'}`, `正确答案：${q.correct_answer || '（未记录）'}`, `用时 ${fmtDuration(duration)}`]
      wrap.appendChild(h('div', { class: 'redo-info' }, info.join('　·　')))
      const review = suffReview(q.correct_answer, detail)
      if (review) wrap.appendChild(review)
      wrap.appendChild(h('div', { class: 'redo-info dim' }, `下次复习：${fmtDay(data.review_due_at)}` + (data.mastery === 'mastered' ? '（已连续答对，标记为已掌握）' : '')))
      onRevealed && onRevealed(result)
    }

    if (autoStart) start()
    else {
      wrap.appendChild(h('div', { class: 'redo-cover' }, [
        h('div', {}, '不看答案和讲解，限时独立做一遍'),
        h('button', { class: 'btn btn-primary', style: 'margin-top:10px', onclick: start }, '▶ 开始重做'),
      ]))
    }
    return wrap
  }

  // ---------- AI 老师组件 ----------
  function buildTutor(q) {
    const wrap = h('div', { class: 'tutor-wrap' })
    const tutorBox = h('div', { class: 'tutor-box' })
    const tutorInput = h('textarea', { placeholder: '向老师追问，例如“第二步为什么这样设？”' })
    let hintCount = 0
    let alive = true
    onLeave(() => { alive = false })

    const hintBtn = h('button', { class: 'btn btn-primary btn-sm tutor-btn', onclick: () => callTutor('hint', '') }, '')
    const updateHintBtn = () => {
      hintBtn.textContent = hintCount >= 3 ? '💡 再给一次提示（第 3 级）' : `💡 给我提示（第 ${hintCount + 1}/3 级）`
    }
    updateHintBtn()

    const modeLabel = (m, lvl) => (m === 'hint' ? `提示${lvl ? ' · 第' + lvl + '级' : ''}` : m === 'explain' ? '完整讲解' : '讨论')
    function appendAi(role, md) {
      tutorBox.appendChild(h('div', { class: 'tutor-msg ai' }, [h('div', { class: 'msg-role' }, role), mdBlock(md)]))
    }

    ;(async () => {
      try {
        const hist = await API.req('/api/questions/' + q.id + '/tutor')
        if (!alive) return
        let lvl = 0
        for (const s of hist.items || []) {
          if (s.mode === 'hint') lvl = Math.min(lvl + 1, 3)
          if (s.user_prompt) tutorBox.appendChild(h('div', { class: 'tutor-msg user' }, [h('div', { class: 'msg-role' }, '你'), h('div', {}, s.user_prompt)]))
          appendAi(`${modeLabel(s.mode, s.mode === 'hint' ? lvl : 0)} · ${s.model || '?'}`, s.response_markdown || '')
        }
        hintCount = lvl
        updateHintBtn()
      } catch { /* 历史加载失败不阻塞 */ }
    })()

    let currentReqId = null
    async function callTutor(mode, prompt) {
      const reqId = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8)
      currentReqId = reqId
      const btns = $$('.tutor-btn', wrap)
      btns.forEach((b) => (b.disabled = true))
      if (prompt) tutorBox.appendChild(h('div', { class: 'tutor-msg user' }, [h('div', { class: 'msg-role' }, '你'), h('div', {}, prompt)]))
      const loadingMsg = h('div', { class: 'tutor-msg ai' }, [h('div', { class: 'msg-role' }, modeLabel(mode)), h('div', {}, [h('span', { class: 'spinner' }), ' 思考中…'])])
      tutorBox.appendChild(loadingMsg)
      try {
        const data = await API.req('/api/questions/' + q.id + '/tutor', {
          method: 'POST',
          body: { mode, requestId: reqId, prompt: prompt || '', useImage: true },
        })
        if (!alive || currentReqId !== reqId) return // 切换题目/离开页面，忽略旧响应
        loadingMsg.remove()
        if (mode === 'hint') { hintCount = data.hintLevel || hintCount + 1; updateHintBtn() }
        appendAi(`${modeLabel(mode, data.hintLevel)} · ${data.model}${data.imagesUsed ? ' · 看了原图' : ' · 仅文字'}`, data.markdown)
      } catch (err) {
        if (!alive) return
        loadingMsg.remove()
        tutorBox.appendChild(h('div', { class: 'tutor-msg ai' }, [h('div', { class: 'msg-role' }, '错误'), h('div', { style: 'color:var(--danger)' }, err.message)]))
      } finally {
        btns.forEach((b) => (b.disabled = false))
      }
    }

    wrap.appendChild(h('div', { class: 'tutor-actions' }, [
      hintBtn,
      h('button', { class: 'btn btn-sm tutor-btn', onclick: () => callTutor('explain', '') }, '📖 完整讲解'),
    ]))
    wrap.appendChild(h('div', { class: 'tutor-note dim' }, 'AI 讲解可能出错：与正确答案不一致时以答案为准，并追问它重新检查。'))
    wrap.appendChild(tutorBox)
    wrap.appendChild(h('div', { class: 'tutor-input' }, [
      tutorInput,
      h('button', { class: 'btn btn-sm tutor-btn', onclick: () => { const p = tutorInput.value.trim(); if (p) { callTutor('discuss', p); tutorInput.value = '' } } }, '继续讨论'),
    ]))
    return wrap
  }

  // ---------- 题目详情 ----------
  async function renderQuestion(id) {
    view.appendChild(h('div', { class: 'loading' }, '加载中…'))
    const q = await API.req('/api/questions/' + id)
    view.innerHTML = ''

    view.appendChild(h('div', { class: 'qd-head' }, [
      h('a', { href: '#/list', class: 'btn btn-sm' }, '← 返回列表'),
      h('span', { class: 'badge badge-subject ' + (SUBJECTS.find((s) => s.key === q.subject)?.badge || '') }, subjectLabel(q.subject)),
      h('span', { class: 'badge' }, typeLabel(q.question_type)),
      h('span', { class: 'badge ' + (MASTERY.find((m) => m.key === q.mastery)?.badge || '') }, MASTERY.find((m) => m.key === q.mastery)?.label || q.mastery),
      h('span', { class: 'dim', style: 'font-size:12px' }, `下次复习：${fmtDay(q.review_due_at)}`),
      h('button', { class: 'btn btn-sm', style: 'margin-left:auto', onclick: () => openEdit(q) }, '✏️ 编辑'),
    ]))

    const { layout, body } = questionBody(q)
    // 作答相关信息：重做时隐藏
    const meta = h('div', { class: 'hide-on-redo' })
    if (q.user_answer) meta.appendChild(h('p', { style: 'color:var(--danger)' }, '当时的答案：' + q.user_answer))
    if (q.error_reason) meta.appendChild(h('p', {}, [h('span', { class: 'badge badge-error' }, '错因：' + q.error_reason), q.error_reason_note ? ' ' + q.error_reason_note : '']))
    if (q.knowledge_points?.length) meta.appendChild(h('p', { class: 'dim' }, '知识点：' + q.knowledge_points.join('、')))
    if (q.source) meta.appendChild(h('p', { class: 'dim' }, '来源：' + q.source))
    if (q.tags?.length) meta.appendChild(h('div', { class: 'q-tags' }, q.tags.map((t) => h('span', { class: 'badge badge-tag' }, t))))
    body.appendChild(meta)
    view.appendChild(layout)

    view.appendChild(h('div', { class: 'section-title' }, '重做检验'))
    view.appendChild(buildRedo(q, {
      onStart: () => view.classList.add('redo-active'),
      onRevealed: () => view.classList.remove('redo-active'),
    }))
    onLeave(() => view.classList.remove('redo-active'))

    const tutorSection = h('div', { class: 'hide-on-redo' }, [h('div', { class: 'section-title' }, 'AI 老师'), buildTutor(q)])
    view.appendChild(tutorSection)

    // 重做历史
    const redos = await API.req('/api/questions/' + q.id + '/redo').catch(() => ({ items: [] }))
    if (redos.items.length) {
      view.appendChild(h('div', { class: 'section-title hide-on-redo' }, '作答记录'))
      view.appendChild(h('ul', { class: 'redo-history hide-on-redo' }, redos.items.slice(-10).reverse().map((r) => h('li', {}, [
        h('span', { class: 'badge ' + (r.result === 'correct' ? 'badge-mastery-mastered' : r.result === 'wrong' ? 'badge-error' : 'badge-tag') }, r.result === 'correct' ? '对' : r.result === 'wrong' ? '错' : '未判'),
        ` ${new Date(r.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}　答 ${r.redo_answer || '—'}　${r.duration_ms ? '用时 ' + fmtDuration(r.duration_ms) : ''}`,
      ]))))
    }

    // 手动调整复习
    const reviewSel = h('select', {}, [
      h('option', { value: '' }, '手动调整…'),
      h('option', { value: '0' }, '今天'),
      h('option', { value: '1' }, '明天'),
      h('option', { value: '3' }, '3天后'),
      h('option', { value: '7' }, '1周后'),
      h('option', { value: '-1' }, '不再复习'),
    ])
    reviewSel.addEventListener('change', async () => {
      if (reviewSel.value === '') return
      const days = Number(reviewSel.value)
      const d = new Date(); d.setHours(0, 0, 0, 0)
      const due = days < 0 ? 0 : d.getTime() + days * 86400000
      try {
        await API.req('/api/questions/' + q.id + '/review', { method: 'PATCH', body: { reviewDueAt: due } })
        toast(days < 0 ? '已移出复习' : `已安排${fmtDay(due)}复习`)
      } catch (e) { toast(e.message) }
    })
    view.appendChild(h('div', { class: 'qd-foot hide-on-redo' }, [h('span', {}, '复习安排：'), reviewSel,
      h('button', { class: 'btn btn-danger btn-sm', style: 'margin-left:auto', onclick: async () => {
        if (!confirm('确认删除此题？含图片与讲解将一并删除，不可恢复。')) return
        try { await API.req('/api/questions/' + q.id, { method: 'DELETE' }); toast('已删除'); location.hash = '#/list' } catch (e) { toast(e.message) }
      } }, '🗑 删除此题'),
    ]))
  }

  // ---------- 编辑弹窗 ----------
  function openEdit(q) {
    const root = $('#modal-root')
    const stemField = h('textarea', { class: 'stem-input', placeholder: '题干（公式可写 $x^2$）' })
    stemField.value = q.stem || ''
    const preview = h('div', { class: 'stem-preview md-body' })
    const upd = () => { preview.innerHTML = stemField.value ? renderMarkdown(stemField.value) : '<span class="dim">公式预览</span>' }
    stemField.addEventListener('input', upd)
    upd()
    const form = buildQuestionForm(q)
    const close = () => { root.innerHTML = '' }
    const saveBtn = h('button', { class: 'btn btn-primary', onclick: async () => {
      saveBtn.disabled = true
      try {
        await API.req('/api/questions/' + q.id, { method: 'PATCH', body: { ...form.values(), stem: stemField.value } })
        close()
        toast('已保存')
        router()
      } catch (e) { toast(e.message); saveBtn.disabled = false }
    } }, '保存')
    root.appendChild(h('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === e.currentTarget) close() } }, h('div', { class: 'modal modal-wide' }, [
      h('div', { class: 'modal-head' }, ['编辑题目', h('button', { class: 'btn btn-ghost btn-sm', onclick: close }, '✕')]),
      h('div', { class: 'modal-body' }, [
        field('题干', h('div', {}, [stemField, preview])),
        q.stem_raw && q.stem_raw !== q.stem ? h('details', { class: 'raw-ocr' }, [h('summary', {}, '查看原始 OCR 结果'), h('pre', {}, q.stem_raw)]) : null,
        form.el,
      ]),
      h('div', { class: 'modal-foot' }, [h('button', { class: 'btn', onclick: close }, '取消'), saveBtn]),
    ])))
    onLeave(close)
  }

  // ---------- 复习会话：逐题限时重做 ----------
  async function renderSession() {
    view.appendChild(h('h1', { class: 'page-title' }, '错题复习'))
    const loading = h('div', { class: 'loading' }, '加载中…')
    view.appendChild(loading)
    const data = await API.req('/api/review').finally(() => loading.remove())
    const queue = data.items.map((q) => q.id)
    if (!queue.length) {
      view.appendChild(h('div', { class: 'empty' }, [h('div', { class: 'em-icon' }, '🎉'), h('div', { class: 'em-text' }, '今天没有到期的错题'), h('a', { class: 'btn', style: 'margin-top:12px', href: '#/cards' }, '去背公式卡')]))
      return
    }
    const stats = { done: 0, correct: 0 }
    const progress = h('div', { class: 'session-progress' })
    const stage = h('div')
    view.append(progress, stage)
    let alive = true
    onLeave(() => { alive = false })

    async function show(i) {
      progress.textContent = `第 ${i + 1} / ${queue.length} 题　·　已对 ${stats.correct}`
      stage.innerHTML = ''
      stage.appendChild(h('div', { class: 'loading' }, '加载中…'))
      const q = await API.req('/api/questions/' + queue[i])
      if (!alive) return
      stage.innerHTML = ''
      stage.appendChild(h('div', { class: 'qd-head' }, [
        h('span', { class: 'badge' }, typeLabel(q.question_type)),
        ...(q.knowledge_points || []).slice(0, 3).map((k) => h('span', { class: 'badge badge-tag' }, k)),
      ]))
      stage.appendChild(questionBody(q).layout)
      const after = h('div')
      stage.appendChild(buildRedo(q, {
        autoStart: true,
        onRevealed: (result) => {
          stats.done++
          if (result === 'correct') stats.correct++
          progress.textContent = `第 ${i + 1} / ${queue.length} 题　·　已对 ${stats.correct}`
          const next = i + 1 < queue.length
          after.appendChild(h('div', { class: 'session-next' }, [
            h('button', { class: 'btn btn-primary', onclick: () => (next ? show(i + 1) : finish()) }, next ? '下一题 →' : '完成'),
            h('a', { class: 'btn', href: '#/question/' + q.id }, '打开详情'),
          ]))
          if (result !== 'correct') {
            const t = h('details', { class: 'session-tutor', open: result === 'wrong' ? '' : null }, [h('summary', {}, '看 AI 提示 / 讲解'), buildTutor(q)])
            after.appendChild(t)
          }
        },
      }))
      stage.appendChild(after)
    }
    function finish() {
      progress.textContent = ''
      stage.innerHTML = ''
      stage.appendChild(h('div', { class: 'empty' }, [
        h('div', { class: 'em-icon' }, '🎉'),
        h('div', { class: 'em-text' }, `今天的错题复习完成：${stats.done} 题，做对 ${stats.correct} 题`),
        h('div', { class: 'dim', style: 'margin-top:6px' }, '做错的题明天还会出现，做对的会隔几天再来检验'),
        h('a', { class: 'btn btn-primary', style: 'margin-top:14px', href: '#/home' }, '回到今日任务'),
      ]))
    }
    show(0)
  }

  // ---------- 公式卡 ----------
  async function renderCards(param) {
    if (param === 'all') return renderAllCards()
    view.appendChild(h('div', { class: 'page-head' }, [h('h1', { class: 'page-title' }, '公式卡'), h('a', { class: 'btn btn-sm', href: '#/cards/all' }, '浏览全部')]))
    const loading = h('div', { class: 'loading' }, '加载中…')
    view.appendChild(loading)
    const data = await API.req('/api/cards').finally(() => loading.remove())
    const queue = [...data.items]
    if (!queue.length) {
      view.appendChild(h('div', { class: 'empty' }, [h('div', { class: 'em-icon' }, '✅'), h('div', { class: 'em-text' }, '今天的公式卡都背完了'), h('a', { class: 'btn', style: 'margin-top:12px', href: '#/cards/all' }, '浏览全部卡片')]))
      return
    }
    let done = 0
    const total = queue.length
    const progress = h('div', { class: 'session-progress' })
    const stage = h('div')
    view.append(progress, stage)

    function show() {
      progress.textContent = `已完成 ${done} / ${total}`
      stage.innerHTML = ''
      if (!queue.length) {
        stage.appendChild(h('div', { class: 'empty' }, [h('div', { class: 'em-icon' }, '🎉'), h('div', { class: 'em-text' }, `今天的 ${total} 张公式卡完成了`), h('a', { class: 'btn btn-primary', style: 'margin-top:14px', href: '#/home' }, '回到今日任务')]))
        return
      }
      const c = queue[0]
      const back = h('div', { class: 'fc-back', hidden: '' }, mdBlock(c.back))
      const grades = h('div', { class: 'fc-grades', hidden: '' }, [
        gradeBtn('忘了', 'again', 'btn'),
        gradeBtn('模糊', 'fuzzy', 'btn'),
        gradeBtn('记得', 'good', 'btn btn-primary'),
      ])
      const reveal = h('button', { class: 'btn btn-primary btn-block', onclick: () => { back.hidden = false; grades.hidden = false; reveal.remove() } }, '想好了，看答案')
      stage.appendChild(h('div', { class: 'flashcard' }, [
        h('div', { class: 'fc-meta' }, [h('span', { class: 'badge badge-math' }, c.module), c.kp ? h('span', { class: 'badge badge-tag' }, c.kp) : null, c.is_new ? h('span', { class: 'badge badge-warn' }, '新卡') : null]),
        mdBlock(c.front, 'fc-front md-body'),
        back,
      ]))
      stage.appendChild(reveal)
      stage.appendChild(grades)

      function gradeBtn(label, grade, cls) {
        return h('button', { class: cls, onclick: async (e) => {
          e.currentTarget.disabled = true
          try {
            await API.req('/api/cards/' + encodeURIComponent(c.key) + '/grade', { method: 'POST', body: { grade } })
          } catch (err) { toast(err.message); e.currentTarget.disabled = false; return }
          queue.shift()
          // 忘了的卡放到队尾，本轮再见一次
          if (grade === 'again') queue.push({ ...c, is_new: false })
          else done++
          show()
        } }, label)
      }
    }
    show()
  }

  async function renderAllCards() {
    view.appendChild(h('div', { class: 'page-head' }, [h('h1', { class: 'page-title' }, '全部公式卡'), h('a', { class: 'btn btn-sm', href: '#/cards' }, '去背今天的卡')]))
    const data = await API.req('/api/cards?all=1')
    const groups = {}
    for (const c of data.items) (groups[c.module] ||= []).push(c)
    for (const [mod, cards] of Object.entries(groups)) {
      view.appendChild(h('div', { class: 'section-title' }, `${mod}（${cards.length}）`))
      const list = h('div', { class: 'card-browse' })
      for (const c of cards) {
        list.appendChild(h('details', { class: 'cb-item' }, [
          h('summary', {}, [mdBlock(c.front, 'cb-front md-body'), h('span', { class: 'cb-stage dim' }, c.is_new ? '未学' : `阶段 ${c.stage} · ${fmtDay(c.due_at)}`)]),
          mdBlock(c.back),
        ]))
      }
      view.appendChild(list)
    }
  }

  // ---------- 题型精讲 ----------
  const renderInline = (md) => renderMarkdown(md).replace(/^\s*<p>/, '').replace(/<\/p>\s*$/, '')
  const mdInline = (md, cls = '') => h('span', { class: cls, html: renderInline(md) })
  const stars = (n) => h('span', { class: 'freq', title: '考频' }, '★'.repeat(n) + '☆'.repeat(3 - n))
  const TOPIC_STATUS = {
    new: { label: '未学', cls: 'st-new' },
    viewed: { label: '看过', cls: 'st-viewed' },
    practicing: { label: '练习中', cls: 'st-practicing' },
    done: { label: '已过关', cls: 'st-done' },
  }
  const LEVELS = { 1: ['基础', 'lv-1'], 2: ['真题难度', 'lv-2'], 3: ['拔高', 'lv-3'] }
  const levelBadge = (l) => (LEVELS[l] ? h('span', { class: 'level-badge ' + LEVELS[l][1] }, LEVELS[l][0]) : null)
  const statusBadge = (t) => h('span', { class: 'topic-status ' + TOPIC_STATUS[t.status].cls }, t.status === 'practicing' ? `练习 ${t.correct}/${t.total}` : TOPIC_STATUS[t.status].label)

  async function renderTopics() {
    view.appendChild(h('h1', { class: 'page-title' }, '题型精讲'))
    const loading = h('div', { class: 'loading' }, '加载中…')
    view.appendChild(loading)
    const data = await API.req('/api/topics').finally(() => loading.remove())
    const all = data.modules.flatMap((m) => m.chapters.flatMap((c) => c.topics))
    const doneCount = all.filter((t) => t.status === 'done').length
    const next = all.find((t) => t.id === data.next_id)

    view.appendChild(h('div', { class: 'topic-summary' }, [
      h('div', {}, [h('strong', {}, `${doneCount} / ${all.length}`), ' 个题型已过关']),
      next ? h('a', { class: 'btn btn-primary', href: '#/topic/' + next.id }, ['继续学习：', mdInline(next.name)]) : null,
    ]))

    // "卡住了"：按题目里的关键词找题型
    const search = h('input', { type: 'search', class: 'topic-search', placeholder: '卡住了？输入题目里的关键词，如：绝对值 最小值 / 两根 / 恒成立' })
    const hint = h('div', { class: 'dim topic-search-hint' }, '每个题型都列了"识别信号"，输入题目里出现的词，帮你找到该往哪里想。')
    view.append(search, hint)

    const list = h('div')
    view.appendChild(list)
    const plain = (s) => String(s).replace(/\\[a-z]+/gi, '').replace(/[${}]/g, '')
    function draw() {
      const words = search.value.trim().split(/\s+/).filter(Boolean)
      const match = (t) => !words.length || words.every((w) => plain([t.name, t.think, t.kp, ...t.signals].join(' ')).includes(w))
      list.innerHTML = ''
      let shown = 0
      for (const m of data.modules) {
        for (const c of m.chapters) {
          const topics = c.topics.filter(match)
          if (!topics.length) continue
          shown += topics.length
          const cDone = c.topics.filter((t) => t.status === 'done').length
          list.appendChild(h('div', { class: 'section-title chapter-title' }, [`${c.name}`, h('span', { class: 'dim' }, `　${cDone}/${c.topics.length}`)]))
          if (!words.length) list.appendChild(h('div', { class: 'chapter-intro dim' }, c.intro))
          const box = h('div', { class: 'topic-list' })
          for (const t of topics) {
            box.appendChild(h('a', { class: 'topic-row' + (t.id === data.next_id ? ' is-next' : ''), href: '#/topic/' + t.id }, [
              h('div', { class: 'tr-head' }, [mdInline(t.name, 'tr-name'), stars(t.freq), statusBadge(t)]),
              h('div', { class: 'tr-think' }, mdInline(t.think)),
              words.length ? h('div', { class: 'tr-signals dim' }, ['识别信号：', mdInline(t.signals.join('；'))]) : null,
            ]))
          }
          list.appendChild(box)
        }
      }
      if (!shown) list.appendChild(h('div', { class: 'empty' }, [h('div', { class: 'em-text' }, '没找到匹配的题型，换个关键词试试（比如只输入"绝对值"）')]))
    }
    let timer = null
    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(draw, 200) })
    draw()
  }

  async function renderTopic(id) {
    view.appendChild(h('div', { class: 'loading' }, '加载中…'))
    const t = await API.req('/api/topics/' + encodeURIComponent(id))
    view.innerHTML = ''

    view.appendChild(h('div', { class: 'qd-head' }, [
      h('a', { href: '#/topics', class: 'btn btn-sm' }, '← 题型地图'),
      h('span', { class: 'badge badge-math' }, `${t.module} · ${t.chapter}`),
      stars(t.freq),
      statusBadge(t.progress),
    ]))
    view.appendChild(h('h1', { class: 'page-title topic-title' }, mdInline(t.name)))

    // 核心一句话 + 思考路线（遇到题时按顺序问自己）
    view.appendChild(h('div', { class: 'think-box' }, [h('div', { class: 'tb-label' }, '💡 一句话抓住它'), mdBlock(t.think, 'md-body tb-text')]))

    const sec = (title, body, cls = '') => h('section', { class: 'topic-sec ' + cls }, [h('h2', {}, title), body])
    view.appendChild(sec('🧭 思考路线：拿到题按顺序问自己', h('ol', { class: 'route-list' }, t.route.map((s) => h('li', {}, [
      h('div', { class: 'route-q' }, mdInline(s.q)),
      mdBlock(s.a, 'md-body route-a'),
    ])))))
    view.appendChild(sec('🧰 要套的公式和结论', h('ul', { class: 'tool-list' }, t.tools.map((s) => h('li', {}, mdInline(s))))))
    view.appendChild(sec('👀 看到这些，就是这个题型', h('ul', { class: 'signal-list' }, t.signals.map((s) => h('li', {}, mdInline(s))))))
    view.appendChild(h('div', { class: 'topic-two' }, [
      sec('⚡ 秒杀技巧', h('ul', {}, t.tricks.map((s) => h('li', {}, mdInline(s))))),
      sec('⚠️ 易错点', h('ul', { class: 'trap-list' }, t.traps.map((s) => h('li', {}, mdInline(s))))),
    ]))

    // 例题：先自己想，再看"思路是怎么来的"，最后看完整解答
    const exWrap = h('div', { class: 'practice-list' })
    t.examples.forEach((ex, i) => {
      const body = h('div', { class: 'ex-solution', hidden: '' }, [
        h('div', { class: 'ex-think-label' }, '🧠 思路拆解'),
        h('ol', { class: 'ex-think' }, ex.think.map((s) => h('li', {}, mdInline(s)))),
        h('div', { class: 'ex-answer' }, `答案：${ex.answer}`),
        mdBlock(ex.solution),
        ex.fast ? h('div', { class: 'ex-fast' }, [h('strong', {}, '⚡ 秒杀：'), mdInline(ex.fast)]) : null,
      ])
      const btn = h('button', { class: 'btn', onclick: () => { body.hidden = false; btn.remove() } }, '先自己想 2 分钟，再看思路')
      exWrap.appendChild(h('div', { class: 'problem-card' }, [
        h('div', { class: 'pc-head' }, [h('span', {}, `例题 ${i + 1}`), levelBadge(ex.level)]),
        problemStem(ex),
        btn,
        body,
      ]))
    })
    view.appendChild(sec('📖 例题：看思路是怎么来的', exWrap))

    // 练一练：由易到难
    const counts = [1, 2, 3].map((l) => t.practice.filter((p) => p.level === l).length)
    const practiceWrap = h('div', { class: 'practice-list' })
    t.practice.forEach((item, i) => practiceWrap.appendChild(buildTopicPractice(t, item, i, t.progress.items[i])))
    view.appendChild(sec('✍️ 练一练', h('div', {}, [
      h('div', { class: 'dim practice-note' }, `共 ${t.practice.length} 道：基础 ${counts[0]} · 真题难度 ${counts[1]} · 拔高 ${counts[2]}。做对至少 ${t.practice.length - 1} 道算过关。卡住了先点"给点思路"，别急着看答案。`),
      practiceWrap,
    ])))

    view.appendChild(h('div', { class: 'topic-nav' }, [
      t.prev_id ? h('a', { class: 'btn', href: '#/topic/' + t.prev_id }, '← 上一个题型') : h('span'),
      t.next_id ? h('a', { class: 'btn btn-primary', href: '#/topic/' + t.next_id }, '下一个题型 →') : h('a', { class: 'btn', href: '#/topics' }, '回到题型地图'),
    ]))
  }

  // 题干 + 选项（问题求解列出 A–E；条件充分性附选项含义）
  function problemStem(item) {
    const wrap = h('div', {}, [
      h('div', { class: 'pc-type' }, item.type === 'sc' ? '条件充分性判断' : '问题求解'),
      mdBlock(item.stem, 'md-body pc-stem'),
    ])
    if (item.type === 'ps') {
      wrap.appendChild(h('div', { class: 'pc-options' }, item.options.map((o, i) => h('div', { class: 'pc-opt' }, [h('strong', {}, LETTERS[i] + '. '), mdInline(o)]))))
    } else {
      wrap.appendChild(suffLegend())
    }
    return wrap
  }

  function buildTopicPractice(topic, item, index, lastCorrect) {
    const card = h('div', { class: 'problem-card' })
    const started = Date.now()
    card.appendChild(h('div', { class: 'pc-head' }, [
      h('span', {}, `练习 ${index + 1}`),
      levelBadge(item.level),
      lastCorrect === undefined ? null : h('span', { class: 'badge ' + (lastCorrect ? 'badge-mastery-mastered' : 'badge-error') }, lastCorrect ? '上次做对' : '上次做错'),
    ]))
    card.appendChild(problemStem(item))
    const hintBox = h('div', { class: 'pc-hint', hidden: '' }, [h('strong', {}, '💡 思路：'), mdInline(item.hint)])
    const hintBtn = h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { hintBox.hidden = false; hintBtn.remove() } }, '💡 给点思路')
    card.append(hintBtn, hintBox)
    const area = h('div', { class: 'pc-answer' })
    card.appendChild(area)

    async function submit(letter, detail) {
      let res
      try {
        res = await API.req(`/api/topics/${topic.id}/practice`, { method: 'POST', body: { index, answer: letter, durationMs: Date.now() - started } })
      } catch (err) { toast(err.message); return }
      area.innerHTML = ''
      area.appendChild(h('div', { class: 'redo-result ' + (res.correct ? 'correct' : 'wrong') }, res.correct ? `✓ 对了！答案 ${res.answer}` : `✗ 你选了 ${letter || '（未作答）'}，正确答案是 ${res.answer}`))
      const review = item.type === 'sc' ? suffReview(res.answer, detail) : null
      if (review) area.appendChild(review)
      area.appendChild(h('div', { class: 'ex-solution' }, mdBlock(res.solution)))
      const actions = h('div', { class: 'redo-actions' }, [
        h('button', { class: 'btn btn-sm', onclick: () => { area.innerHTML = ''; drawInput() } }, '再做一次'),
      ])
      if (!res.correct) {
        const addBtn = h('button', { class: 'btn btn-sm btn-primary', onclick: async () => {
          addBtn.disabled = true
          try {
            await API.req(`/api/topics/${topic.id}/wrongbook`, { method: 'POST', body: { index, answer: letter } })
            addBtn.textContent = '✓ 已加入错题本，明天复习'
          } catch (err) { toast(err.message); addBtn.disabled = false }
        } }, '加入错题本')
        actions.prepend(addBtn)
      }
      area.appendChild(actions)
    }

    function drawInput() {
      if (item.type === 'sc') {
        area.appendChild(suffSteps((letter, st) => submit(letter, st)))
        return
      }
      let picked = ''
      const btn = h('button', { class: 'btn btn-primary', disabled: '', onclick: () => submit(picked) }, '提交')
      const row = h('div', { class: 'chip-row letter-row big' }, LETTERS.map((L) => h('button', { type: 'button', class: 'chip letter', onclick: (e) => {
        picked = L
        $$('.chip', row).forEach((x) => x.classList.toggle('active', x === e.currentTarget))
        btn.disabled = false
      } }, L)))
      area.append(row, h('div', { class: 'redo-actions' }, [btn]))
    }
    drawInput()
    return card
  }

  // ---------- 更多（导入导出/设置） ----------
  async function renderMore() {
    view.append(h('a',{class:'btn',href:'#/essay-tokens'},'管理代理令牌'))
    view.appendChild(h('h1', { class: 'page-title' }, '更多'))

    const settings = h('div', { class: 'card' })
    settings.appendChild(h('div', { class: 'section-title', style: 'margin-top:0' }, '考试日期'))
    const dateInput = h('input', { type: 'date', value: localStorage.getItem('examDate') || '' })
    dateInput.addEventListener('change', () => {
      if (dateInput.value) localStorage.setItem('examDate', dateInput.value)
      else localStorage.removeItem('examDate')
      toast('已保存，首页会显示倒计时')
    })
    settings.appendChild(h('div', { class: 'filter-bar' }, [dateInput, h('span', { class: 'dim' }, '以准考证上的时间为准，只保存在本机')]))
    view.appendChild(settings)

    const card = h('div', { class: 'card', style: 'margin-top:16px' })
    card.appendChild(h('div', { class: 'section-title', style: 'margin-top:0' }, '数据'))
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
        (() => {
          const inp = h('input', { type: 'file', accept: '.json', style: 'display:none' })
          inp.addEventListener('change', async () => {
            const f = inp.files[0]; if (!f) return
            try { const json = JSON.parse(await f.text()); const r = await API.req('/api/import', { method: 'POST', body: json }); toast(`已导入 ${r.imported} 题`) } catch (e) { toast(e.message) }
          })
          return inp
        })(),
      ]),
    ]))
    view.appendChild(card)

    const info = h('div', { class: 'card', style: 'margin-top:16px' })
    info.appendChild(h('div', { class: 'section-title', style: 'margin-top:0' }, '关于 199 管理类联考综合能力'))
    info.appendChild(h('div', { html: '<p>满分 200 分 / 180 分钟。数学 75 分（问题求解 15 题 + 条件充分性判断 10 题，每题 3 分）；逻辑 60 分（30 题，每题 2 分）；写作 65 分（论证有效性分析 30 分 + 论说文 35 分）。</p><p class="dim" style="font-size:13px">以当年官方大纲为准，详见 docs/EXAM-199-INFO.md</p>' }))
    view.appendChild(info)
  }


  // ---------- 批量上传与校对 ----------
  let batchOwner = 0
  function draftDB() {
    return new Promise((resolve,reject)=>{
      const r=indexedDB.open('learnplat-batch',1)
      r.onupgradeneeded=()=>r.result.createObjectStore('drafts')
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)
    })
  }
  async function draftStorage(value) {
    const db=await draftDB()
    try{return await new Promise((resolve,reject)=>{
      const tx=db.transaction('drafts',value===undefined?'readonly':'readwrite'), s=tx.objectStore('drafts')
      const r=value===undefined?s.get(batchOwner):s.put(value,batchOwner)
      tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error)
    })}finally{db.close()}
  }
  async function preprocessImage(file) {
    if(!file.type.startsWith('image/'))throw new Error('请选择图片')
    // 浏览器解码阶段应用 EXIF 方向，不再重复旋转。
    const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'})
    try{
      const scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height))
      const c=document.createElement('canvas');c.width=Math.max(1,Math.round(bitmap.width*scale));c.height=Math.max(1,Math.round(bitmap.height*scale))
      c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height)
      const blob=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',0.85))
      if(!blob)throw new Error('图片压缩失败')
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('')
      return {dataUri:await fileToDataUri(blob),hash}
    }finally{bitmap.close()}
  }
  async function renderBatch() {
    let draft=await draftStorage()||{batch:crypto.randomUUID(),groups:[],subject:'math',source:'',tags:''}
    let busy=false, preparing=false, gone=false
    onLeave(()=>{gone=true})
    const box=h('div'),grid=h('div',{class:'batch-grid'}),status=h('p',{role:'status'})
    const subject=h('select',{},SUBJECTS.map(s=>h('option',{value:s.key},s.label)));subject.value=draft.subject
    const source=h('input',{placeholder:'来源，例如 2024 真题',value:draft.source})
    const tags=h('input',{placeholder:'标签，用逗号分隔',value:draft.tags})
    const picker=h('input',{type:'file',accept:'image/*',multiple:true})
    const save=async()=>{draft.subject=subject.value;draft.source=source.value;draft.tags=tags.value;await draftStorage(draft)}
    const draw=()=>{
      grid.replaceChildren()
      draft.groups.forEach((g,i)=>{
        const controls=h('div',{class:'filter-bar'})
        const button=(label,action)=>h('button',{class:'btn btn-sm',disabled:busy||g.qid,onclick:async()=>{action();await save();draw()}},label)
        controls.append(button('删除',()=>draft.groups.splice(i,1)),button('上移',()=>{if(i&&!draft.groups[i-1].qid)[draft.groups[i-1],draft.groups[i]]=[g,draft.groups[i-1]]}),
          button('合并下一题',()=>{const n=draft.groups[i+1];if(n&&!n.qid&&g.images.length+n.images.length<=20){g.images.push(...n.images);draft.groups.splice(i+1,1)}}))
        grid.append(h('div',{class:'card'},[h('strong',{},'第 '+(i+1)+' 题 · '+g.images.length+' 张'),
          ...g.images.map(im=>h('img',{src:im.dataUri,alt:'待上传题图',class:'batch-thumb'})),controls,
          h('p',{class:g.error?'error':'dim'},g.error|| (g.done?'已上传并入队':g.qid?'已建题，可续传':'待上传'))]))
      })
      status.textContent='共 '+draft.groups.length+' 题，预计 OCR '+draft.groups.reduce((n,g)=>n+g.images.length,0)+' 次；重试可能增加调用次数。'
    }
    async function add(files){
      if(busy||preparing)return
      preparing=true;picker.disabled=true
      try{
        for(const f of files){
          if(draft.groups.length>=100)throw new Error('每批最多100题')
          const im=await preprocessImage(f)
          const known=draft.groups.some(g=>g.images.some(x=>x.hash===im.hash))
          const remote=await API.req('/api/batch/duplicates',{method:'POST',body:{hashes:[im.hash]}})
          if((known||remote.hashes.length)&&!confirm('这张图片已上传或已选中，仍然添加？'))continue
          draft.groups.push({key:crypto.randomUUID(),images:[im]});await save();draw()
        }
      }catch(e){toast(e.message)}finally{preparing=false;picker.disabled=false}
    }
    picker.onchange=()=>{add([...picker.files]);picker.value=''}
    const zone=h('div',{class:'capture-zone',ondragover:e=>e.preventDefault(),ondrop:e=>{e.preventDefault();add([...e.dataTransfer.files])}},['选择、拖拽或粘贴多张图片',picker])
    pasteHandler=e=>{const fs=[...e.clipboardData.files];if(fs.length){e.preventDefault();add(fs)}}
    const upload=h('button',{class:'btn btn-primary',onclick:async()=>{
      if(busy||preparing)return
      busy=true;upload.disabled=true;picker.disabled=true;subject.disabled=true;source.disabled=true;tags.disabled=true
      await save();draw()
      const unload=e=>{e.preventDefault();e.returnValue='图片尚在上传'}
      window.addEventListener('beforeunload',unload)
      let cursor=0
      const worker=async()=>{while(cursor<draft.groups.length){
        const g=draft.groups[cursor++];if(g.done)continue
        try{
          g.error=''
          if(!g.qid){const q=await API.req('/api/batch/questions',{method:'POST',body:{request_id:g.key,batch:draft.batch,count:g.images.length,subject:draft.subject,source:draft.source,tags:draft.tags.split(/[,，]/).map(s=>s.trim()).filter(Boolean)}});g.qid=q.question_id;await save()}
          for(let i=0;i<g.images.length;i++)await API.req('/api/batch/questions/'+g.qid+'/images',{method:'POST',body:{position:i,image:g.images[i].dataUri}})
          const j=await API.req('/api/questions/'+g.qid+'/ocr',{method:'POST',body:{}})
          g.done=true;g.job=j.id
        }catch(e){g.error=e.message}
        await save();if(!gone)draw()
      }}
      try{await Promise.all([worker(),worker(),worker()])}
      finally{busy=false;window.removeEventListener('beforeunload',unload);upload.disabled=false;picker.disabled=false;if(!gone)draw()}
      toast('上传结束。已入队任务在后台继续；失败项可点击继续上传。')
    }},'上传 / 继续失败项')
    box.append(h('h1',{},'批量上传'),h('p',{},'图片保存在本机草稿中，可刷新后继续。上传完成后即可离开，后台继续识别。'),
      h('div',{class:'filter-bar'},[subject,source,tags]),zone,status,upload,
      h('a',{class:'btn',href:'#/review-ocr'},'去校对'),
      h('button',{class:'btn',onclick:async()=>{if(busy||preparing)return;if(draft.groups.some(g=>!g.done)&&!confirm('清除本机草稿？已上传到服务器的题目仍然保留。'))return;draft={batch:crypto.randomUUID(),groups:[],subject:subject.value,source:source.value,tags:tags.value};await save();draw()}},'开始新批次'),grid)
    view.append(box);draw()
  }
  async function renderReviewOcr() {
    let rows=[],selected=0,dirty=false,gone=false
    const select=h('select'),images=h('div'),text=h('textarea',{rows:16,placeholder:'识别结果；也可手动填写'}),preview=h('div'),message=h('p'),kp=h('div')
    const drawText=()=>{preview.innerHTML=renderMarkdown(text.value)}
    text.oninput=()=>{dirty=true;drawText()}
    function pick(id){
      const q=rows.find(r=>r.id===id);if(!q)return
      selected=q.id;select.value=String(q.id);dirty=false;text.value=q.stem_raw||'';drawText()
      images.replaceChildren(...q.images.map(im=>h('img',{src:im.access_url,alt:'题目原图',class:'review-image'})))
      kp.replaceChildren();let result={};try{result=JSON.parse(q.job?.result||'{}')}catch{}
      for(const k of result.suggestion?.knowledge_points||[])kp.append(h('label',{},[h('input',{type:'checkbox',value:k}),' '+k+' ']))
      message.textContent=q.job?.error||q.job?.status||'图片未完整上传，可返回批量上传继续'
      retry.disabled=q.job?.status!=='failed'
    }
    select.onchange=()=>{if(dirty&&!confirm('放弃当前未保存校对？')){select.value=String(selected);return}pick(Number(select.value))}
    const save=h('button',{class:'btn btn-primary',onclick:async()=>{
      try{
        await API.req('/api/batch/questions/'+selected+'/confirm',{method:'POST',body:{stem:text.value,knowledge_points:[...kp.querySelectorAll('input:checked')].map(x=>x.value)}})
        dirty=false;selected=0;await refresh();toast('已保存并安排复习')
      }catch(e){toast(e.message)}
    }},'保存并下一题（Ctrl+Enter）')
    const retry=h('button',{class:'btn',onclick:async()=>{
      try{const q=rows.find(r=>r.id===selected);await API.req('/api/jobs/'+q.job.id+'/retry',{method:'POST',body:{}});await refresh()}catch(e){toast(e.message)}
    }},'重试识别')
    async function refresh(){
      const r=await API.req('/api/batch/review');if(gone)return
      const old=rows.find(x=>x.id===selected);rows=r.items
      select.replaceChildren(...rows.map(q=>h('option',{value:q.id},'#'+q.id+' · '+(q.job?.status||'待上传'))))
      if(!rows.length){selected=0;text.value='';images.replaceChildren();preview.replaceChildren();message.textContent='全部校对完成';save.disabled=true;retry.disabled=true;return}
      save.disabled=false
      const current=rows.find(x=>x.id===selected)
      if(!current)pick(rows[0].id)
      else if(!dirty&&current.stem_raw!==old?.stem_raw)pick(selected)
      else{select.value=String(selected);message.textContent=current.job?.error||current.job?.status||'待上传';retry.disabled=current.job?.status!=='failed'}
    }
    const key=e=>{if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();save.click()}if(e.ctrlKey&&e.key==='ArrowRight'){e.preventDefault();if(!dirty||confirm('跳过并放弃未保存校对？')){const i=rows.findIndex(q=>q.id===selected);pick(rows[(i+1)%rows.length]?.id)}}}
    document.addEventListener('keydown',key)
    const timer=setInterval(()=>refresh().catch(()=>{}),3000)
    onLeave(()=>{gone=true;clearInterval(timer);document.removeEventListener('keydown',key)})
    view.append(h('h1',{},'待校对'),select,message,h('div',{class:'review-columns'},[images,h('div',{},[text,preview,kp])]),save,retry)
    await refresh()
  }

  // ---------- 启动 ----------
  if (window.marked?.setOptions) window.marked.setOptions({ breaks: true })
  initAuth()
})()
