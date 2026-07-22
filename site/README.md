# 星屿博客

星屿是一个运行在 Vinext 与 Cloudflare Workers 上的个人博客。前台包含首页、文章归档、文章阅读和关于页；后台负责站点设置、文章、分类、Markdown 实时写作与真实前台预览。

## 本地开发

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

本地地址固定为 `http://127.0.0.1:3000`，避免系统代理影响 localhost 访问。

### 开发与正式环境

- `npm run dev` 使用 `development` 环境和项目内持久化的本地 D1/R2。这里可以持续撰写真文章，重启服务不会丢失。
- `npm run dev:production` 使用另一套独立的本地正式环境预览库，首次打开没有文章，用于检查空站效果。
- 正式部署默认使用 `production` 环境，由 Sites 绑定独立的线上 D1/R2。部署只发布代码，不会上传 `.wrangler` 中的开发文章。
- 两套数据库都会记录自己的环境身份；如果误把同一个数据库绑定到另一环境，应用会拒绝启动，避免串库。

正式环境只初始化表结构、站点设置、关于页和“未分类”，不会自动写入示例文章。文章只有在对应环境的后台发布后才会出现。

## 验证

```bash
npm run lint
npm run typecheck
npm test
```

`npm test` 会执行生产构建和源码回归测试。需要同时验证本地页面、D1 和 R2 上传时，可运行：

```powershell
.\test-local.ps1
```

## 项目结构

- `app/`：页面、交互组件、后台和 API。
- `db/`：D1 表结构、初始化与查询。
- `drizzle/`：数据库迁移记录。
- `public/vditor/`：Markdown 编辑器在本地加载的运行资源。
- `.openai/hosting.json`：Sites 使用的 D1 与 R2 绑定声明。

## 数据与安全

- 正式环境的后台身份来自 Sign in with ChatGPT，并由服务端执行管理员校验。
- 本地开发可使用 `.env.local` 中的开发凭据；环境文件不会提交。
- 文章、分类、站点设置和页面内容保存在 D1，图片保存在 R2。
- `ensureDatabase()` 在 Worker 实例内复用初始化结果，并在临时连接失败后允许重试。
