# 计划：批量上传错题 + 作文批改

两个功能都依赖 OCR 和大模型，公共部分先做（第 0 步），再分两个分支各自实现。
所有约定见根目录 `AGENTS.md`。

---

## 第 0 步：公共底座（两个功能都要用，放在功能一的分支里先做）

### 0.1 后台任务队列 `server/jobs.js`
OCR 和模型调用都慢（单张 OCR 5–30 秒），批量时不能让浏览器一直等。

- 新表 `jobs`：`id, user_id, kind ('ocr_question' | 'essay_ocr' | 'essay_grade'), ref_id, status ('queued' | 'running' | 'done' | 'failed'), attempts, error, payload TEXT(JSON), result TEXT(JSON), created_at, updated_at`
- 进程内 worker：按 kind 设置并发（`OCR_CONCURRENCY` 默认 2，`GRADE_CONCURRENCY` 默认 1）。
- 遇到 429 或 5xx 时指数退避重试，最多 3 次。其他错误直接标 failed，并把原因写进 `error`。
- 服务重启时，把 `running` 状态改回 `queued` 继续跑（PM2 重启不能丢任务）。
- 接口：
  - `GET /api/jobs?ids=1,2,3` 或 `GET /api/jobs?batch=xxx`：前端每 2–3 秒轮询一次。
  - `POST /api/jobs/:id/retry`：手动重试。
- 每个用户每日的 OCR 和模型调用次数做一个上限（`DAILY_OCR_MAX` / `DAILY_GRADE_MAX`），防止误操作烧光额度。

### 0.2 前端图片预处理（`public/app.js` 里抽成函数）
- 用 canvas 把长边缩到 2000px 以内，转 JPEG（质量 0.85），并按 EXIF 方向纠正。
- 手机拍照动辄 5–10 MB，压缩后上传和 OCR 都快很多。目前单图上限 10 MB，JSON body 上限 20 MB。
- 计算 SHA-256，用来提示重复上传。

---

## 功能一：快速批量上传错题

**目标**：一次选几十张照片，几秒内全部入库，OCR 在后台跑；她之后在"待校对"里逐题过一遍。

### 流程
1. 新页面 `#/batch`，入口放在录题页和首页。支持多选文件、拖拽、粘贴多张图。
2. 选完显示缩略图网格，可以做这些操作：
   - 删除、调整顺序。
   - **合并**：把相邻几张合成一道题（题干和解析分两张拍的情况）。默认一张一题。
   - 统一设置科目、来源（例如"2024 真题"）、标签。
3. 点「全部上传」后逐题处理：
   - 先调已有的 `POST /api/questions` 建空题（`stem: ''`，复用现有"只存图片，稍后整理"的逻辑）。
   - 再调已有的 `POST /api/questions/:id/images` 传图。
   - 最后调新的 `POST /api/questions/:id/ocr` 入队，返回 job id。
   - 前端并发 3 个请求，显示总进度条，失败的单独标红并可重试。
4. 上传完立即可以离开页面，OCR 在服务端跑。
5. OCR 完成后：
   - 识别结果写进 `stem_raw`。`stem` 保持空，表示"待校对"，这样不会把没校对的识别结果当成正式题干。
   - 再按需调现有 `suggestQuestionMeta`，预填题型和知识点，结果作为建议存进 `jobs.result`。
6. 新页面 `#/review-ocr`（待校对）：
   - 左边原图，右边识别文本（可编辑，带 KaTeX 预览），下方是建议的知识点（点选确认）。
   - 快捷键：`Ctrl+Enter` 保存并下一题，`Ctrl+→` 跳过。
   - 保存后把校对过的文本写进 `stem`，题目从"待整理"消失，正常进入复习。

### 数据库
- `questions` 加列 `ocr_status TEXT DEFAULT ''`（`'' | queued | done | failed`）和 `image_hash TEXT DEFAULT ''`。
- 复用 0.1 的 `jobs` 表。

### 验收
- 一次选 30 张图：上传阶段（不含 OCR）在本机 1 分钟内完成；关掉页面再打开，OCR 继续完成。
- 断网、OCR 报错、限流时，单题标失败可重试，不影响其他题。
- 重复图片有提示（可以选择仍然上传）。
- 旧的单题录入流程不受影响。

---

## 功能二：作文批改（按考试大纲）

**目标**：拍照上传她手写的论证有效性分析或论说文，自动给出估分档次和逐条问题。批改可以由服务端调用模型 API 完成，也可以由 Codex / Claude 这类代理读取作文、批改后把结果写回来。

### 页面
- `#/essays` 列表：显示类型、题目年份、分数、日期，以及分数走势小图。
- `#/essays/new` 上传：
  - 选类型：论证有效性分析（30 分）或论说文（35 分）。
  - 填题目来源和年份，可选上传题目材料图或粘贴材料原文。
  - 上传答题卡照片，可以多张。
- `#/essays/:id` 详情：
  - **转写校对**（必须先做）：左边原图，右边 OCR 文本。她确认转写无误后才能批改。
    - 原因：批改错别字时必须分清是 OCR 识别错还是她自己写错。
    - 校对时，被她改动过的位置要记下来（diff），批改提示里注明"这些是 OCR 误识别，不算错字"。
  - **批改结果**：总分和档次，分维度得分；逐条意见可以点击，定位到原文高亮；最后是一段改写示范。
  - 同一篇可以保留多次批改（模型 API、Codex、Claude、手动），并排对比。

### 评分标准 `server/content/essay-rubric.js`
- 按考试大纲的写作评分要求，用自己的话整理成结构化数据，不抄原文。实现前请对照当年最新大纲核实。
- 加 `version` 字段，批改结果里记录用的是哪一版标准。
- **论证有效性分析（30 分）**：
  - 主要看找出并分析论证缺陷（概念、推理、论据等方面的问题）的数量和准确度、分析是否到位、结构与语言。
  - 标准里列出常见缺陷类型，例如偷换概念、以偏概全、不当类比、因果倒置、非此即彼、推不出、自相矛盾。
- **论说文（35 分）**：
  - 按立意、结构、论证、语言四个方面分档（一类卷到五类卷）。
  - 写明各档分数区间和特征，以及字数不足、无标题的扣分规则。

### 批改输出（固定 JSON 结构，`server/essay-schema.js` 校验）
```json
{
  "rubric_version": "2027-v1",
  "total": 22, "max": 30, "band": "二类卷",
  "dimensions": [{ "name": "缺陷识别", "score": 10, "max": 16, "comment": "..." }],
  "flaws_found":  [{ "type": "以偏概全", "quote": "原文片段", "ok": true, "comment": "分析到位/不到位在哪" }],
  "flaws_missed": [{ "type": "因果倒置", "where": "材料第 3 句", "how_to_write": "..." }],
  "issues": [{ "quote": "原文片段", "kind": "病句|逻辑|结构|错别字", "problem": "...", "fix": "..." }],
  "rewrite_sample": "一段改写示范",
  "next_focus": ["下次最该改的 1–3 件事"]
}
```
- `flaws_found` 和 `flaws_missed` 只用于论证有效性分析。论说文改用 `thesis`（立意评价）和 `structure`（结构评价）两个字段。
- `quote` 必须是转写文本里的原样片段，前端靠它定位高亮。校验时检查是否在原文中能找到，找不到的条目标记为"未定位"，不要丢弃。
- 模型返回不合规时，带着校验错误重试 1 次。仍失败就保存原始文本并标记 failed。

### 方式 A：服务端调用模型 API
- `server/providers/essay.js`：复用 `tutor.js` 的 `callChat`（OpenAI 兼容）。
- 新配置写进 `.env.example`：`ESSAY_PROVIDER`、`ESSAY_MODEL`、`ESSAY_API_KEY`、`ESSAY_BASE_URL`，未填时回退到 `TUTOR_*`。
- 提示词放在 `server/prompts/essay-grade.md`，运行时把评分标准、材料、转写文本、OCR 改动记录、输出结构拼进去。代理来读作文时也用同一份提示词。
- 新接口 `POST /api/essays/:id/grade` 只负责入队（kind `essay_grade`），前端轮询任务状态。

### 方式 B：给 Codex / Claude 读写的接口
让她（或你）在本机的 Codex CLI / Claude Code 里说"批改我最新那篇作文"就能完成。

1. **个人访问令牌**
   - 新表 `api_tokens`：`id, user_id, name, token_hash(sha256), scopes, last_used_at, created_at, revoked_at`。
   - 设置页可以生成和吊销令牌。令牌明文只显示一次，格式 `lp_` 加 32 字节随机数。
   - scope 分三种：`essays:read`、`essays:write`、`questions:read`。
   - 中间件 `requireToken(scope)`：读 `Authorization: Bearer lp_...` 并单独限流。
2. **REST 接口**（前缀 `/api/agent/`，只接受令牌）
   - `GET /api/agent/essays?status=ungraded`：列出待批改的作文。
   - `GET /api/agent/essays/:id`：返回转写文本、材料、OCR 改动记录、评分标准、输出 JSON Schema，以及 `essay-grade.md` 提示词全文。代理拿到这一个响应就能批改。
   - `POST /api/agent/essays/:id/gradings`：提交批改 JSON，用同一个校验器校验。`grader` 字段填 `codex` 或 `claude`。
   - `GET /api/agent/questions?untidy=1|kp=...`：只读，方便以后让代理帮忙看错题。
3. **MCP server** `scripts/mcp-server.mjs`
   - stdio 方式，依赖 `@modelcontextprotocol/sdk`，内部只是调用上面的 REST 接口，不直接读数据库。这样本机和服务器都能用。
   - 工具：`list_ungraded_essays`、`get_essay`、`submit_grading`、`get_rubric`、`list_wrong_questions`。
   - 配置用环境变量 `LEARNPLAT_URL`、`LEARNPLAT_TOKEN`。
   - 在 `docs/AGENT-API.md` 写清楚 Claude Code（`claude mcp add ...`）和 Codex（`~/.codex/config.toml` 的 `[mcp_servers]`）怎么接入，各附一段示例配置。
4. 再附一个最简命令行 `scripts/agent-cli.mjs`（`list` / `get <id>` / `submit <id> file.json`），给不想配 MCP 的情况兜底。

### 数据库
- `essays`：`id, user_id, kind ('argument' | 'essay'), source, year, prompt_text, ocr_text, transcript, ocr_edits TEXT(JSON), status ('uploaded' | 'transcribed' | 'graded'), created_at, updated_at`
- `essay_images`：结构同 `question_images`，可以复用 `saveImageFile` 的存储方式。
- `essay_gradings`：`id, essay_id, user_id, grader ('api:<model>' | 'codex' | 'claude' | 'manual'), rubric_version, total, max, result TEXT(JSON), raw TEXT, created_at`

### 验收
- 上传 2 张手写论说文照片后能完成 OCR，校对后可以用模型批改，结果 JSON 通过校验，原文片段能高亮。
- 用令牌在本机 Claude Code 或 Codex 里通过 MCP 列出待批改作文、取一篇、提交批改，网页上能看到 `grader = claude/codex` 的那条结果。
- 吊销令牌后立即 401。令牌在数据库里只存哈希。
- 前端代码和接口响应里都没有任何模型 Key。

---

## 风险与提醒
- **手写 OCR 质量**是两个功能的瓶颈。作文是方格纸手写，智谱 OCR 可能乱序或漏字，所以必须有校对步骤。可以备一个开关：校对时附上原图，调视觉模型（`TUTOR_VISION_*`）辅助转写。
- 模型给分只是**估分**，界面上要写明。同一篇多次批改的分数波动是正常的，可以显示多次的平均分。
- 批量 OCR 的费用：智谱按次计费，界面上显示"本批预计调用 N 次"。
- 评分标准要以最新大纲为准，`rubric_version` 方便以后更新时区分新旧结果。

## 建议顺序
1. `feat/batch-upload`：第 0 步加功能一（体量较小，先上线让她用起来）。
2. `feat/essay`：基于 1 的分支开发功能二。先做方式 A 和页面，再做方式 B（令牌、REST、MCP）。
