# 星屿博客

星屿是一个运行在 Vinext 与 Cloudflare Workers 上的个人博客。前台包含首页、文章归档、文章阅读和关于页；后台负责站点设置、文章、分类、Markdown 实时写作与真实前台预览。

## 本地开发

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

本地地址固定为 `http://127.0.0.1:3000`，避免系统代理影响 localhost 访问。

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
