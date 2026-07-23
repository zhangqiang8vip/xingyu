import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { slugify, type PostPayload } from "../app/api/posts/post-input";
import { getDb } from "../db";
import { ensureDatabase } from "../db/bootstrap";
import { listMcpActivity, recordMcpActivity, recordMcpPageActivity, type McpActivityAction } from "../db/mcp-activity";
import { createPostRecord, getWritablePost, PostWriteError, updatePostRecord } from "../db/post-write";
import { getContentPage, listAdminPosts } from "../db/queries";
import { categories, contentPages } from "../db/schema";

const MCP_PATH = "/mcp";
const IDENTIFIER_SCHEMA = z.string().trim().min(1).max(180)
  .describe("文章的稳定 public_id、当前 slug 或后台数字 ID");
const CATEGORY_SCHEMA = z.string().trim().min(1).max(100)
  .describe("分类 slug 或分类名称；不确定时先调用 list_categories");
const CHANGE_SUMMARY_SCHEMA = z.string().trim().min(1).max(300)
  .describe("展示在权限确认和操作记录中的中文变更摘要，例如“补充部署章节并修正文末链接”");
const RECEIPT_OUTPUT_SCHEMA = z.object({
  action: z.string(),
  activity_id: z.number().nullable(),
  summary: z.string(),
  changed_fields: z.array(z.string()),
  recorded_at: z.string().nullable(),
});

type ToolPayload = Record<string, unknown>;

function toolResult(payload: ToolPayload, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    ...(isError ? { isError: true } : {}),
  };
}

function toolFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "操作失败";
  return toolResult({ ok: false, error: message }, true);
}

function publicPostUrl(origin: string, post: { publicId: string; slug: string }) {
  return `${origin}/posts/${post.publicId}/${post.slug}`;
}

async function recordActivitySafely(input: Parameters<typeof recordMcpActivity>[0]) {
  try {
    return await recordMcpActivity(input);
  } catch (error) {
    console.error(JSON.stringify({
      event: "mcp_activity_write_failed",
      action: input.action,
      publicId: input.post.publicId,
      error: error instanceof Error ? error.message : String(error),
    }));
    return null;
  }
}

async function recordPageActivitySafely(input: Parameters<typeof recordMcpPageActivity>[0]) {
  try {
    return await recordMcpPageActivity(input);
  } catch (error) {
    console.error(JSON.stringify({
      event: "mcp_page_activity_write_failed",
      action: "update_page",
      slug: input.slug,
      error: error instanceof Error ? error.message : String(error),
    }));
    return null;
  }
}

function changedPostFields(
  current: Awaited<ReturnType<typeof hydratePost>>,
  next: {
    title: string;
    slug: string;
    excerpt: string;
    content: string;
    categoryId: number;
    featured: boolean;
  },
) {
  return [
    current.title !== next.title ? "title" : null,
    current.slug !== next.slug ? "slug" : null,
    current.excerpt !== next.excerpt ? "excerpt" : null,
    current.content !== next.content ? "content_markdown" : null,
    current.categoryId !== next.categoryId ? "category" : null,
    current.featured !== next.featured ? "featured" : null,
  ].filter((field): field is string => field !== null);
}

function activityReceipt(
  action: McpActivityAction,
  activity: Awaited<ReturnType<typeof recordActivitySafely>>,
  summary: string,
  changedFields: string[],
) {
  return {
    action,
    activity_id: activity?.id ?? null,
    summary,
    changed_fields: changedFields,
    recorded_at: activity?.createdAt ?? null,
  };
}

async function resolveCategory(reference?: string) {
  await ensureDatabase();
  const db = getDb();
  if (!reference) {
    const rows = await db.select().from(categories).orderBy(categories.id).limit(1);
    if (!rows[0]) throw new PostWriteError("还没有可用分类，请先在后台创建分类");
    return rows[0];
  }
  const rows = await db.select().from(categories)
    .where(or(eq(categories.slug, reference), eq(categories.name, reference)))
    .limit(1);
  if (!rows[0]) throw new PostWriteError(`找不到分类“${reference}”，请先调用 list_categories`);
  return rows[0];
}

async function hydratePost(identifier: string) {
  const post = await getWritablePost(identifier);
  if (!post) throw new PostWriteError("文章不存在", 404);
  return post;
}

function createBlogMcpServer(origin: string, clientLabel: string) {
  const server = new McpServer(
    { name: "xingyu-blog-writer", version: "1.0.0" },
    {
      instructions: [
        "这是星屿博客的线上写作 MCP。默认先用 create_draft 创建草稿；只有用户明确要求上线时才调用 publish_post。",
        "修改前先用 get_post 读取最新版，稳定 public_id 是首选标识。正文使用 Markdown。",
        "不要假设分类存在，必要时先调用 list_categories。update_post 不改变发布状态；发布和撤回分别使用独立工具。",
        "独立页面先用 get_page 读取；update_page 会立即改变公开页面，必须先展示变更字段和摘要并获得用户确认。",
        "调用任何写入工具前，先向用户说明文章标题、当前状态、将修改的字段与 change_summary；不要替用户默许发布或撤回。",
      ].join(" "),
    },
  );

  server.registerTool("list_categories", {
    title: "列出文章分类",
    description: "读取线上博客的全部可用分类。创建文章前可用它确认 category 参数。",
    inputSchema: {},
    outputSchema: { ok: z.boolean(), categories: z.array(z.object({
      id: z.number(), name: z.string(), slug: z.string(), color: z.string(),
    })).optional(), error: z.string().optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => {
    try {
      await ensureDatabase();
      const rows = await getDb().select({
        id: categories.id, name: categories.name, slug: categories.slug, color: categories.color,
      }).from(categories).orderBy(categories.id);
      return toolResult({ ok: true, categories: rows });
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("search_posts", {
    title: "搜索文章",
    description: "按标题、摘要、Slug 或正文全文搜索线上文章，也可筛选草稿、已发布文章与分类。",
    inputSchema: {
      query: z.string().trim().max(200).optional().default(""),
      status: z.enum(["all", "draft", "published"]).optional().default("all"),
      category: z.string().trim().max(100).optional().default("all"),
      cursor: z.string().max(180).optional(),
      page_size: z.number().int().min(1).max(50).optional().default(20),
    },
    outputSchema: {
      ok: z.boolean(),
      posts: z.array(z.record(z.string(), z.unknown())).optional(),
      next_cursor: z.string().nullable().optional(),
      error: z.string().optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ query, status, category, cursor, page_size }) => {
    try {
      const result = await listAdminPosts({
        query, status, category, cursor, limit: page_size,
      });
      const summaries = result.rows.map((post) => ({
        public_id: post.publicId,
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        status: post.status,
        category: post.categoryName,
        featured: post.featured,
        published_at: post.publishedAt,
        updated_at: post.updatedAt,
        public_url: post.status === "published" ? publicPostUrl(origin, post) : null,
      }));
      return toolResult({ ok: true, posts: summaries, next_cursor: result.nextCursor });
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("get_post", {
    title: "读取文章",
    description: "读取一篇文章的完整 Markdown、元数据和发布状态。更新文章前应先调用。",
    inputSchema: { identifier: IDENTIFIER_SCHEMA },
    outputSchema: { ok: z.boolean(), post: z.record(z.string(), z.unknown()).optional(), error: z.string().optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ identifier }) => {
    try {
      const post = await hydratePost(identifier);
      const category = await getDb().select({
        name: categories.name, slug: categories.slug, color: categories.color,
      }).from(categories).where(eq(categories.id, post.categoryId)).limit(1);
      return toolResult({
        ok: true,
        post: {
          public_id: post.publicId,
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt,
          content_markdown: post.content,
          category: category[0] ?? null,
          status: post.status,
          featured: post.featured,
          published_at: post.publishedAt,
          created_at: post.createdAt,
          updated_at: post.updatedAt,
          public_url: post.status === "published" ? publicPostUrl(origin, post) : null,
        },
      });
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("get_page", {
    title: "读取独立页面",
    description: "读取星屿的接入页或关于页，包括独立标题、摘要和完整 Markdown。修改页面前应先调用。",
    inputSchema: {
      slug: z.enum(["connect", "about"]).describe("页面标识：connect 为接入页，about 为关于页"),
    },
    outputSchema: { ok: z.boolean(), page: z.record(z.string(), z.unknown()).optional(), error: z.string().optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ slug }) => {
    try {
      const page = await getContentPage(slug);
      if (!page) throw new PostWriteError("页面不存在", 404);
      return toolResult({
        ok: true,
        page: {
          slug: page.slug,
          eyebrow: page.eyebrow,
          title: page.title,
          excerpt: page.excerpt,
          content_markdown: page.content,
          updated_at: page.updatedAt,
          public_url: `${origin}/${page.slug}`,
        },
      });
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("update_page", {
    title: "更新公开页面",
    description: "在用户确认后更新接入页或关于页。页面始终公开，因此保存会立即改变线上内容并记录回执。",
    inputSchema: {
      slug: z.enum(["connect", "about"]).describe("页面标识：connect 为接入页，about 为关于页"),
      eyebrow: z.string().trim().max(120).optional(),
      title: z.string().trim().min(1).max(200).optional(),
      excerpt: z.string().max(1_000).optional(),
      content_markdown: z.string().max(750_000).optional(),
      change_summary: CHANGE_SUMMARY_SCHEMA.optional().default("更新公开页面"),
    },
    outputSchema: {
      ok: z.boolean(),
      page: z.record(z.string(), z.unknown()).optional(),
      receipt: RECEIPT_OUTPUT_SCHEMA.optional(),
      error: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  }, async ({ slug, eyebrow, title, excerpt, content_markdown, change_summary }) => {
    try {
      const current = await getContentPage(slug);
      if (!current) throw new PostWriteError("页面不存在", 404);
      const next = {
        eyebrow: eyebrow ?? current.eyebrow,
        title: title ?? current.title,
        excerpt: excerpt ?? current.excerpt,
        content: content_markdown ?? current.content,
      };
      const changedFields = [
        current.eyebrow !== next.eyebrow ? "eyebrow" : null,
        current.title !== next.title ? "title" : null,
        current.excerpt !== next.excerpt ? "excerpt" : null,
        current.content !== next.content ? "content_markdown" : null,
      ].filter((field): field is string => field !== null);
      if (!changedFields.length) {
        return toolResult({
          ok: true,
          page: { slug: current.slug, title: current.title, public_url: `${origin}/${current.slug}` },
          receipt: {
            action: "update_page",
            activity_id: null,
            summary: "没有检测到内容变化，未执行写入。",
            changed_fields: [],
            recorded_at: null,
          },
        });
      }
      const updatedAt = new Date().toISOString();
      await ensureDatabase();
      await getDb().insert(contentPages).values({ slug, ...next, updatedAt }).onConflictDoUpdate({
        target: contentPages.slug,
        set: { ...next, updatedAt },
      });
      const activity = await recordPageActivitySafely({
        slug,
        title: next.title,
        changedFields,
        summary: change_summary,
        clientLabel,
      });
      return toolResult({
        ok: true,
        page: { slug, title: next.title, updated_at: updatedAt, public_url: `${origin}/${slug}` },
        receipt: activityReceipt("update_page", activity, change_summary, changedFields),
      });
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("list_mcp_activity", {
    title: "查看 AI 写作记录",
    description: "只读查看最近的 MCP 写入回执，包括文章、操作、状态变化、修改字段、客户端与时间。",
    inputSchema: {
      limit: z.number().int().min(1).max(50).optional().default(20),
    },
    outputSchema: {
      ok: z.boolean(),
      activities: z.array(z.record(z.string(), z.unknown())).optional(),
      error: z.string().optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ limit }) => {
    try {
      return toolResult({ ok: true, activities: await listMcpActivity(limit) });
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("create_draft", {
    title: "创建文章草稿",
    description: "创建一篇新的 Markdown 草稿并生成操作回执。它永远不会直接发布文章。",
    inputSchema: {
      title: z.string().trim().min(1).max(200),
      content_markdown: z.string().max(750_000).optional().default(""),
      excerpt: z.string().max(1_000).optional().default(""),
      category: CATEGORY_SCHEMA.optional(),
      slug: z.string().trim().max(180).optional(),
      featured: z.boolean().optional().default(false),
      change_summary: CHANGE_SUMMARY_SCHEMA.optional().default("创建新的 Markdown 文章草稿"),
    },
    outputSchema: {
      ok: z.boolean(),
      post: z.record(z.string(), z.unknown()).optional(),
      receipt: RECEIPT_OUTPUT_SCHEMA.optional(),
      error: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ title, content_markdown, excerpt, category, slug, featured, change_summary }) => {
    try {
      const resolvedCategory = await resolveCategory(category);
      const post = await createPostRecord({
        title,
        slug: slugify(slug || title),
        excerpt,
        content: content_markdown,
        categoryId: resolvedCategory.id,
        status: "draft",
        featured,
        publishedAt: null,
      });
      const changedFields = ["title", "slug", "excerpt", "content_markdown", "category", "featured"];
      const activity = await recordActivitySafely({
        action: "create_draft",
        post,
        beforeStatus: null,
        changedFields,
        summary: change_summary,
        clientLabel,
      });
      return toolResult({
        ok: true,
        post: {
          public_id: post.publicId,
          title: post.title,
          slug: post.slug,
          status: post.status,
          category: resolvedCategory.slug,
          message: "草稿已保存，尚未公开发布。",
        },
        receipt: activityReceipt("create_draft", activity, change_summary, changedFields),
      });
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("update_post", {
    title: "更新文章内容",
    description: "在用户确认后更新文章内容并记录修改字段。若文章已发布，此操作会立即改变公开页面；发布状态本身保持不变。",
    inputSchema: {
      identifier: IDENTIFIER_SCHEMA,
      title: z.string().trim().min(1).max(200).optional(),
      content_markdown: z.string().max(750_000).optional(),
      excerpt: z.string().max(1_000).optional(),
      category: CATEGORY_SCHEMA.optional(),
      slug: z.string().trim().max(180).optional(),
      featured: z.boolean().optional(),
      change_summary: CHANGE_SUMMARY_SCHEMA.optional().default("更新文章内容"),
    },
    outputSchema: {
      ok: z.boolean(),
      post: z.record(z.string(), z.unknown()).optional(),
      receipt: RECEIPT_OUTPUT_SCHEMA.optional(),
      error: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  }, async ({ identifier, title, content_markdown, excerpt, category, slug, featured, change_summary }) => {
    try {
      const current = await hydratePost(identifier);
      const resolvedCategory = category ? await resolveCategory(category) : null;
      const input: PostPayload = {
        title: title ?? current.title,
        slug: slug ? slugify(slug) : current.slug,
        excerpt: excerpt ?? current.excerpt,
        content: content_markdown ?? current.content,
        categoryId: resolvedCategory?.id ?? current.categoryId,
        status: current.status,
        featured: featured ?? current.featured,
        publishedAt: current.publishedAt,
      };
      const changedFields = changedPostFields(current, input);
      if (!changedFields.length) {
        return toolResult({
          ok: true,
          post: {
            public_id: current.publicId,
            title: current.title,
            slug: current.slug,
            status: current.status,
            public_url: current.status === "published" ? publicPostUrl(origin, current) : null,
          },
          receipt: {
            action: "update_post",
            activity_id: null,
            summary: "没有检测到内容变化，未执行写入。",
            changed_fields: [],
            recorded_at: null,
          },
        });
      }
      const post = await updatePostRecord(current.id, input);
      const activity = await recordActivitySafely({
        action: "update_post",
        post,
        beforeStatus: current.status,
        changedFields,
        summary: change_summary,
        clientLabel,
      });
      return toolResult({
        ok: true,
        post: {
          public_id: post.publicId,
          title: post.title,
          slug: post.slug,
          status: post.status,
          updated_at: post.updatedAt,
          public_url: post.status === "published" ? publicPostUrl(origin, post) : null,
        },
        receipt: activityReceipt("update_post", activity, change_summary, changedFields),
      });
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("publish_post", {
    title: "公开发布文章",
    description: "重要操作：在用户明确确认后，将草稿公开发布到互联网，并返回公开地址和审计回执。",
    inputSchema: {
      identifier: IDENTIFIER_SCHEMA,
      published_at: z.string().datetime({ offset: true }).optional()
        .describe("可选 ISO 8601 发布时间；留空时使用首次发布时间或当前时间"),
      change_summary: CHANGE_SUMMARY_SCHEMA.optional().default("将文章公开发布到互联网"),
    },
    outputSchema: {
      ok: z.boolean(),
      post: z.record(z.string(), z.unknown()).optional(),
      receipt: RECEIPT_OUTPUT_SCHEMA.optional(),
      error: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  }, async ({ identifier, published_at, change_summary }) => {
    try {
      const current = await hydratePost(identifier);
      if (current.status === "published") {
        return toolResult({
          ok: true,
          post: {
            public_id: current.publicId,
            title: current.title,
            status: current.status,
            published_at: current.publishedAt,
            public_url: publicPostUrl(origin, current),
          },
          receipt: {
            action: "publish_post",
            activity_id: null,
            summary: "文章已经处于发布状态，未重复写入。",
            changed_fields: [],
            recorded_at: null,
          },
        });
      }
      const post = await updatePostRecord(current.id, {
        title: current.title,
        slug: current.slug,
        excerpt: current.excerpt,
        content: current.content,
        categoryId: current.categoryId,
        status: "published",
        featured: current.featured,
        publishedAt: published_at ?? current.publishedAt,
      });
      const changedFields = ["status", "published_at"];
      const activity = await recordActivitySafely({
        action: "publish_post",
        post,
        beforeStatus: current.status,
        changedFields,
        summary: change_summary,
        clientLabel,
      });
      return toolResult({
        ok: true,
        post: {
          public_id: post.publicId,
          title: post.title,
          status: post.status,
          published_at: post.publishedAt,
          public_url: publicPostUrl(origin, post),
        },
        receipt: activityReceipt("publish_post", activity, change_summary, changedFields),
      });
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("unpublish_post", {
    title: "从公开站点撤回文章",
    description: "重要操作：在用户明确确认后将文章撤回为草稿，公开页面将立即不可见；正文不会删除。",
    inputSchema: {
      identifier: IDENTIFIER_SCHEMA,
      change_summary: CHANGE_SUMMARY_SCHEMA.optional().default("从公开站点撤回文章并保留草稿"),
    },
    outputSchema: {
      ok: z.boolean(),
      post: z.record(z.string(), z.unknown()).optional(),
      receipt: RECEIPT_OUTPUT_SCHEMA.optional(),
      error: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  }, async ({ identifier, change_summary }) => {
    try {
      const current = await hydratePost(identifier);
      if (current.status === "draft") {
        return toolResult({
          ok: true,
          post: {
            public_id: current.publicId,
            title: current.title,
            status: current.status,
            message: "文章已经是草稿，未重复写入。",
          },
          receipt: {
            action: "unpublish_post",
            activity_id: null,
            summary: "文章已经是草稿，未重复写入。",
            changed_fields: [],
            recorded_at: null,
          },
        });
      }
      const post = await updatePostRecord(current.id, {
        title: current.title,
        slug: current.slug,
        excerpt: current.excerpt,
        content: current.content,
        categoryId: current.categoryId,
        status: "draft",
        featured: current.featured,
        publishedAt: current.publishedAt,
      });
      const changedFields = ["status"];
      const activity = await recordActivitySafely({
        action: "unpublish_post",
        post,
        beforeStatus: current.status,
        changedFields,
        summary: change_summary,
        clientLabel,
      });
      return toolResult({
        ok: true,
        post: {
          public_id: post.publicId,
          title: post.title,
          status: post.status,
          message: "文章已撤回为草稿，内容仍然保留。",
        },
        receipt: activityReceipt("unpublish_post", activity, change_summary, changedFields),
      });
    } catch (error) {
      return toolFailure(error);
    }
  });

  return server;
}

async function digestSecret(value: string) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

async function isAuthorized(request: Request, expectedToken?: string) {
  if (!expectedToken) return false;
  const header = request.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return false;
  const [provided, expected] = await Promise.all([
    digestSecret(match[1]),
    digestSecret(expectedToken),
  ]);
  return crypto.subtle.timingSafeEqual(provided, expected);
}

function securedResponse(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function handleBlogMcpRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
) {
  if (!env.MCP_WRITE_TOKEN) {
    return Response.json(
      { error: "MCP 写作服务尚未配置" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!(await isAuthorized(request, env.MCP_WRITE_TOKEN))) {
    return Response.json(
      { error: "MCP 写作令牌无效" },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Bearer realm="Xingyu Blog MCP"',
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const origin = new URL(request.url).origin;
  const clientLabel = (request.headers.get("User-Agent") || "remote-mcp").slice(0, 160);
  const server = createBlogMcpServer(origin, clientLabel);
  const response = await createMcpHandler(server, {
    route: MCP_PATH,
    enableJsonResponse: true,
  })(request, env, ctx);
  return securedResponse(response);
}

export function isBlogMcpPath(pathname: string) {
  return pathname === MCP_PATH;
}
