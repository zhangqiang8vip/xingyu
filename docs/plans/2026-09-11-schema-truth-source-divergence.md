# XINGYU Schema 真相源分歧报告（PR-02 前置调查）

**日期：** 2026-09-11
**分支：** `scale-readiness`
**性质：** 只读调查。**未修改任何业务代码。**
**目的：** 为 PR-02（迁移单一真相源）确定迁移基线，并回答一个必须先回答的问题：

> `bootstrap.ts` 建出的 schema，与 `drizzle/0000-0008` 累积出的 schema，**是同一个东西吗？**

**答案：不是。而且分歧比预想更严重——真相源有三处，不是两处。**

> **本报告的结论边界（重要）**
>
> 本报告证明的是：**当前代码希望得到的运行期 schema**，与 drizzle 迁移历史所描述的结构，两者不一致。
>
> 它**不能**证明真实生产 D1 没有历史漂移、旧版本遗留或手工改动。生产库经历过多个版本的 `ensureDatabase()` 迭代，其实际结构未必等于"今天这份 bootstrap 代码在空库上的结果"。
>
> 因此 **PR-02 切换前必须对真实生产 D1 做 schema / export 验证**（见第 5 节 Phase A）。本地结论只能用来指导迁移链的重建，不能替代生产验证。

---

## 1. 调查方法（可复现）

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

### 4.2 迁移链必须能从空库完整重建结构

唯一真相源必须满足这条硬标准：

```text
空数据库
+
migration history
=
可以运行完整 XINGYU 的数据库
```

禁止依赖 `GET /`、`ensureDatabase()` 或 `public-cache-schema.ts` 的请求期 DDL 才能让数据库可用。

迁移链必须能建立（当前遗漏的部分）：

```text
admin_login_attempts
public_cache_state
全部 public_cache_* triggers（10 个）
所有当前正式表
所有正式 index
所有 uniqueness
所有需要保留的 FTS 对象
当前 schema 所需的 backfill / invariant
```

配套工作：

```text
1. 让 db/schema.ts 补全缺失建模
   - 新增 admin_login_attempts（目前完全没有建模）
   - public_cache_state 已有声明，需确认与 public-cache-schema.ts 的实际 DDL 一致
   - 触发器无法用 Drizzle DSL 表达 → 作为自定义 SQL 迁移纳入版本管理

2. 之后的 schema 变更只走 drizzle generate

3. 加一个 CI 步骤：把迁移应用到空库，再与请求期建库做结构化对比，
   差异数必须为 0 —— 让分歧不可能再悄悄出现
```

### 4.3 既有生产库不能就地升级（最高风险点）

- 生产库由 bootstrap 建出，其结构与 drizzle 历史**不一致**（见 §3.1）。
- 直接对生产库 `wrangler d1 migrations apply` **不安全**。生产库的 `d1_migrations` 表是空的（从未跑过迁移），wrangler 会**从 0000 开始重放全部迁移**，第一条 `CREATE TABLE categories` 即以 `table categories already exists` 失败——实测已复现。
- 即使绕过 `CREATE TABLE`，后续的 `ALTER TABLE posts ADD space_id` 也会以 `duplicate column name` 失败（实测复现）。drizzle 的迁移历史**无法重放于生产库**。

**因此不采用"就地升级老库"的路线**，改为第 5 节的 Blue/Green 新建库。

### 4.4 明确禁止的做法

```text
禁止：把老生产库标记为"baseline 已应用"
禁止：手工修改 d1_migrations 表
禁止：用 app_meta 伪装某条 Wrangler migration 已执行
```

`app_meta` **只能**继续用于**应用自己的 schema compatibility 检查**（例如运行环境身份、schema 版本下限），**不能**代替 `Wrangler d1_migrations` 来表示迁移执行状态。

```text
禁止：在切换完成并验证稳定之前，删除 request-time schema mutation
```

### 4.5 `ensureDatabase()` 的收敛（放到最后一步）

切换并验证稳定之后，`ensureDatabase()` 才收缩为：

- binding 是否存在
- 环境身份是否正确（保留现有"串库拒绝启动"保护）
- schema 版本是否满足最低要求 → **不满足则 fail fast**

**禁止再在用户请求里改 schema。** `public-cache-schema.ts` 的触发器同样走请求期，必须一并迁出去。

这一步在 Blue/Green 中是 **Phase I**，不是开头。

---

## 5. PR-02 实施方案：Blue/Green D1

### 5.1 目标结构

```text
xingyu-production        当前生产库，暂时保持不动（Blue）
xingyu-production-v2     migration-first 新生产库（Green）
```

切换靠**改 Worker D1 binding**，不靠就地改老库。

### 5.2 实施阶段

| 阶段 | 内容 |
| --- | --- |
| **A** | 获取真实生产库 export（数据 + 单独一份 schema export） |
| **B** | 让 migration chain 从空 D1 完整创建全部 schema |
| **C** | 将 migration 建出的 schema 与真实生产 schema 做结构化比较 |
| **D** | 将生产数据导入 `production-v2` |
| **E** | 校验：row count / unique / foreign key / slug / publicId / cache / OAuth / 文章 smoke test |
| **F** | 短暂冻结写入，执行最终增量同步或最终重新导入 |
| **G** | 修改 Worker D1 binding 指向 `production-v2` |
| **H** | 生产 smoke test |
| **I** | 确认稳定后，才把 `ensureDatabase()` 收缩成只检查不迁移 |

### 5.3 生产 export 是切换前置条件

不再把"是否有生产副本"当作设计选择。**正式 cutover 前必须有真实 production export。**

```bash
wrangler d1 export xingyu-production --remote --output=<安全的本地路径>
wrangler d1 export xingyu-production --remote --no-data --output=<安全的本地路径>
```

安全要求：

```text
数据库导出文件绝对不能提交 Git
绝对不能放进 docs/
绝对不能 push 到远端
```

若当前环境没有 Cloudflare 登录权限：可以**继续做 PR-02 的代码侧 migration reconstruction 工作**，但**禁止执行生产切换**。

### 5.4 验收

```text
空库 + migration history = 可运行完整 XINGYU 的数据库
migration schema 与真实生产 schema 的结构化差异 = 0（或对每一处差异有书面解释）
数据校验（Phase E）全部通过
Worker 切到 v2 后生产 smoke test 通过
```

---

## 6. 结论

1. **P0-2 的严重性得到实测确认，且比初判更高**：真相源是**三处**，`drizzle/` 是最不完整的一份，无法重建可运行的数据库。
2. **不存在"唯一索引缺失"导致的正确性缺口**——唯一性由内联 `UNIQUE` 保障，初次误报已撤回。
3. **PR-02 采用"先对齐、再切换"，但不是"标记基线已应用"**：先补齐 `db/schema.ts` 建模与迁移链，再用 **Blue/Green 新建库**完成切换，不就地升级老库。
4. **生产 export 是 cutover 的前置条件**，且本报告只证明"当前代码想要的运行期 schema"，不能证明真实生产 D1 无历史漂移。
