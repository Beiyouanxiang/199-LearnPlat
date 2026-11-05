# AGENTS.md — 给 Codex / Claude 等编码代理的项目约定

## 项目
199 管理类联考学习平台：错题本 + OCR 录题 + AI 讲解 + 间隔复习 + 数学题型精讲。
用户只有两三个人（邀请码注册），线上跑在阿里云，PM2 + Nginx。

- 后端：Node 24、Express 5、better-sqlite3（`server/`）
- 前端：原生 JS 单页（`public/app.js`、`public/style.css`），无构建步骤；公式用 KaTeX，Markdown 用 marked + DOMPurify
- OCR：智谱 layout_parsing（`server/providers/ocr.js`，`callOcr`）
- 大模型：OpenAI 兼容接口（`server/providers/tutor.js`，`callChat`、`callTutor`），支持 deepseek / glm / moonshot

## 必须遵守
1. **不提交密钥和数据**：`.env`、`data/`、`uploads/`、`logs/`、数据库文件都不进 Git。新增配置只写进 `.env.example`（留空值）。
2. **密钥只在服务端**：前端永远拿不到任何模型 API Key。
3. **数据库只做加法迁移**：用 `db.js` 里的 `addColumnIfMissing` 和 `CREATE TABLE IF NOT EXISTS`。不删列、不改列含义。线上已有真实数据，升级必须能直接在旧库上跑。
4. **不改已有接口的行为**：只新增接口；要改旧接口时保持请求/响应向后兼容。
5. **不碰服务器配置**：不改 Nginx、不改线上其他应用、不自动部署。
6. **内容原创**：不把教材、辅导书、真题解析原文复制进仓库。考试大纲的评分要求可以用自己的话概括。
7. 分支：从 `sprint/math-review` 拉新分支开发，每个功能一个分支、一个 PR。不要直接推 `main`。

## 写代码的习惯
- 注释用简体中文，简短说明"为什么"。
- 前端沿用 `app.js` 里的 `h()` 建元素、`api()` 发请求的写法和现有样式变量，不引入框架。
- 新接口统一 `requireAuth`，按用户隔离数据（每条 SQL 都带 `user_id`）。调外部模型的接口加限流（参考 `makeRateLimit`）。
- 含 LaTeX 的 JS 字符串用 `String.raw`（``r`...` ``），单引号会吞反斜杠。

## 改完自查
```bash
node --check server/index.js && node --check public/app.js
node scripts/lint-topics.mjs          # 动了 server/content/topics/ 时
python scripts/verify-topics.py       # 同上，需要 sympy
npm start                             # 本地 http://127.0.0.1:3005 实际点一遍
```
数据库改动要在"旧版库"上测一次升级：用 `git show main:server/db.js` 建一个旧库，再用新代码打开，确认旧数据完整、新功能可用。

## 当前规划
见 `docs/PLAN-batch-and-essay.md`（批量上传错题、作文批改），给代理的任务提示词在 `docs/codex-prompts.md`。
