import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { slugify, type PostPayload } from "../app/api/posts/post-input";
import { getDb } from "../db";
import { ensureDatabase } from "../db/bootstrap";
import { createPostRecord, getWritablePost, PostWriteError, updatePostRecord } from "../db/post-write";
import { listAdminPosts } from "../db/queries";
import { categories } from "../db/schema";

const MCP_PATH = "/mcp";
const IDENTIFIER_SCHEMA = z.string().trim().min(1).max(180)
  .describe("文章的稳定 public_id、当前 slug 或后台数字 ID");
const CATEGORY_SCHEMA = z.string().trim().min(1).max(100)
  .describe("分类 slug 或分类名称；不确定时先调用 list_categories");

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

function createBlogMcpServer(origin: string) {
  const server = new McpServer(
    { name: "xingyu-blog-writer", version: "1.0.0" },
    {
      instructions: [
        "这是星屿博客的线上写作 MCP。默认先用 create_draft 创建草稿；只有用户明确要求上线时才调用 publish_post。",
        "修改前先用 get_post 读取最新版，稳定 public_id 是首选标识。正文使用 Markdown。",
        "不要假设分类存在，必要时先调用 list_categories。update_post 不改变发布状态；发布和撤回分别使用独立工具。",
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

  server.registerTool("create_draft", {
    title: "创建文章草稿",
    description: "创建一篇新的 Markdown 草稿。此工具永远不会直接发布文章。",
    inputSchema: {
      title: z.string().trim().min(1).max(200),
      content_markdown: z.string().max(750_000).optional().default(""),
      excerpt: z.string().max(1_000).optional().default(""),
      category: CATEGORY_SCHEMA.optional(),
      slug: z.string().trim().max(180).optional(),
      featured: z.boolean().optional().default(false),
    },
    outputSchema: { ok: z.boolean(), post: z.record(z.string(), z.unknown()).optional(), error: z.string().optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ title, content_markdown, excerpt, category, slug, featured }) => {
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
      });
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("update_post", {
    title: "更新文章内容",
    description: "更新文章标题、Markdown 正文、摘要、分类、Slug 或精选状态，但保持当前发布状态不变。",
    inputSchema: {
      identifier: IDENTIFIER_SCHEMA,
      title: z.string().trim().min(1).max(200).optional(),
      content_markdown: z.string().max(750_000).optional(),
      excerpt: z.string().max(1_000).optional(),
      category: CATEGORY_SCHEMA.optional(),
      slug: z.string().trim().max(180).optional(),
      featured: z.boolean().optional(),
    },
    outputSchema: { ok: z.boolean(), post: z.record(z.string(), z.unknown()).optional(), error: z.string().optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ identifier, title, content_markdown, excerpt, category, slug, featured }) => {
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
      const post = await updatePostRecord(current.id, input);
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
      });
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("publish_post", {
    title: "发布文章",
    description: "将指定草稿正式发布到线上。仅在用户明确要求发布时调用。",
    inputSchema: {
      identifier: IDENTIFIER_SCHEMA,
      published_at: z.string().datetime({ offset: true }).optional()
        .describe("可选 ISO 8601 发布时间；留空时使用首次发布时间或当前时间"),
    },
    outputSchema: { ok: z.boolean(), post: z.record(z.string(), z.unknown()).optional(), error: z.string().optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ identifier, published_at }) => {
    try {
      const current = await hydratePost(identifier);
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
      return toolResult({
        ok: true,
        post: {
          public_id: post.publicId,
          title: post.title,
          status: post.status,
          published_at: post.publishedAt,
          public_url: publicPostUrl(origin, post),
        },
      });
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("unpublish_post", {
    title: "撤回为草稿",
    description: "将已发布文章撤回为草稿，公开页面将不再显示它；文章内容不会删除。",
    inputSchema: { identifier: IDENTIFIER_SCHEMA },
    outputSchema: { ok: z.boolean(), post: z.record(z.string(), z.unknown()).optional(), error: z.string().optional() },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, async ({ identifier }) => {
    try {
      const current = await hydratePost(identifier);
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
      return toolResult({
        ok: true,
        post: {
          public_id: post.publicId,
          title: post.title,
          status: post.status,
          message: "文章已撤回为草稿，内容仍然保留。",
        },
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
  const server = createBlogMcpServer(origin);
  const response = await createMcpHandler(server, {
    route: MCP_PATH,
    enableJsonResponse: true,
  })(request, env, ctx);
  return securedResponse(response);
}

export function isBlogMcpPath(pathname: string) {
  return pathname === MCP_PATH;
}
