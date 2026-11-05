# 给 Codex 的任务提示词

**2026-11-05 优先约束：用户没有 GPT/Claude API Key。提示词 2 必须先实现无 Key 的导出/导入闭环与方式 B，方式 A 是可选入口；详见计划末尾补充。所有功能只提交 GitHub，不更新阿里云。**

按顺序使用：做完提示词 1、合并或确认之后，再用提示词 2。直接整段复制即可。

---

## 提示词 1：批量上传错题（含公共任务队列）

```
你在 199-LearnPlat 仓库里工作。先完整阅读 AGENTS.md 和 docs/PLAN-batch-and-essay.md，严格遵守 AGENTS.md 的约定。

任务：实现计划里的「第 0 步：公共底座」和「功能一：快速批量上传错题」。

要求：
1. 从 sprint/math-review 拉新分支 feat/batch-upload。
2. 动手前先读 server/index.js、server/db.js、server/providers/ocr.js、server/providers/tutor.js、public/app.js 中录题和"待整理"相关的代码，复用已有接口（POST /api/questions、POST /api/questions/:id/images、callOcr、suggestQuestionMeta），不要重复造轮子。
3. 数据库只做加法迁移。在用旧版 db.js（git show main:server/db.js）建的旧库上测一次升级，确认旧数据完好。
4. 后台任务队列要能扛住服务重启（running 改回 queued），429/5xx 指数退避重试，每用户每日调用上限可配置，新配置项写进 .env.example。
5. 前端：#/batch 批量上传页（多选/拖拽/粘贴、缩略图网格、删除/排序/合并相邻图为一题、统一科目来源标签、并发上传、进度与失败重试、重复图片提示），#/review-ocr 待校对页（原图对照、可编辑识别文本带 KaTeX 预览、知识点建议点选、Ctrl+Enter 保存并下一题）。手机宽度 375px 下可用。
6. 本地没有 GLM_API_KEY 时，OCR 任务应失败并显示清楚原因，不要崩溃；可以加一个环境变量 OCR_MOCK=1，返回假识别结果，方便本地测试完整流程。
7. 自查：node --check、npm start 后实际走一遍（30 张图批量上传 → 关页面 → 重开看到 OCR 完成 → 校对保存 → 题目出现在复习队列），旧的单题录入照常可用。
8. 更新 README 的功能列表。提交到 feat/batch-upload 并推送，开一个合并到 sprint/math-review 的 PR，PR 描述里写清改动、迁移和测试过程。不要推 main，不要部署。

不确定的产品细节按计划文档里的默认做法处理，在 PR 描述里列出你做的取舍。
```

---

## 提示词 2：作文批改（模型 API + Codex/Claude 接口）

```
你在 199-LearnPlat 仓库里工作。先完整阅读 AGENTS.md 和 docs/PLAN-batch-and-essay.md，严格遵守 AGENTS.md 的约定。

任务：实现计划里的「功能二：作文批改」，包括方式 A（服务端调模型 API）和方式 B（个人访问令牌 + /api/agent REST + MCP server + 命令行兜底）。

要求：
1. 从 feat/batch-upload 拉新分支 feat/essay（如果它已合并，就从 sprint/math-review 拉），复用第 0 步的 jobs 队列和图片预处理。
2. 评分标准 server/content/essay-rubric.js：按管理类联考考试大纲的写作评分要求，用自己的话整理成结构化数据（论证有效性分析 30 分、论说文 35 分，各档分数区间与特征、常见论证缺陷类型、扣分规则），带 version 字段。不要复制辅导书或网页原文。在 PR 里注明"需对照当年大纲人工核实"。
3. 批改提示词放在 server/prompts/essay-grade.md，模型 API 和代理接口共用同一份。输出结构按计划里的 JSON，写 server/essay-schema.js 做校验（包括 quote 能在转写文本中找到），不合规时带错误重试一次。
4. 转写校对是批改前的必经步骤，记录她对 OCR 文本的改动（ocr_edits），并在提示词里说明这些位置不算她的错别字。
5. 方式 A：server/providers/essay.js 复用 tutor.js 的 callChat。新增 ESSAY_* 配置，未设置时回退 TUTOR_*，写进 .env.example（空值）。
6. 方式 B：
   - api_tokens 表只存 sha256 哈希，明文只显示一次，支持 scope 和吊销，设置页可以管理。
   - /api/agent/* 只认令牌，单独限流；GET /api/agent/essays/:id 一次返回批改所需的全部内容（转写、材料、ocr_edits、评分标准、JSON Schema、提示词）。
   - scripts/mcp-server.mjs：stdio MCP，用 @modelcontextprotocol/sdk，只通过 REST 访问，环境变量 LEARNPLAT_URL / LEARNPLAT_TOKEN。工具：list_ungraded_essays、get_essay、submit_grading、get_rubric、list_wrong_questions。
   - scripts/agent-cli.mjs：list / get / submit 三个子命令。
   - docs/AGENT-API.md：写清楚 Claude Code 和 Codex CLI 的接入配置示例。
7. 前端：#/essays 列表（含分数走势）、#/essays/new 上传、#/essays/:id（转写校对 → 批改结果，逐条意见点击后在原文高亮，多次批改并排对比，标明"估分仅供参考"）。手机宽度可用。
8. 本地没有模型 Key 时提供 ESSAY_MOCK=1 返回一份合规的假批改结果，用来测试页面。
9. 自查：node --check；在旧库上测试迁移；本地完整走一遍上传 → 校对 → 模型批改（mock）；再用令牌通过 MCP server 走一遍 list → get → submit，网页上看到 grader 为 codex/claude 的结果；吊销令牌后返回 401；确认前端和接口响应里没有任何模型 Key。
10. 更新 README。提交到 feat/essay 并推送，开 PR，描述里写清改动、迁移、接入方式和测试过程。不要推 main，不要部署。

不确定的细节按计划文档的默认做法处理，在 PR 描述里列出取舍。
```

## 提示词 2 的补充验收（优先执行）

- 在所有模型和 OCR Key 都为空时，仍可手动录入作文、校对、导出完整批改材料包，再粘贴或导入批改 JSON；导入必须先校验和预览。
- 材料包包含作文/校对稿版本、评分标准版本、输出 schema 版本及 request_id；回写验证归属与版本，重复提交幂等。
- 共用同一个校验器处理手动导入、REST、MCP 和可选模型 API 的结果。
- 先实现平台 REST/CLI/MCP，使用户在已登录的官方 Codex/Claude Code 中主动发起批改；平台令牌仅访问平台，不提供模型额度。
- 不提取订阅凭证，不实现订阅转 API 代理；stdio MCP 不是普通网页可直接调用的服务。
- 说明哪些验证用 mock，哪些用真实客户端完成。没有真实客户端联调，不宣称自动交互已验证。
