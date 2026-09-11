# XINGYU 规模化路线图（最大做强）

**日期：** 2026-09-11
**分支：** `feat/scale-readiness`
**范围：** `site/` 全部源码（135 个 ts/tsx，10813 行）
**方法：** 只读审查 + 对每条 P0 结论做代码验证 + 对依赖的技术前提做官方文档验证
**目标形态：** 从"一个写得很好的个人应用"升级为"多人、多 Agent、高流量下依然不会乱数据、不会误授权、不会因为一次重构失控的模块化单体"
**状态：** 本文件为规划，**尚未修改任何业务代码**

---

## 0. 验证结论（本文件与初版的关键差异）

初版清单（8 条）方向正确，但更像一次代码审查。补充复核后，**新增 2 个 P0 结构问题，且均已通过代码验证属实**：

| 新发现 | 验证结果 | 关键证据 |
| --- | --- | --- |
| **P0-2 数据库迁移双轨制** | **属实，比描述更严重** | `deploy:production` 仅 `build && wrangler deploy`；`wrangler.production.jsonc` 无 `migrations_dir`；`bootstrap.ts` 在请求期手写 13+ `CREATE TABLE` / 16+ `CREATE INDEX`；`ensureDatabase()` 被 **10 个请求路径**调用 |
| **P0-3 核心写入非原子** | **属实** | `db/post-write.ts:132` 存在提示语 `"文章已保存，但附件关联失败；请再次保存完成关联"` —— 系统自己承认允许半成功状态 |

### 一处自我纠正

初版称 `AI_HANDOFF.md`"最后更新 2026-09-01"——那是**文件系统 mtime**。文档**自己的头部写的是"最后整理：2026-07-24"**。以文档自述为准，它比所述更陈旧。判断文档新鲜度应读头部声明，而非 mtime。

### 已验证的技术前提（方案立论基础）

1. **`wrangler d1 migrations apply / list / create` 确实可用**（本地 wrangler 4.130.0 实测）。
2. **`batch()` 就是事务原语**。Cloudflare 官方文档（最后更新 2026-06-22）原文：
   > "Batched statements are SQL transactions. If a statement in the sequence fails, then an error is returned for that specific statement, and it aborts or rolls back the entire sequence."
3. **D1 的 Worker API 没有交互式事务**——没有 `BEGIN` / `COMMIT`，只有 `batch()`。**这条约束会改变修复方案的设计**（见 P0-3）。
4. 项目**本来就会用原子写**：`db/spaces.ts:236`、`db/spaces.ts:272` 已使用 `env.DB.batch([...])`。**能力存在，只是没用在文章写入上**——与"限流能力存在但没用在公开接口上"是同一类问题。

---

## 1. 最终优先级

排序原则：**变更安全 → 数据正确性 → 身份与权限 → 公网抗滥用 → 安全纵深 → 代码一致性**。

| 优先级 | 项目 | 与初版关系 |
| --- | --- | --- |
| **P0-1** | 请求级契约测试 + CI | 原 A2 + A3 合并 |
| **P0-2** | 迁移单一真相源，退出请求路径 | **新发现** |
| **P0-3** | 文章写入原子化 + 乐观并发 | **新发现** |
| **P0-4** | 正式 identity / ownership 模型 | 原 A1 升级 |
| **P0-5** | 公网限流 + 浏览量体系重构 | 原 B1 升级 |
| **P1-1** | CSP（Report-Only → enforce） | 原 B2 |
| **P1-2** | 数据约束 / 审计 / 运维门禁 | 随规模建立 |
| **P2** | services / import / 文档 / 原型清理 | 原 C1–C3 |

**P0-1 ～ P0-5 全部完成前，不进行大规模功能扩张。**

---

## 2. P0-1 · 请求级契约测试 + CI

### 正名

不是"测试很差"，而是：**缺少能证明安全边界的请求级契约测试。**

项目**并非没有真实测试**：`mcp-read.test.mjs` 直接执行真实函数，PKCE 测试真的调用 `verifyS256()`。问题在于**最危险的鉴权边界仍靠源码文本存在性证明**——`rendered-html.test.mjs` 读取生产源码后 `assert.match(source, /isAdminRequest/)`、`assert.match(source, /requireScope/)`。

### 处置

**保留现有源码级测试**——它们对架构约束（如"生产不得自动写示例文章"）仍有价值，只是不能当作安全证明。**新增一个 integration 层**：

1. `/api/posts`：anonymous → 401；admin → 成功**且 D1 真落库**。
2. `/mcp`：坏 token → 401；read scope 调 write tool → **必须拒绝**。
3. `/admin`：anonymous → 登录/拒绝。
4. **发布后公开 GET 可读；private space 文章公开 GET 永远读不到。**

第 4 条价值最高——它同时覆盖"发布语义"与"公开/私密读取边界"。

### CI 固定流水线

```text
lint → typecheck → integration → build
```

现状：仓库无 `.github/`，`deploy:production` 只是 build 后 deploy。

**这是所有后续 P0 的前置条件。**

---

## 3. P0-2 · 迁移单一真相源

### 问题

当前存在**两套并行的 schema 真相源**：

```text
db/schema.ts ──→ drizzle/0000-0008.sql        （生成链路，无人执行）
db/bootstrap.ts ──→ 手写 CREATE TABLE / INDEX （运行时执行，真正生效）
```

`ensureDatabase()` 在**请求生命周期内**做：检查 `app_meta.schema_version` → 不符则 `CREATE TABLE` → 建索引 → `PRAGMA table_info` → 必要时 `ALTER TABLE` → 数据 backfill → FTS rebuild → 写版本号。

而它被 **10 个请求路径**调用，包括每个 MCP 请求、OAuth token 请求、`/api/views` 请求。

### 风险

两个人分别改 `schema.ts` 和 `bootstrap.ts` 时极易出现：本地 schema 对、migration 对、新环境对，**但老生产库升级错**。规模化后这是最难排查的一类故障，且一旦出错影响的是数据本身。

### 目标

```text
db/schema.ts
    ↓
versioned migrations（drizzle/ 直接接入）
    ↓
CI 验证
    ↓
deploy-time migration（wrangler d1 migrations apply）
    ↓
application rollout
```

`ensureDatabase()` 最终**只做**：
- binding 是否存在
- environment 是否正确（保留现有"串库拒绝启动"保护）
- schema version 是否满足最低要求
- **不满足则 fail fast**

**禁止再在用户请求里改 schema。**

### 实施要点（已按前置调查修正）

前置调查见 `docs/plans/2026-09-11-schema-truth-source-divergence.md`，结论改变了实施方式：

- **不能**把现有 `drizzle/` 直接接入作为唯一真相源——它无法从空库重建可运行的数据库（缺 `admin_login_attempts`、`public_cache_state`、10 个 `public_cache_*` 触发器）。
- **不能**就地升级老生产库：生产库 `d1_migrations` 为空，重放会从 0000 开始并在首条 `CREATE TABLE` 失败。
- **禁止**"把老库标记为基线已应用"、手工改 `d1_migrations`、或用 `app_meta` 伪装迁移已执行。
- 采用 **Blue/Green D1**：先补齐 `db/schema.ts` 建模与迁移链，再用 `xingyu-production-v2` 新库完成切换，见分歧报告第 5 节的 Phase A–I。
- **生产 export 是 cutover 前置条件**；本地结论只证明"当前代码想要的运行期 schema"，不能替代真实生产 D1 的 schema/export 验证。

这是本路线图中**风险最高**的一步，建议单独 PR、单独验证、可回滚。

---

## 4. P0-3 · 文章写入原子化

### 问题

`createPostRecord`（`db/post-write.ts:41-67`）：

```text
INSERT posts
→ bindAttachmentsOrThrow()      ← 非原子
```

`updatePostRecord`（`db/post-write.ts:83-129`）：

```text
查旧 slug
→ INSERT post_slug_history
→ UPDATE posts
→ bindAttachmentsOrThrow()      ← 非原子
```

第二步失败时，代码主动返回：**"文章已保存，但附件关联失败；请再次保存完成关联"**（`db/post-write.ts:132`）——系统明确允许半成功状态。

### 规模化后的后果

单人写作时只是偶发麻烦；多人 / AI agent / 自动发布 / 并发编辑一上来会变成：
- slug history 已写，文章未改
- 文章已成功，附件未绑定
- 客户端 retry 导致部分步骤重复执行
- 两个编辑者同时保存产生 **lost update**
- **"接口报错"不等于"没有修改数据"**

这会直接破坏 API / MCP 的写入语义。

### 标准

> **成功 = 所有数据库状态完成。失败 = 数据库保持原状态。**

### 方案（受第 0 节约束 3 影响）

**关键约束：D1 Worker API 没有交互式事务**，只有 `batch()`。因此：

- **能收进 `batch()` 的必须收进去**：`posts` 写入 + `post_slug_history` + `attachment` 归属/绑定 + 相关 metadata，作为**一个原子数据库写入单元**。
- **跨存储（R2）不做 ACID**，继续用现有补偿策略。
- **"先查后写"的竞态无法靠事务消除**。`getWritablePost` → 检查 → 写入之间存在 TOCTOU 窗口，而 D1 无法持有跨读写的锁。**正确解法是让数据库用唯一约束强制**，代码只负责把约束冲突翻译成 409，而不是靠"先查一遍"来保证。这意味着 `post_slug_history.slug` 的唯一约束要真正承担正确性责任。

### 乐观并发

给 `posts` 增加 `version INTEGER NOT NULL DEFAULT 1`：

```sql
UPDATE posts SET ..., version = version + 1 WHERE id = ? AND version = ?
```

`0 rows affected` → `409 Conflict`。这样两个管理员 / AI 同时改一篇文章不会静默覆盖。

---

## 5. P0-4 · 正式 identity / ownership 模型

### 问题

`posts`（`db/schema.ts:27-54`）**完全没有主体归属**：字段为 `id, publicId, title, slug, excerpt, content, categoryId, spaceId, status, featured, viewCount, publishedAt, createdAt, updatedAt`。

同时当前 admin identity 本质是：
```ts
{ displayName: "星屿管理员", email: "password-admin" }
```
**不是持久化的用户实体。** `.env.example` 的 `ADMIN_EMAILS` 只是配置，不是 domain identity。

### 目标底座

```text
users              id, email, display_name, status, created_at
site_memberships   user_id, role (owner/admin/editor/author)
posts              author_id, created_by, updated_by
```

**`author_id` / `created_by` / `updated_by` 一开始就分开**——它们以后不是一回事。

### 分阶段（不可跳步）

```text
1. users + memberships
2. posts 增 nullable author_id / created_by / updated_by
3. 回填历史数据
4. 新写入 dual-write
5. 验证无 NULL
6. 再加 NOT NULL / FK / index
7. 最后才开放"作者只能改自己的"权限
```

一次建立 identity primitive 后，多作者、RBAC、投稿、作者主页、审计、多 AI 身份、API token ownership 均可自然长出。**不要半年后从 `author_id` 二次重构成真正的 users。**

---

## 6. P0-5 · 公网限流 + 浏览量体系重构

### 问题

`app/api/views/[slug]/route.ts`：公开 POST、无需登录、**无限流**、每次 2 次 D1 写入。去重键 `sha256(payload.visitor)` 中 `visitor` 由**客户端任意提供**（≤160 字符），无服务端秘密——换个字符串即一次新"访客"。

`post_views` 主键 `(post_id, visitor_hash, viewed_on)` 且无 retention，是**持续增长的高基数事件表**。

### 三层防护

```text
Cloudflare edge / WAF / rate-limit
        ↓
应用级 abuse guard（复用已有的 admin_login_attempts / oauth_rate_limits 模式）
        ↓
D1 唯一性约束
```

visitor key 改为：
```text
HMAC(rotating_server_secret, coarse_client_identity + date)
```
**不接受客户端直接声明自己的唯一身份。**

### Retention

```text
post_views 原始事件：保留 30/90 天
posts.view_count / 日聚合：长期保存
```
否则流量越成功，事件表越大。

---

## 7. P1

### P1-1 CSP

Worker 已设置 nosniff / Referrer-Policy / Permissions-Policy / X-Frame-Options / HSTS，**缺 CSP**。项目含 Markdown raw HTML、Mermaid、KaTeX、Vditor、管理后台。

路线：`Report-Only → 收集 violation → 修资源来源 → nonce/hash → enforce`。

**不要长期保留 `script-src 'unsafe-inline' 'unsafe-eval' *`**——那等于把 CSP 的价值抹掉。

### P1-2 数据约束 / 审计 / 运维门禁

随规模建立：DB 层约束补齐、统一 change/audit metadata、关键指标告警。项目已有 `observability: enabled` 与 `Server-Timing`，是良好起点。

---

## 8. P2 · 一致性清理

### C1 `server/services/` 半吊子分层

全仓库仅 **6 处**引用（`admin-posts`、`categories`、`site-content`）；其余路由与 MCP 工具直接 import `db/*`（`worker/mcp/*` 有 14+ 处）。

**采纳方案 A**：承认 `db/*.ts` 事实上就是服务层（`db/post-write.ts` 已是写入核心），把三个模块的独特逻辑并入对应 `db/` 模块，删除 `server/services/`。

**不要为"大项目感"人为造 service layer。当前 modular monolith 是对的。做大 ≠ 多层。** 当某个 use case 真需要 auth / transaction / audit / event / permissions 时，再建立 application 层。别把所有 `db/*` 包一层一行函数。

### C2 导入路径

机械统一即可：**跨 feature/domain/server/db 边界用 alias，模块内部用 relative**。

`app/api/admin-auth.ts` 不是路由而是共享库，却被 **19 处**引用（含 `app/admin/*` 页面），应迁至 `server/auth/`。

### C3 文档与原型

- `AI_HANDOFF.md` 头部自述"最后整理：2026-07-24"，目录图仍把 `SiteNavigation.tsx`、`MarkdownRenderer.tsx` 等写在 `app/`（实际已迁至 `features/navigation/`、`features/markdown/`）。
- 根目录 `index.html` / `article.html` 仍在，站名仍为"林屿"（现站名"星屿"）。

不影响线上数据，故 P2。

---

## 9. 执行计划：8 个 PR

**不要一个超级 PR 全干。**

| PR | 内容 |
| --- | --- |
| **PR-01** | CI + 4 条请求级安全集成测试 |
| **PR-02** | 迁移单一真相源；deploy 显式 migrate |
| **PR-03** | 文章写入原子化 + 乐观并发 |
| **PR-04** | users / memberships / ownership + 数据回填 |
| **PR-05** | 公网 abuse guard + view identity + retention/aggregation |
| **PR-06** | CSP Report-Only → enforce |
| **PR-07** | DB 约束、统一 change/audit metadata、关键指标告警 |
| **PR-08** | services / import / AI_HANDOFF / 原型清理 |

**第一刀：PR-01。第二刀不是 `author_id`，而是把数据库迁移与写入原子性收干净（PR-02 / PR-03）。**

---

## 10. 明确不要做的事

**不要拆微服务。不要换数据库。不要上 Redis。不要上消息队列。不要 GraphQL 化。不要重做前端架构。不要重写 `domain/`。**

项目已有且应当保留：edge HTML cache、FTS5、cursor pagination、R2、精确复合索引（`posts` 10 个游标索引）、domain isolation、共享 `post-write`、OAuth / scope、public/private read boundary、revision-based edge cache、生产 observability。

**XINGYU 缺的不是"更重的架构"，而是"更强的正确性控制面"。**

---

## 附 · 已确认健康的部分

| 项目 | 证据 |
| --- | --- |
| `domain/` 层真正纯净 | 全目录唯一非相对 import 是 `#domain/admin/location`（域内引用） |
| 前后台包体边界干净 | 前台页面均不引用 `features/admin` / `admin-auth` / `db/admin-session` |
| 写入核心共享 | 后台与 MCP 都走 `db/post-write.ts`；slug 归一化统一走 `domain/posts/post-input` 的 `slugify`；`public_id` 与 slug 历史无重复实现 |
| 索引设计优秀 | `posts` 10 个精准复合索引，与游标分页一一对应；`spaces` 使用 `WHERE parentId IS NULL` 部分唯一索引 |
| 鉴权防护扎实 | 登录有失败计数 + 窗口 + 锁定 + 429/Retry-After + Origin 校验（`app/api/admin-auth.ts:118-139`）；scrypt(N=16384) / pbkdf2-sha256（迭代 ≥210000）；会话 HMAC-SHA256 |
| OAuth 完整 | PKCE、授权码、refresh token、scope 策略、限流齐备（`worker/oauth/`） |
| 已有原子写能力 | `db/spaces.ts:236`、`db/spaces.ts:272` 已用 `env.DB.batch([...])` |
| API 路由薄 | 23 个路由共 827 行，平均约 36 行 |
| 代码卫生 | **零** TODO/FIXME/HACK；最大源文件 419 行 |
