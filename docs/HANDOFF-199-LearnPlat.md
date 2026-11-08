# 199-LearnPlat 开发交接：批量录题与作文批改

交接日期：2026-11-06。**试用两项功能，请检出 `feat/essay`。** 本次交付止于 GitHub 功能分支。阿里云没有部署此次改动，线上账号和数据也没有迁入测试实例。

## 1. 从哪里接手

| PR | 内容 | 合并方向 | 交接时状态 |
| --- | --- | --- | --- |
| [#1](https://github.com/Beiyouanxiang/199-LearnPlat/pull/1) | 无模型 API Key 的产品要求、实施计划和代理提示词 | `docs/no-api-interaction` → `sprint/math-review` | 开放 |
| [#2](https://github.com/Beiyouanxiang/199-LearnPlat/pull/2) | 批量上传、后台任务队列、待校对页 | `feat/batch-upload` → `sprint/math-review` | 开放，可审查 |
| [#3](https://github.com/Beiyouanxiang/199-LearnPlat/pull/3) | 作文录入、聊天材料交换、CLI 和 MCP | `feat/essay` → `feat/batch-upload` | 开放，可审查 |

PR #3 依赖 #2。审查时先看 #2，再看 #3。若先合并 #2，保留其分支，检查并将 #3 的目标切到 `sprint/math-review`，复核差异后再合并。本文只记录建议顺序。

## 2. 本地启动

在装有 Git 和 Node.js 24 的电脑上执行：

```sh
git clone --branch feat/essay --single-branch https://github.com/Beiyouanxiang/199-LearnPlat.git 199-LearnPlat-preview
cd 199-LearnPlat-preview
npm ci
npm start
```

保持终端运行，在同一台电脑打开 **http://127.0.0.1:3005/#/essays**，注册本地测试账号。独立克隆默认使用自己的 `data/` 和 `uploads/`。手动录入、导出材料、导入批改都能在模型密钥留空时使用。

## 3. 两条试用路线

**批量错题。** 从首页进入「批量上传」，多选图片，默认一张一题。跨页题可合并相邻图片。点击「上传 / 继续失败项」，等题目显示已入队后即可离开。到「待校对」对照原图修正识别文字，按 Ctrl+Enter 保存并进入下一题。确认后才安排复习。图片上传中断时，用同一浏览器和账号恢复草稿。

**作文批改。** 进入「写作练习 → 新建作文」，选择论说文或论证有效性分析。输入正文，或上传照片并校对 OCR 稿。论证有效性分析需要题目材料。点击「确认校对稿」后选择以下任一方式：

| 使用方式 | 操作 |
| --- | --- |
| ChatGPT / Claude 网页聊天，无需模型 API Key | 下载或复制批改材料，交给已登录的聊天客户端，要求按材料包的 `response_template` 返回完整 JSON。将回复粘回平台，点「校验并预览」，核对后再点「确认保存这份批改」。 |
| Codex / Claude Code，无需模型 API Key | 在「管理代理令牌」生成只含 `essays:read` 和 `essays:write` 的令牌，在自己的客户端配置本地 MCP，再说「批改最新一篇已校对作文并保存」。令牌只用于访问学习平台。要让代理新建作文并识别，另勾选 `essays:create`；要录入或修改错题，另勾选 `questions:write`。具体命令见 [代理接入说明](AGENT-API.md)。 |
| 服务端直接批改，可选 | 配置作文模型后，使用详情页的服务端模型按钮。真实图片识别另外需要 `GLM_API_KEY`。 |

要比较 GPT 与 Claude，请为两次批改分别导出材料。重复提交同一份结果只保存一次；改动校对稿后要重新导出，以免旧意见落到新稿上。点击一条意见可定位原文，找不到的引文会标为「未定位」。

## 4. 开发入口与运行约束

| 需要修改的行为 | 从这里读起 |
| --- | --- |
| 任务持久化、重启恢复、退避重试和每日额度 | [job-store.js](../server/job-store.js)、[jobs.js](../server/jobs.js) |
| 错题图片入库、OCR 入队、校对保存 | [batch.js](../server/batch.js)、[app.js](../public/app.js) |
| 作文版本、材料包、预览及幂等回写 | [essay-store.js](../server/essay-store.js)、[essay-schema.js](../server/essay-schema.js) |
| 作文接口、令牌鉴权与页面 | [essays.js（后端）](../server/essays.js)、[essays.js（前端）](../public/essays.js) |
| 批改质量与客户端接入 | [训练量表](../server/content/essay-rubric.js)、[批改提示词](../server/prompts/essay-grade.md)、[代理客户端](../scripts/agent-client.mjs) |

当前队列按单进程 worker 设计。若改成多实例，先实现带租约的任务领取，避免一个进程在启动时重置另一个进程的在途任务。旧库升级只增加字段或表；真实密钥、令牌、数据库和上传图片都不进入 Git。

## 5. 验收依据与待办

已验收的功能代码提交为 [`dd758ada`](https://github.com/Beiyouanxiang/199-LearnPlat/commit/dd758ada73e8dc54bc472ab9896052004131ff36)。[GitHub Actions 记录](https://github.com/Beiyouanxiang/199-LearnPlat/actions/runs/42148038929)中 7 项后端测试通过，覆盖旧库迁移、批量处理、每日额度、权限隔离、令牌吊销、过期和重复回写，以及 SDK 客户端通过 stdio MCP 读写。375px 浏览器验收中，30 张生成图上传并入队耗时 2.12 秒；关闭重开、校对保存、作文导出导入及引文高亮均通过。这个时间不含真实手写识别。

复跑后端测试：在项目根目录执行 `npm ci`、`npm ci --prefix scripts/mcp`、`node --test tests/*.test.mjs`。旧库迁移强制验收需要可读的 `origin/main`，完整复现步骤见 [CI 工作流](../.github/workflows/checks.yml)。`OCR_MOCK=1` 和 `ESSAY_MOCK=1` 仅用于测试流程。

接手后优先完成三件事：

1. 用一篇真实作文和实际订阅客户端完成一次导出批改或 MCP 回写，核对网页上的版本、来源和定位。
2. 用几张手机拍摄的手写答题卡试 OCR，记录错序、漏字和人工校对用时。
3. 对照 2027 年管理类综合能力考试大纲核实写作评分细则。当前标注为训练估分；核实后更新量表版本，并保留历史结果对应的旧版本。

## 6. Codex 交接补充（2026-11-06，本地验收）

上述待办 1、3 已在独立 worktree 和 3015 隔离实例完成。官方 Codex CLI 分别通过 stdio MCP 和 REST CLI 对两篇原创练习进行了两轮真实批改：旧版 `2027-training-v1` 为 24/30、30/35，新版 `2027-verified-v1` 为 24/30、31/35。HTTP 已核对来源、维度合计、版本和全部引文位置，旧、新记录并存。评分是训练估分。

量表核实依据、分档含义和跨版本规则见 [2027 量表说明](ESSAY-RUBRIC-2027.md)，一次性客户端配置见 [代理接入说明](AGENT-API.md)。另修复数据库目录初始化向 `fs.existsSync` 传入 `null` 导致的 `DEP0187`，并增加启动与旧库升级回归检查。

本次只做本地提交，没有推送、创建 PR 或部署；共享 3005 预览未写入 demo。手写照片 OCR 实测仍是独立待办，本轮不将模拟 OCR 当作真实识别验收。
