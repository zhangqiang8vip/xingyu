# 星屿博客：下一位 AI 开发交接说明

> 最后整理：2026-07-24  
> 仓库根目录：`E:\ProjectMyNew\boke`  
> 应用目录：`E:\ProjectMyNew\boke\site`  
> 线上地址：[https://zhangwansen.click/](https://zhangwansen.click/)  
> 最近线上 Worker 版本：`892708e2-2312-4b96-adb7-770b91a59cae`

这是一个可长期运营的个人博客，而不是展示用静态页面。它的核心目标是：用精致的“苹果感”阅读体验承载真实文章；管理员可以在后台用 Markdown 写作、预览和发布；外部 AI 可以通过 MCP 在有审批语义的前提下协助写作。

## 1. 接手时必须遵守的原则

1. **先读现有代码再改视觉。** 用户对细节、间距、动画触发时机和深/浅色一致性很敏感；不要为了“重做”而复制一套前台。
2. **前台、后台预览、写作实时预览必须复用同一套渲染与配色。** 不能为预览另写一个简化页面，否则很快漂移。
3. **文章的稳定身份是 `public_id`，不是 Slug。** 新地址是 `/posts/:publicId/:canonicalSlug`；改标题/Slug 时必须保留历史跳转。
4. **生产环境不能自动写示例文章。** 正式库只会初始化结构、设置、独立页面和默认“随笔”分类。
5. **写入与发布分开。** 创建草稿、更新、发布、撤回均是独立动作；无论后台还是 MCP，都不能默认替用户发布。
6. **每次上线只用 `npm run deploy:production`。** 该命令固定“构建后部署”，禁止直接对旧 `dist` 执行 `wrangler deploy`。
7. **不要把密钥、真实密码或 Token 提交进仓库。** `.env.local`、Cloudflare Secret、Codex 本机环境变量均应保持本地/平台侧管理。

## 2. 技术架构

```text
浏览器
  ├─ 前台：首页 / 文章归档 / 文章详情 / 关于 / 接入
  ├─ 后台：设置 / 文章管理 / 分类 / Markdown 写作工作台
  └─ Codex 等 AI：MCP Streamable HTTP 客户端
          │
          ▼
Cloudflare Worker（`worker/index.ts`）
  ├─ Vinext App Router：页面与 API
  ├─ `/mcp`：`worker/blog-mcp.ts`
  ├─ Edge Cache：公开 HTML 120 秒 + stale-while-revalidate
  ├─ D1：站点设置、文章、分类、搜索、阅读数据、MCP 操作记录
  └─ R2 / Assets：图片、前端构建资源、Vditor 本地资源
```

### 核心技术栈

| 范畴 | 实现 |
| --- | --- |
| 前端/SSR | React 19、Vinext、Vite 8、TypeScript |
| 边缘运行时 | Cloudflare Workers，`nodejs_compat` |
| 数据库 | Cloudflare D1 + Drizzle ORM；搜索使用 SQLite FTS5 trigram |
| 文件 | Cloudflare R2（媒体上传）；Worker Assets（构建产物） |
| Markdown | `react-markdown`、GFM、数学公式、指令块、KaTeX、rehype-highlight、Mermaid |
| 编辑器 | Vditor（只在后台加载，资源置于 `public/vditor/`） |
| MCP | `agents/mcp`、`@modelcontextprotocol/sdk`，Streamable HTTP |
| 部署 | Wrangler，生产配置 `wrangler.production.jsonc` |

## 3. 目录地图

```text
site/
├─ app/
│  ├─ page.tsx                     首页
│  ├─ archive/                     大数据量文章归档
│  ├─ posts/                       文章详情、旧链接重定向、阅读体验
│  ├─ about/ / connect/            可编辑的独立页面
│  ├─ admin/                       管理后台、写作工作台、真实前台预览
│  ├─ api/                         文章、分类、设置、媒体、统计、阅读 API
│  ├─ SiteNavigation.tsx           全站顶部“岛”导航
│  ├─ IslandSearch.tsx             顶部搜索与结果预览
│  ├─ MarkdownRenderer.tsx         唯一的 Markdown 渲染入口
│  ├─ MarkdownMermaid.tsx          本地按需 Mermaid 图表渲染
│  ├─ RouteTransition.tsx          可选翻页/静态切换动效
│  └─ globals.css                  前台、后台、Markdown 的共享主题变量与样式
├─ db/
│  ├─ schema.ts                    Drizzle 表定义
│  ├─ bootstrap.ts                 D1 首次初始化、兼容迁移、FTS 与环境隔离
│  ├─ queries.ts                   首页/归档/后台的读取与 cursor 分页
│  └─ post-write.ts                文章写入、stable ID、Slug 历史
├─ worker/
│  ├─ index.ts                     Worker 入口、缓存、安全响应头、MCP 路由
│  └─ blog-mcp.ts                  MCP 工具、Token 校验、写入审计
├─ public/vditor/                  编辑器本地静态资源，不能移到前台全局加载
├─ tests/rendered-html.test.mjs    源码级回归测试
├─ wrangler.production.jsonc       线上 Worker / D1 / 域名配置
├─ vite.config.ts                  本地开发环境绑定与环境选择
├─ package.json                    本地、测试、生产部署脚本
└─ AI_HANDOFF.md                   本文档
```

## 4. 前台功能与体验边界

### 路由

| 路径 | 职责 |
| --- | --- |
| `/` | 首页：Hero、文章筛选、搜索、精选/最新文章 |
| `/archive` | 文章归档：按年份与分类、Cursor 无限加载、左侧时间导航 |
| `/posts/:slug` | 兼容旧 Slug 链接，永久重定向至稳定地址 |
| `/posts/:publicId/:canonicalSlug` | 文章正式地址；旧 Slug/非规范 Slug 会纠正到 canonical URL |
| `/about` | 关于页，由 `content_pages` 管理 |
| `/connect` | “接入”页，说明如何连接 Codex/MCP |
| `/admin` | 管理后台，必须管理员会话 |
| `/admin/article-preview` | 草稿和未保存内容的真实前台预览入口，仅管理员可访问 |

### 导航、阅读与动效

- 顶部导航统一由 `SiteNavigation.tsx` 管理：Logo、当前页面状态、搜索、主题、阅读方式、动效偏好必须在首页、归档、文章和关于页一致。
- “上岛”是滚动时将关键信息收纳到顶部岛的行为。不要过早隐藏标题；没有空间才收纳，且必须保留可点击回顶能力。
- 文章支持**跳转阅读**和**弹窗阅读**。弹窗模式也必须保有目录、阅读进度、上一篇/下一篇和搜索能力，不能变成阉割版。
- 翻页动效可关闭；用户设备弱或选择静态模式时，不应加载/触发重动画。
- 上一篇/下一篇有悬浮预览，并支持键盘方向键。移动端以长按或触摸友好方式替代 hover。
- 深色与浅色均是一级功能，不是单纯反色；任何新组件先补齐两套 token，再进页面。

## 5. Markdown 与写作工作台

### 唯一渲染链路

所有公开文章、弹窗阅读、后台真实预览、草稿预览都必须使用 `features/markdown/MarkdownRenderer.tsx`。

支持内容包括：

- 标准 Markdown、表格、任务列表、删除线（GFM）
- KaTeX 行内/块级数学
- 受控 HTML（先 `rehypeRaw`，再 `rehypeSanitize`）
- `:::tip`、`:::note`、`:::warning`、`:::quote`、`:::details` 指令块
- 代码块语法高亮、语言标签、右上角悬浮复制
- Mermaid 图表
- 图片、视频、音频及受限的原生 HTML 标签

### Mermaid 的当前决策

- `MarkdownMermaid.tsx` 通过 `import("mermaid")` **本地按需加载**；已经移除 jsDelivr 运行时依赖。
- Mermaid 的全图表能力本身较大：普通文章不下载它，含图表的文章首次打开会下载相应分包。这是“全语法支持”与性能的真实取舍。
- 渲染使用 `securityLevel: "strict"`、`htmlLabels: false`，深浅主题通过 `xingyu:theme-change` 重新绘制。
- 不要为了缩小包直接恢复第三方 CDN；若要进一步优化，优先根据真实文章类型裁剪 Mermaid 图表定义，并做实机性能测试。

### 后台写作

- `ArticleWritingStudio.tsx` 提供代码、分屏、阅读三种模式。
- `VditorEditor.tsx` 用于 Markdown 编辑，前台不应加载其 CSS/JS。
- 预览必须携带当前未保存的 draft，并由 `AdminPreviewBridge.tsx` 注入真实页面外观；切勿用“从数据库重新读取”的简化预览替代。

## 6. 数据模型与大数据量策略

### 关键表

| 表 | 用途 | 关键规则 |
| --- | --- | --- |
| `categories` | 分类名称、Slug、颜色 | 默认分类为 `notes` / “随笔”；不要再引入“未分类”作为默认文案 |
| `posts` | 正文、状态、可见性、浏览量 | `public_id` 与 `slug` 都唯一，但公开身份优先 `public_id` |
| `post_slug_history` | 旧 Slug 到文章的映射 | 修改 Slug 时写入；用于永久重定向 |
| `site_settings` | 首页文案、品牌、SEO、展示条数 | 单例 `id = 1` |
| `content_pages` | `about`、`connect` 的完整内容 | 公开页修改立即生效，需明确确认 |
| `post_views` | 每用户每日阅读去重 | 用 `visitor_hash + viewed_on` 主键去重 |
| `mcp_activity` | MCP 写入回执与审计 | 每次真实 MCP 写入记录操作、字段、摘要、客户端 |
| `app_meta` | Schema 版本、环境身份、FTS 版本 | 禁止手工删改，除非理解迁移逻辑 |
| `admin_login_attempts` | 本地密码登录限流 | 防止暴力尝试 |

### 规模设计

- 首页仅取 `site_settings.home_post_limit` 篇，不会尝试加载所有文章。
- 归档与后台使用 cursor 分页：`updated_at/published_at + id`，不会因 1 万篇文章使用 offset 深翻页。
- 查询达到三字以上时切换至 FTS5 trigram 全文搜索；短查询回退到标题/摘要/Slug 的 `LIKE`。
- 左侧年份导航必须是固定高度、可滚动/可压缩的导航；不能把 1 万篇文章等量渲染成无限刻度。

## 7. 环境、登录和安全

### 三套环境

| 环境 | 启动方式 | 数据 | 使用场景 |
| --- | --- | --- | --- |
| 本地开发 | `npm run dev` | 项目内持久化 development D1/R2 | 日常真实写作与开发 |
| 本地正式预览 | `npm run dev:production` | 独立的本地 production-preview D1/R2 | 检查空库/生产外观 |
| 线上正式 | `npm run deploy:production` | Cloudflare D1 `xingyu-production` 与线上 R2 | 对公众可见 |

`db/bootstrap.ts` 会写入 `app_environment`。若同一个数据库被误接到另一环境，应用会拒绝启动；**不要为了“先跑起来”而删除此保护。**

### 后台登录

- 线上和本地密码登录的基础逻辑在 `app/api/admin-auth.ts` 与 `/api/admin/login`。
- 本地/Worker Secret 至少需要：`ADMIN_PASSWORD`、`ADMIN_SESSION_SECRET`、`MCP_WRITE_TOKEN`。
- 密码尝试受 D1 限流，登录与后台页面设置为 `no-store`，并设置 `noindex`。
- `app/chatgpt-auth.ts` 保留 ChatGPT 平台头部身份集成代码，但公网管理应以已部署的密码会话为可用路径。改动鉴权前先通读 `admin-auth.ts`、`app/admin/login`、`worker/index.ts`。

### Worker 安全与缓存

- `worker/index.ts` 对所有响应补充 `nosniff`、Referrer Policy、Permissions Policy、同源 iframe、HTTPS HSTS。
- `/admin` 和 `/api/admin` 强制 `Cache-Control: no-store`。
- 公开 HTML 使用 Cloudflare Cache：`s-maxage=120`，`stale-while-revalidate=300`。后台/预览/MCP 不得缓存。
- `/mcp` 使用独立 `MCP_WRITE_TOKEN` 的 `Bearer` 校验、constant-time digest 对比、`no-store` 响应，不能复用后台密码。

## 8. MCP：给 AI 的线上写作接口

入口：`https://zhangwansen.click/mcp`

当前工具类别：

- 只读：`list_categories`、`search_posts`、`get_post`、`get_page`、`list_mcp_activity`
- 写入：`create_draft`、`update_post`、`update_page`、`publish_post`、`unpublish_post`

正确工作流：

```text
list_categories → search_posts/get_post → 展示拟修改内容与摘要 → 用户确认
→ create_draft 或 update_post → （用户再次明确要求）publish_post
```

要求：

- `create_draft` 永不自动发布。
- 更新已发布文章、更新公开独立页面、发布、撤回都属于高影响动作，客户端必须要求明确确认。
- 每次真实写入返回 receipt，并写入 `mcp_activity`；内容完全相同的更新不重复写入。
- Codex 配置样例见 `README.md`。Token 仅放入本机环境变量 `XINGYU_BLOG_MCP_TOKEN`，不要复制到仓库。

## 9. 常用命令

在 `site/` 目录执行：

```powershell
# 安装与本地开发
npm install
npm run dev

# 质量检查
npm run lint
npm run typecheck
npm test

# 本地完整检查（含页面、D1、R2）
.\test-local.ps1

# 生产部署：唯一允许的发布命令
npm run deploy:production

# 只校验 Worker 配置与产物，不发布
npx wrangler deploy --dry-run --config wrangler.production.jsonc

# 线上故障排查
npx wrangler tail xingyu-blog --config wrangler.production.jsonc
npx wrangler versions list --config wrangler.production.jsonc
```

生产部署后的最低验证：

```powershell
Invoke-WebRequest -Uri 'https://zhangwansen.click/' -UseBasicParsing
npm audit --omit=dev --registry=https://registry.npmjs.org
```

期望：公开首页 HTTP 200，`npm audit` 为 0 漏洞。若审计再次报出 Next / PostCSS / Sharp / MCP SDK 链路的漏洞，先升级并验证，不要粗暴降级 MCP SDK 或关闭审计。

## 10. 最近完成的安全与交付修复

提交 `73ad42c`（`fix: harden production delivery and markdown assets`）已完成：

1. Next 升至 `16.2.11`，React 升至 `19.2.8`。
2. 通过 `package.json#overrides` 锁定 `postcss@8.5.22`、`sharp@0.35.3`、`@hono/node-server@2.0.11`，生产依赖审计为 **0 漏洞**。
3. Mermaid 从 jsDelivr 外链改成仓库依赖的动态导入。
4. 新增 `deploy:production = npm run build && wrangler deploy --config wrangler.production.jsonc`。
5. 测试增加了“Mermaid 不得回退 CDN”和“生产部署命令必须先构建”的回归断言。

## 11. 已知取舍与后续优先级

### 已知取舍

- Mermaid 全量支持会产生较大的按需资源包。当前 Worker startup 约 70ms，普通无图文章不下载 Mermaid；若用户大量使用复杂图表，应继续做 bundle 分析和按图类型拆分。
- `npm test` 目前是类型检查、生产构建和源码级回归断言；它不能替代真实移动端触摸、弹窗阅读、动效帧率和登录流程的浏览器验收。
- `README.md` 中仍存在早期“Sites”措辞；当前线上真实交付路径以 `wrangler.production.jsonc` + Worker 为准。后续可在不改变部署机制的前提下同步 README 表述。

### 建议下一步

1. 在真实 iOS/Android 尺寸上逐页验收：顶部岛、搜索图标位置、移动导航、弹窗目录、上一篇/下一篇预览。
2. 用浏览器性能工具测量首页、普通文章、Mermaid 文章的 LCP/INP；确认 Mermaid 分包是否需要进一步裁剪。
3. 给核心交互补浏览器级 E2E：密码登录、草稿实时预览、Slug 重定向、MCP 写入审计、弹窗/跳转阅读模式切换。
4. 将 `wrangler` 升级至当前稳定 v4 后做一次单独验证提交；不要与视觉大改混在同一次发布。
5. 如果要改数据结构：先升级 `schemaVersion`，编写兼容 `ALTER/CREATE INDEX/回填`，然后在本地和生产备份上验证；不要只改 `schema.ts`。

## 12. 接手检查清单

- [ ] `git status` 干净，确认当前分支和未推送提交。
- [ ] `npm install && npm test` 通过。
- [ ] 检查 `.env.local` 存在但未提交，且生产 Secret 不出现在日志/代码中。
- [ ] 访问 `/`、`/archive`、`/about`、`/connect`、一篇稳定 ID 文章和 `/admin`。
- [ ] 验证深/浅色、静态/动效、跳转/弹窗阅读均没有布局漂移。
- [ ] 编辑草稿，确认“即时预览”显示当前未保存内容而不是别的文章。
- [ ] 以只读 MCP 工具验证连接；任何公开写入前向用户展示摘要并获得确认。
- [ ] 发布前运行 `npm test` 和 `npx wrangler deploy --dry-run --config wrangler.production.jsonc`。
- [ ] 最终只执行 `npm run deploy:production`，记录 Worker Version ID。

这份交接说明比“重新做一个漂亮博客”更重要：星屿的价值在于内容、链接稳定性、写作流程与细腻的阅读体验同时可持续，而不是某一次视觉截图。
