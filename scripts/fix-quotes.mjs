// 把题型内容里含单反斜杠的普通引号字符串（'... \frac ...'）改写成 r`...`，避免反斜杠被 JS 转义吞掉
// 用法：node scripts/fix-quotes.mjs server/content/topics/xxx.js
import { readFileSync, writeFileSync } from 'node:fs'

for (const file of process.argv.slice(2)) {
  const src = readFileSync(file, 'utf8')
  let n = 0
  // 只处理单行内、前面是 { [ , : 空白 之后开始的单引号字符串
  const out = src.replace(/(?<=[:\[,(]\s*)'((?:[^'\\\n]|\\.)*)'/g, (all, body) => {
    const hasSingle = /(^|[^\\])\\(?!\\)/.test(body.replace(/\\\\/g, ''))
    const hasDouble = body.includes('\\\\')
    if (!hasSingle || hasDouble || body.includes('`') || body.includes('${')) return all
    n++
    return 'r`' + body.replace(/\\'/g, "'") + '`'
  })
  writeFileSync(file, out)
  console.log(`${file}: 改写 ${n} 处`)
}
