# 用 ChatGPT 或 Claude 批改作文

在运行本分支的测试实例首页打开「写作练习」。创建作文，上传照片或直接输入正文，核对题目材料后点击「确认校对稿」。

## 网页聊天

点击「下载批改材料」或「复制批改材料」，在自己登录的 ChatGPT 或 Claude 对话中发出材料，要求按其中模板返回 JSON。将回复粘回作文详情页，或导入 JSON 文件。核对预览后点击「确认保存这份批改」。如果要比较两位批改者，请分别导出一次，让每份回复有自己的 request_id。

导入检查作文归属、校对稿版本、量表版本、各维度得分及总分。相同请求重复保存只产生一条记录。修改校对稿后请重新导出。找不到的引文会显示「未定位」。

## 在已登录的客户端主动批改

平台运行于本机时可用 http://127.0.0.1:3005。客户端在另一台设备上时，将 URL 换成可访问的 HTTPS 测试实例。平台令牌可在「管理代理令牌」中生成。批改已有作文时勾选 essays:read 和 essays:write。读取错题再勾选 questions:read。让代理新建作文并上传图片识别时勾选 essays:create。让代理录入或修改错题时勾选 questions:write。每个令牌只能操作签发它的那个账号的数据。

创建仅自己可读、位于仓库外的环境文件，例如 ~/.config/learnplat.env。填入实际 URL、生成的令牌和客户端名称。令牌只会显示一次。

```dotenv
LEARNPLAT_URL=http://127.0.0.1:3005
LEARNPLAT_TOKEN=替换为生成的学习平台令牌
LEARNPLAT_GRADER=codex
```

Node 24 或更新版本可直接运行 REST CLI。把下面的路径替换为实际的绝对路径。

```bash
node --env-file=/absolute/path/learnplat.env scripts/agent-cli.mjs list
node --env-file=/absolute/path/learnplat.env scripts/agent-cli.mjs get 1
node --env-file=/absolute/path/learnplat.env scripts/agent-cli.mjs submit 1 result.json
```

在本机安装 MCP 的独立依赖一次：

```bash
npm install --prefix scripts/mcp
```

Codex 的 ~/.codex/config.toml 配置如下：

```toml
[mcp_servers.learnplat]
command = "node"
args = ["--env-file=/absolute/path/learnplat.env", "/absolute/path/199-LearnPlat/scripts/mcp-server.mjs"]
```

Claude Code 可使用另一个环境文件，把 LEARNPLAT_GRADER 设为 claude，再执行：

```bash
claude mcp add --transport stdio learnplat -- node --env-file=/absolute/path/claude-learnplat.env /absolute/path/199-LearnPlat/scripts/mcp-server.mjs
```

在客户端发出「批改我最新一篇已校对的作文，并把结果保存到学习平台」。客户端调用 list_ungraded_essays，选择最新作文，用 get_essay 取得材料包，按 response_template 生成结果，然后调用 submit_grading。网页显示该次批改。客户端名称是调用方声明的来源。

## 用令牌完成一篇作文

这些步骤不在现有 MCP 工具里，代理直接调用 REST。把 `lp_<64位十六进制>` 换成自己的令牌；下面的示例不是可用密钥。缺少所需 scope 返回 403。操作别人的作文返回 404。网页上的登录接口不接受这种令牌。

整条链路是：创建 → 上传图片 → 发起 OCR → 轮询草稿 → 确认校对稿 → 拉取材料包 → 提交批改。创建、上传、识别需要 `essays:create`。读草稿和确认校对稿接受 `essays:create` 或 `essays:write`。拉取材料包需要 `essays:read`。提交批改需要 `essays:write`。已有的五个权限都勾上时，一个令牌可以走完。

图片仍是 data URI，单张上限与网页相同。OCR 入队使用和网页一样的突发限额，并计入该用户的每日 OCR 次数。

```bash
curl -s -X POST "$LEARNPLAT_URL/api/agent/essays" \
  -H "Authorization: Bearer lp_<64位十六进制>" \
  -H "Content-Type: application/json" \
  -d '{"kind":"essay","source":"练习","year":"2026"}'

curl -s -X POST "$LEARNPLAT_URL/api/agent/essays/1/images" \
  -H "Authorization: Bearer lp_<64位十六进制>" \
  -H "Content-Type: application/json" \
  -d '{"role":"answer","position":0,"image":"data:image/jpeg;base64,..."}'

curl -s -X POST "$LEARNPLAT_URL/api/agent/essays/1/ocr" \
  -H "Authorization: Bearer lp_<64位十六进制>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

OCR 完成前，`GET /api/agent/essays/1` 仍是材料包接口，未确认时返回 409「请先确认转写文本」。轮询请改用草稿：

```bash
curl -s "$LEARNPLAT_URL/api/agent/essays/1/draft" \
  -H "Authorization: Bearer lp_<64位十六进制>"
```

草稿返回识别文本 `ocr_text`、图片列表 `images`、`status` 和 `revision`，以及与网页详情相同的任务状态 `jobs`。`ocr_text` 出现正文后即可确认。`revision` 必须原样带回；过期的 revision 返回 409「已有新版本，请刷新」，与网页相同。

```bash
curl -s -X POST "$LEARNPLAT_URL/api/agent/essays/1/confirm" \
  -H "Authorization: Bearer lp_<64位十六进制>" \
  -H "Content-Type: application/json" \
  -d '{"revision":0,"transcript":"校对后的正文","prompt_text":"题目材料"}'
```

确认成功后，用 `essays:read` 拉取材料包。这一步才会生成批改用的 `request_id`：

```bash
curl -s "$LEARNPLAT_URL/api/agent/essays/1" \
  -H "Authorization: Bearer lp_<64位十六进制>"
```

`request_id` 不来自创建作文，也不由代理自己编。它是这次 GET 材料包时服务器生成的 UUID，同时出现在响应顶层的 `request_id` 和 `response_template.request_id`，两边相同。材料包还会给出 `essay_id`、`transcript_revision`、`rubric_version`、`schema_version`。提交时把 `response_template` 整份带回，只往里面的 `result` 填批改结果。再 GET 一次会得到另一个 `request_id`；必须提交和这份结果对应的那一个。同一个 `request_id` 配上完全相同的结果只会保存一条；结果不同则返回 409。

```bash
curl -s -X POST "$LEARNPLAT_URL/api/agent/essays/1/gradings" \
  -H "Authorization: Bearer lp_<64位十六进制>" \
  -H "Content-Type: application/json" \
  -d '{"request_id":"<材料包 response_template.request_id>","essay_id":1,"transcript_revision":1,"rubric_version":"2027-verified-v1","schema_version":"1","result":{}}'
```

`result` 按材料包里的 `output_schema` 填写。CLI 的 `get` 和 MCP 的 `get_essay` 走的也是这个材料包接口，所以它们返回的 `request_id` 同样是提交时应使用的那一个。

`questions:write` 对应录题页的保存、之后的编辑，以及给已有题补图。创建时可以在 `images` 里直接带上 data URI，和网页一次保存相同。

```bash
curl -s -X POST "$LEARNPLAT_URL/api/agent/questions" \
  -H "Authorization: Bearer lp_<64位十六进制>" \
  -H "Content-Type: application/json" \
  -d '{"subject":"math","stem":"求 $x+1=2$","user_answer":"x=0","correct_answer":"x=1"}'

curl -s -X PATCH "$LEARNPLAT_URL/api/agent/questions/1" \
  -H "Authorization: Bearer lp_<64位十六进制>" \
  -H "Content-Type: application/json" \
  -d '{"stem":"校对后的题干","error_reason":"计算错误"}'

curl -s -X POST "$LEARNPLAT_URL/api/agent/questions/1/images" \
  -H "Authorization: Bearer lp_<64位十六进制>" \
  -H "Content-Type: application/json" \
  -d '{"image":"data:image/jpeg;base64,..."}'
```

工具还支持 get_rubric 和 list_wrong_questions。平台仅在用户的客户端会话中读写作文。使用客户端自己的登录方式与额度即可。stdio 服务在客户端设备运行，网页版聊天使用上面的文件交换流程。

## 量表版本与隔离验收

新材料包使用 `2027-verified-v1`。历史 `2027-training-v1` 记录和未改稿的旧材料包继续可用；提交时原样保留包里的版本，不要替换成最新版本。论证有效性分析新版的 `band` 对应 14 分的“论证组织与表达”维度，不对应 30 分总分。核实依据与计分口径见 [2027 量表说明](ESSAY-RUBRIC-2027.md)。

`GET /api/agent/rubric` 与 MCP `get_rubric` 默认读取当前版本；分别加 `?version=2027-training-v1` 或传入 `{"version":"2027-training-v1"}` 可读取旧版。CLI 对应 `rubric [version]`。未知版本返回 404。

在共享机器验收时，另设 `PORT`、`LEARNPLAT_DATA_DIR` 和 `LEARNPLAT_UPLOAD_DIR`，不要复用他人的预览端口或数据目录。两篇原创验收材料在 `tests/fixtures/essays.mjs`。这次批改验收的代理令牌只授予 `essays:read`、`essays:write`，环境文件放在仓库外并设为 `chmod 600`。

可用 Codex 的进程级 `-c` 参数配置一次性 MCP，无需修改用户的配置文件：

```bash
/usr/lib/chatgpt/resources/codex --no-daemon exec --ephemeral --ignore-user-config \
  -c mcp_servers.node_repl.enabled=false \
  -c 'mcp_servers.node_repl.command="node"' \
  -c 'mcp_servers.learnplat.command="node"' \
  -c 'mcp_servers.learnplat.args=["--env-file=/tmp/learnplat-check/learnplat.env","/absolute/path/199-LearnPlat-work/scripts/mcp-server.mjs"]' \
  -c mcp_servers.learnplat.required=true \
  '批改隔离实例中指定的已校对作文，并用 submit_grading 保存。'
```

这里使用官方 CLI 已登录的身份，不读取 `auth.json`。在 CLI 0.166.0-alpha.5.1 中，配合 `--ignore-user-config` 禁用 `node_repl` 时也需提供合法的 transport 定义，因此为这个禁用项补 `command="node"`；它不会启动。正式验收须检查 HTTP 返回的 `grader=codex`、量表版本、维度合计和所有引文位置，再在浏览器点选意见核对高亮。结束后关掉自己启动的临时实例，不把测试数据或令牌提交到 Git。

配置参考：[Codex MCP](https://developers.openai.com/codex/mcp/) · [Claude Code MCP](https://code.claude.com/docs/en/mcp)
