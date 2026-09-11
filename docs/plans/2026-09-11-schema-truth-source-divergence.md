# XINGYU Schema 真相源分歧报告（PR-02 前置调查）

**日期：** 2026-09-11
**分支：** `scale-readiness`
**性质：** 只读调查。**未修改任何业务代码。**
**目的：** 为 PR-02（迁移单一真相源）确定迁移基线，并回答一个必须先回答的问题：

> `bootstrap.ts` 建出的 schema，与 `drizzle/0000-0008` 累积出的 schema，**是同一个东西吗？**

**答案：不是。而且分歧比预想更严重——真相源有三处，不是两处。**

---

## 1. 调查方法（可复现）

不需要生产库副本即可回答：生产库就是同一份代码建出来的，本地复现等价。

用 wrangler 的 `createTestHarness` 起两个**互相独立**的本地 workerd + D1：

- **harness A**：正常发一次 `GET /`，触发 `ensureDatabase()`，得到**请求期建出的真实 schema**。
- **harness B**：**不发任何请求**（关键——否则预热也会跑 bootstrap），得到空库；按文件名顺序读取 `drizzle/0000`–`0008`，以 `--> statement-breakpoint` 拆分语句逐条执行，得到 **drizzle 累积 schema**。

两侧均用**结构化 PRAGMA 对比**（`table_info` / `index_list` / `index_info` / `sqlite_master`），而非文本对比，避免格式差异干扰。忽略 `sqlite_*`、`_cf_*`、`posts_fts_*` 内部对象。

**两个操作陷阱（会直接导致错误结论）：**

1. **`db.exec()` 按换行符拆分语句**（官方文档："multiple queries separated by `\n`"）。用它执行多行 DDL 会**只执行第一行**，得到 `incomplete input` 并让后续对比全盘失真。必须用 `prepare(statement).run()`。
2. **`openTestHarness()` 里的预热请求会触发 bootstrap**，使"空库"不空，所有 `CREATE` 全部报 `already exists`。

---

## 2. 已确认的三处真相源

| # | 位置 | 是否被执行 | 内容 |
| --- | --- | --- | --- |
| 1 | `db/schema.ts` → `drizzle/0000-0008.sql` | **否**（无任何环节执行） | 大部分表 |
| 2 | `db/bootstrap.ts` | **是**（请求期） | 大部分表 + `admin_login_attempts` |
| 3 | `db/public-cache-schema.ts` | **是**（请求期，被 bootstrap 引用） | `public_cache_state` + **10 个触发器** |

**关键事实：**

- `admin_login_attempts` **只存在于 `bootstrap.ts`**。`db/schema.ts` **没有建模它**，`drizzle/` 也没有它的迁移。
- `public_cache_state` 在 `db/schema.ts` 里**有声明**（第 127 行），但 **`drizzle/` 里没有任何迁移创建它** → 说明 `drizzle/` 相对 `db/schema.ts` **已经过期**（最新 schema 变更后没跑 `db:generate`）。
- 10 个 `public_cache_*` 触发器是 `public-cache-schema.ts` 里的裸 SQL，**既不在 `db/schema.ts`，也不在 `drizzle/`**。

**结论：`drizzle/` 是三者中记录最不完整的一份。**

---

## 3. 差异清单（已逐项复核）

### 3.1 真实差异

| 项 | bootstrap（生产实际） | drizzle | 影响 |
| --- | --- | --- | --- |
| `admin_login_attempts` 表 | **有** | **无** | **严重**：只跑 drizzle 的全新库，登录限流会直接报错（`getAdminLoginLimit` 查此表） |
| `public_cache_state` 表 | **有** | **无** | **严重**：公开缓存版本表缺失 |
| 10 个 `public_cache_*` 触发器 | **有** | **无** | **严重**：公开 HTML 缓存的失效机制失效，会持续返回陈旧页面 |
| `app_meta.key` | `key TEXT PRIMARY KEY`（**允许 NULL**） | `... PRIMARY KEY NOT NULL` | 中：SQLite 历史行为允许非 INTEGER 主键为 NULL，bootstrap 侧更宽松 |
| `oauth_rate_limits.identifier` | `TEXT PRIMARY KEY`（允许 NULL） | `... NOT NULL` | 中：同上 |
| `admin_login_attempts.identifier` | `TEXT PRIMARY KEY`（允许 NULL） | 无此表 | 中：同上 |
| `posts.public_id` | **`NOT NULL`** | **可空** | 中：`public_id` 是文章稳定身份，bootstrap 侧更严格（更正确）。drizzle 侧可空是因为 `public_id` 是后续 `ALTER TABLE ADD` 加入的，当时无法声明 NOT NULL |
| `site_settings` 多列默认值 | `''`（空串） | `'星屿 · 思考与创造'` 等真实文案 | 低：seeded 行有真实值，但"省略该列插入"时行为不同 |

### 3.2 我一度误报、复核后撤回的差异（重要陷阱）

初次对比时，脚本报出 **6 个唯一索引"只存在于 drizzle、bootstrap 缺失"**：

```text
attachments_public_id_uidx / attachments_object_key_uidx
oauth_access_tokens_hash_uidx / oauth_authorization_codes_hash_uidx
oauth_clients_client_id_uidx / oauth_refresh_tokens_hash_uidx
```

**这是误报。** 复核 `bootstrap.ts` 后确认，这些表全部使用了**内联 `UNIQUE`** 约束：

```sql
public_id TEXT NOT NULL UNIQUE
token_hash TEXT NOT NULL UNIQUE
code_hash  TEXT NOT NULL UNIQUE
client_id  TEXT NOT NULL UNIQUE
```

SQLite 会为内联 `UNIQUE` 生成**隐式** `sqlite_autoindex_<table>_<n>`，而对比脚本**主动跳过了 `sqlite_autoindex_*` 名字**，于是把"同一个唯一性、两种索引命名"误判为"缺失"。

**唯一性在生产库中是被强制的，不存在正确性缺口。** 真实差异仅为索引命名（隐式 vs 显式命名）。

> 教训：对比 schema 时必须把隐式索引与显式命名索引按**列组合 + 唯一性**归一化后再比，不能按索引名比。

### 3.3 确认无差异的项（不需要处理）

- `INTEGER PRIMARY KEY AUTOINCREMENT` 列的 `notnull`：PRAGMA 报 bootstrap=0 / drizzle=1，但该列是 rowid 别名，**永不为 NULL**，属 PRAGMA 表现差异，非语义差异。
- `oauth_clients.enabled`（`1` vs `true`）与 `posts.featured`（`0` vs `false`）：SQLite 自 3.23 起把 `true`/`false` 视为 1/0，**语义等价**。

---

## 4. 对 PR-02 的直接影响

### 4.1 不能简单地"改用 drizzle 作为唯一真相源"

若直接把 `drizzle/` 作为真相源并让新环境只跑它，**新库会缺 `admin_login_attempts`、`public_cache_state` 和 10 个触发器**——登录限流报错、公开缓存永不失效。这是**功能级破坏**，不是风格问题。

### 4.2 迁移基线必须按"生产实际 schema"定义，而非按 drizzle 历史

正确顺序是**先对齐、再切换**：

```text
1. 让 db/schema.ts 补全缺失建模
   - 新增 admin_login_attempts（目前完全没有建模）
   - public_cache_state 已有声明，但需确认与 public-cache-schema.ts 的实际 DDL 一致
   - 触发器无法用 Drizzle DSL 表达 → 需作为自定义 SQL 迁移纳入版本管理

2. 生成一份"基线迁移"，其内容 = 当前生产实际 schema（bootstrap 的最终状态）
   - 这样既有的生产库可被标记为"已应用基线"，不会被重复执行
   - 全新库跑基线即得到与生产一致的结构

3. 之后的 schema 变更只走 drizzle generate

4. 加一个 CI 步骤：把 drizzle 迁移应用到空库，再与 bootstrap 期建库做结构化对比，
   差异数必须为 0 —— 让分歧不可能再悄悄出现
```

### 4.3 既有生产库的升级安全（最高风险点）

- 生产库由 bootstrap 建出，其结构与 drizzle 历史**不一致**（见 §3.1）。
- 直接对生产库 `wrangler d1 migrations apply` **不安全**。生产库的 `d1_migrations` 表是空的（从未跑过迁移），因此 wrangler 会**从 0000 开始重放全部迁移**，而第一条 `CREATE TABLE categories` 就会以 `table categories already exists` 失败——实测已复现这一错误类别。
- 即使绕过 `CREATE TABLE`，后续的 `ALTER TABLE posts ADD space_id` 也会以 `duplicate column name` 失败（实测复现）。也就是说，drizzle 的迁移历史**无法重放于生产库**。
- 因此**必须**先在生产库副本上验证迁移幂等性（第 4.2 步的"基线"正是为此设计）。
- 建议同时加 `app_meta` 中的基线标记，让迁移逻辑能识别"这是既有库还是全新库"。

### 4.4 `ensureDatabase()` 的收敛目标

切换完成后，`ensureDatabase()` 只应保留：

- binding 是否存在
- 环境身份是否正确（保留现有"串库拒绝启动"保护）
- schema 版本是否满足最低要求 → **不满足则 fail fast**

**禁止再在用户请求里改 schema。** 但注意：`public-cache-schema.ts` 的触发器也走请求期，必须一并迁移出去。

---

## 5. 结论

1. **P0-2 的严重性得到实测确认，且比初判更高**：真相源是**三处**，`drizzle/` 是最不完整的一份，甚至无法重建生产库。
2. **不存在"唯一索引缺失"导致的正确性缺口**——唯一性由内联 `UNIQUE` 保障，初次误报已撤回。
3. **PR-02 的第一步不是"接入 drizzle"，而是"先补齐 `db/schema.ts` 建模 + 建立与生产实际一致的基线迁移"**，否则会把一个不可用的 schema 扶正为唯一真相源。
4. **生产库升级必须先在副本上验证幂等**，因为 drizzle 历史与生产实际结构不一致（`ALTER TABLE ... ADD` 类语句会直接失败）。
