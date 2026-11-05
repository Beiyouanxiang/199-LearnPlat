// 检查题型内容：公式里丢了反斜杠（普通引号字符串会吞掉，'\frac' 变 'frac'，要写 '\\frac' 或用 r``），以及字段完整性
// 用法：node scripts/lint-topics.mjs
const { TOPIC_LIST } = await import('../server/content/topics/index.js')
let bad = 0

const CMD = /(^|[^\\a-zA-Z])(frac|dfrac|sqrt|ge|le|geq|leq|neq|square|pm|times|cdot|cdots|Rightarrow|Leftrightarrow|infty|left|right|text|quad|log|in|cup|cap|varnothing|lg|max|min|triangle|sum)(?![a-zA-Z])/
function scan(v, where) {
  if (typeof v === 'string') {
    for (const seg of v.match(/\$[^$]+\$/g) || []) {
      if (CMD.test(seg)) { bad++; console.log(`${where} 公式缺反斜杠：${seg}`) }
    }
    // '\frac' '\times' '\right' '\neq' 在普通引号里会变成 \f \t \r \n 控制字符
    if (/[\f\t\v\b\r]/.test(v) || /\$[^$]*\n[^$]*\$/.test(v.replace(/\n\n/g, ' '))) { bad++; console.log(`${where} 含控制字符（反斜杠被转义）：${JSON.stringify(v.slice(0, 60))}`) }
    if ((v.match(/\$/g) || []).length % 2) { bad++; console.log(`${where} $ 不成对`) }
  } else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) scan(x, where + '.' + k)
}

for (const t of TOPIC_LIST) {
  scan(t, t.id)
  const miss = ['signals', 'think', 'route', 'tools', 'tricks', 'traps', 'examples', 'practice'].filter((k) => !t[k] || (Array.isArray(t[k]) && !t[k].length))
  if (miss.length) { bad++; console.log(`${t.id} 缺字段：${miss.join(',')}`) }
  const exN = (t.examples || []).length
  for (const [i, p] of [...(t.examples || []), ...(t.practice || [])].entries()) {
    const where = `${t.id} ${i < exN ? '例题 ' + (i + 1) : '练习 ' + (i - exN + 1)}`
    if (!['ps', 'sc'].includes(p.type) || !/^[A-E]$/.test(p.answer)) { bad++; console.log(where, '题型或答案不合法') }
    if (p.type === 'ps' && p.options?.length !== 5) { bad++; console.log(where, '选项不是 5 个') }
    if (p.type === 'ps' && new Set(p.options).size !== 5) { bad++; console.log(where, '选项重复') }
    if (!p.solution || ![1, 2, 3].includes(p.level)) { bad++; console.log(where, '缺 solution/level') }
    if (i >= exN && !p.hint) { bad++; console.log(where, '缺 hint') }
    if (i < exN && !p.think?.length) { bad++; console.log(where, '例题缺 think') }
  }
}

const practice = TOPIC_LIST.flatMap((t) => t.practice || [])
const dist = {}
for (const p of practice) dist[p.answer] = (dist[p.answer] || 0) + 1
console.log(`${TOPIC_LIST.length} 个题型，${practice.length} 道练习；答案分布 ${JSON.stringify(dist)}；${bad ? bad + ' 处问题' : '检查通过'}`)
process.exit(bad ? 1 : 0)
