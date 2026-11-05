// 导出题目（题型 id、题目类型、选项、答案）为 JSON，供 verify-topics.py 对照验算
const { TOPIC_LIST } = await import('../server/content/topics/index.js')
const pick = ({ type, options, answer, swapped }) => ({ type, options, answer, swapped: !!swapped })
const out = Object.fromEntries(TOPIC_LIST.map((t) => [t.id, { ex: t.examples.map(pick), p: t.practice.map(pick) }]))
process.stdout.write(JSON.stringify(out))
