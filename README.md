# 199 AI 错题本

面向 199 管理类联考的错题整理与学习平台：拍照或上传题目图片、OCR 识别与校对、记录错因、AI 提示和讲解，以及重做检验。

线上入口：https://exam199.transistorsandtokens.com/

## 本地运行

```bash
npm install
cp .env.example .env
# 在本机填写 .env，再启动
npm start
```

前端是 `public/` 下的静态文件，无需额外构建。生产环境通过 `ecosystem.config.cjs` 使用 PM2 启动，默认监听 `127.0.0.1:3005`，由 Nginx 提供公网 HTTPS 入口。

## 配置与数据

- `.env.example` 提供配置模板；真实 `.env` 不提交。生产环境须设置随机 `JWT_SECRET` 与注册 `INVITE_CODE`。
- OCR 使用服务端 `GLM_API_KEY`。AI 老师配置方式见 `.env.example`；不向前端暴露密钥。
- `data/` 保存数据库，`uploads/` 保存题目图片，`logs/` 保存运行日志；这些目录均排除在 Git 之外。
- GitHub 只用于保存代码。更新服务器时保留原有 `.env`、数据库和上传文件。

## 目录

- `server/`：后端接口、账号、数据库和模型调用。
- `public/`：网页界面与样式。
- `docs/EXAM-199-INFO.md`：考试与功能参考资料。
- `TASK.md`：原始项目任务书。
- `deploy/backup.sh`：现有服务器备份脚本，运行前核对其中的部署路径。

此仓库在已有任务书提交的基础上同步阿里云 `Exam199-Study` 源码，不包含账号数据、错题、图片或真实密钥。
