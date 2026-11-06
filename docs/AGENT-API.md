# 用 ChatGPT 或 Claude 批改作文

在运行本分支的测试实例首页打开「写作练习」。创建作文，上传照片或直接输入正文，核对题目材料后点击「确认校对稿」。

## 网页聊天

点击「下载批改材料」或「复制批改材料」，在自己登录的 ChatGPT 或 Claude 对话中发出材料，要求按其中模板返回 JSON。将回复粘回作文详情页，或导入 JSON 文件。核对预览后点击「确认保存这份批改」。如果要比较两位批改者，请分别导出一次，让每份回复有自己的 request_id。

导入检查作文归属、校对稿版本、量表版本、各维度得分及总分。相同请求重复保存只产生一条记录。修改校对稿后请重新导出。找不到的引文会显示「未定位」。

## 在已登录的客户端主动批改

平台运行于本机时可用 http://127.0.0.1:3005。客户端在另一台设备上时，将 URL 换成可访问的 HTTPS 测试实例。平台令牌可在「管理代理令牌」中生成，勾选 essays:read 和 essays:write。只有要读取错题时再勾选 questions:read。

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

工具还支持 get_rubric 和 list_wrong_questions。平台仅在用户的客户端会话中读写作文。使用客户端自己的登录方式与额度即可。stdio 服务在客户端设备运行，网页版聊天使用上面的文件交换流程。

配置参考：[Codex MCP](https://developers.openai.com/codex/mcp/) · [Claude Code MCP](https://code.claude.com/docs/en/mcp)
