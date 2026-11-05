// 题型讲解目录。每个题型的字段：
//   signals 识别信号 / think 一句话抓住它 / route 思考路线（{ q 问自己, a 怎么想 }）
//   tools 要套的公式 / tricks 秒杀 / traps 易错
//   examples 例题（think 思路拆解、solution 解答、fast 秒杀做法，可选）
//   practice 练习（level 1 基础 | 2 真题难度 | 3 拔高；hint 思路提示；answer/solution 只在服务端）
// 题目 type：'ps' 问题求解（options 为 A–E）| 'sc' 条件充分性判断
// 含 LaTeX 的字符串一律用 r`...`（String.raw），改完运行 node scripts/lint-topics.mjs 检查
import { CHAPTER_POLY } from './poly.js'
import { CHAPTER_RATIO_ABS } from './ratio-abs.js'
import { CHAPTER_FUNCTION } from './function.js'
import { CHAPTER_EQUATION } from './equation.js'
import { CHAPTER_INEQUALITY } from './inequality.js'
import { CHAPTER_SEQ } from './sequence.js'

// 问题求解题的选项按题目 id 固定轮转，把正确答案打散到 A–E，避免集中在某个字母（解析里不要写选项字母）
function hash(s) {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0
  return h
}
// 条件充分性：答案为 A/B 的题按 id 有一半交换条件 (1)(2) 的顺序，避免 A 远多于 B（swapped 标记供验算脚本对照）
// 只改公式（$…$）之外的条件编号，公式里的 f(1)、f(2) 不动
const swapLabels = (s) =>
  s &&
  s
    .split(/(\$[^$]*\$)/)
    .map((part, i) =>
      i % 2
        ? part
        : part
            .replace(/\((1|2)\)/g, (_, d) => (d === '1' ? '(2)' : '(1)'))
            .replace(/\(2\)\s*\(1\)/g, '(1)(2)')
            .replace(/选 ([AB])/g, (_, L) => '选 ' + (L === 'A' ? 'B' : 'A')),
    )
    .join('')
function swapConditions(item) {
  const m = item.stem.match(/^([\s\S]*?)\n\n\(1\) ([\s\S]*?)\n\n\(2\) ([\s\S]*)$/)
  if (!m) return item
  return {
    ...item,
    stem: `${m[1]}\n\n(1) ${m[3]}\n\n(2) ${m[2]}`,
    answer: item.answer === 'A' ? 'B' : 'A',
    solution: swapLabels(item.solution),
    hint: swapLabels(item.hint),
    think: item.think?.map(swapLabels),
    swapped: true,
  }
}
function arrange(item, key) {
  if (item.type === 'sc') return 'AB'.includes(item.answer) && hash(key) % 2 ? swapConditions(item) : item
  if (item.type !== 'ps') return item
  const from = 'ABCDE'.indexOf(item.answer)
  const to = hash(key) % 5
  const shift = (to - from + 5) % 5
  return { ...item, options: item.options.map((_, i) => item.options[(i - shift + 5) % 5]), answer: 'ABCDE'[to] }
}

const chapters = [CHAPTER_POLY, CHAPTER_RATIO_ABS, CHAPTER_FUNCTION, CHAPTER_EQUATION, CHAPTER_INEQUALITY, CHAPTER_SEQ].map((c) => ({
  ...c,
  topics: c.topics.map((t) => ({
    ...t,
    examples: t.examples.map((e, i) => arrange(e, `${t.id}:ex${i}`)),
    practice: t.practice.map((p, i) => arrange(p, `${t.id}:p${i}`)),
  })),
}))

export const TOPIC_MODULES = [{ id: 'algebra', name: '代数', chapters }]

export const TOPIC_LIST = TOPIC_MODULES.flatMap((m) =>
  m.chapters.flatMap((c) => c.topics.map((t) => ({ ...t, module: m.name, chapter: c.name, chapterId: c.id }))),
)

export const TOPIC_MAP = Object.fromEntries(TOPIC_LIST.map((t, i) => [t.id, { ...t, order: i }]))
