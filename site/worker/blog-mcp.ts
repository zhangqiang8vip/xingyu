import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { slugify, type PostPayload } from "../app/api/posts/post-input";
import { getDb } from "../db";
import { ensureDatabase } from "../db/bootstrap";
import { listMcpActivity, recordMcpActivity, recordMcpPageActivity, recordMcpSpaceActivity, type McpActivityAction } from "../db/mcp-activity";
import { createPostRecord, getWritablePost, PostWriteError, updatePostRecord } from "../db/post-write";
import { getContentPage, listAdminPosts } from "../db/queries";
import { categories, contentPages } from "../db/schema";
import { createSpace, deleteSpace, getSpaceOverview, getSpacePath, listSpaceChildren, listSpacePosts, resolveSpace, searchSpaces, updateSpace } from "../db/spaces";
import {
  AttachmentError,
  MAX_MCP_ATTACHMENT_BYTES,
  attachmentMarkdown,
  attachmentUrl,
  createAttachment,
  getAttachment,
  getAttachmentObject,
  listPostAttachments,
} from "../db/attachments";
import { authenticateMcp, rememberTokenUse, requireScope, scopeFailure, type McpAuth } from "./mcp-auth";

const MCP_PATH = "/mcp";
const IDENTIFIER_SCHEMA = z.string().trim().min(1).max(180)
  .describe("文章的稳定 public_id、当前 slug 或后台数字 ID");
const CATEGORY_SCHEMA = z.string().trim().min(1).max(100)
  .describe("分类 slug 或分类名称；不确定时先调用 list_categories");
const SPACE_SCHEMA = z.string().trim().min(1).max(500)
  .describe("空间数字 ID，或使用 / 分隔的完整路径，例如“QSG / 研发团队 / 麒麟系统适配”");
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
  return scopeFailure(error) ?? toolResult({
    ok: false,
    error: error instanceof Error ? error.message : "操作失败",
  }, true);
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

async function recordSpaceActivitySafely(input: Parameters<typeof recordMcpSpaceActivity>[0]) {
  try {
    return await recordMcpSpaceActivity(input);
  } catch (error) {
    console.error(JSON.stringify({
      event: "mcp_space_activity_write_failed",
      action: input.action,
      spaceId: input.space.id,
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
    spaceId:number|null;
    featured: boolean;
  },
) {
  return [
    current.title !== next.title ? "title" : null,
    current.slug !== next.slug ? "slug" : null,
    current.excerpt !== next.excerpt ? "excerpt" : null,
    current.content !== next.content ? "content_markdown" : null,
    current.categoryId !== next.categoryId ? "category" : null,
    current.spaceId !== next.spaceId ? "space" : null,
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

function createBlogMcpServer(origin: string, clientLabel: string, auth: McpAuth) {
  const server = new McpServer(
    { name: "xingyu-blog-writer", version: "1.0.0" },
    {
      instructions: [
        "这是星屿博客的线上写作 MCP。默认先用 create_draft 创建草稿；只有用户明确要求上线时才调用 publish_post。",
        "修改前先用 get_post 读取最新版，稳定 public_id 是首选标识。正文使用 Markdown。",
        "不要假设分类存在，必要时先调用 list_categories。update_post 不改变发布状态；发布和撤回分别使用独立工具。",
        "知识空间是私有内容边界。空间文章不会进入公开首页、归档或公开 URL；使用 list_spaces 确认路径，search_posts 可限定空间及其后代。",
        "独立页面先用 get_page 读取；update_page 会立即改变公开页面，必须先展示变更字段和摘要并获得用户确认。",
        "附件使用 upload_attachment 上传到 R2，并把返回的 markdown 插入正文；list_attachments 和 download_attachment 可读取文章附件。",
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
      requireScope(auth, "xingyu.read");
      await ensureDatabase();
      const rows = await getDb().select({
        id: categories.id, name: categories.name, slug: categories.slug, color: categories.color,
      }).from(categories).orderBy(categories.id);
      return toolResult({ ok: true, categories: rows });
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("list_spaces",{
    title:"浏览知识空间",
    description:"读取顶级空间或指定空间的直属子空间。空间层级不固定，可逐层浏览。",
    inputSchema:{parent:SPACE_SCHEMA.optional(),query:z.string().trim().max(100).optional()},
    outputSchema:{ok:z.boolean(),spaces:z.array(z.record(z.string(),z.unknown())).optional(),error:z.string().optional()},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async({parent,query})=>{
    try{
      requireScope(auth, "xingyu.read");
      if(query){
        const matches=await searchSpaces(query);
        return toolResult({ok:true,parent:null,spaces:matches.map((space)=>({...space,display_path:space.path.map((item)=>item.name).join(" / ")}))});
      }
      const parentSpace=parent?await resolveSpace(parent):null;
      const rows=await listSpaceChildren(parentSpace?.id??null);
      return toolResult({ok:true,parent:parentSpace?{id:parentSpace.id,name:parentSpace.name}:null,spaces:rows});
    }catch(error){return toolFailure(error)}
  });

  server.registerTool("get_space",{
    title:"读取知识空间",
    description:"读取空间完整路径、直属子空间、后代数量与文章总数。",
    inputSchema:{space:SPACE_SCHEMA},
    outputSchema:{ok:z.boolean(),space:z.record(z.string(),z.unknown()).optional(),error:z.string().optional()},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async({space})=>{
    try{
      requireScope(auth, "xingyu.read");
      const resolved=await resolveSpace(space);
      const overview=await getSpaceOverview(resolved.id);
      return toolResult({ok:true,space:overview?{...overview,display_path:overview.path.map((item)=>item.name).join(" / ")}:null});
    }catch(error){return toolFailure(error)}
  });

  server.registerTool("create_space",{
    title:"创建知识空间",
    description:"创建顶级空间或任意空间的子空间。写入前应向用户说明空间名称、父路径与用途。",
    inputSchema:{name:z.string().trim().min(1).max(100),parent:SPACE_SCHEMA.optional(),change_summary:CHANGE_SUMMARY_SCHEMA},
    outputSchema:{ok:z.boolean(),space:z.record(z.string(),z.unknown()).optional(),receipt:RECEIPT_OUTPUT_SCHEMA.optional(),error:z.string().optional()},
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false},
  },async({name,parent,change_summary})=>{
    try{
      requireScope(auth, "xingyu.draft");
      const parentSpace=parent?await resolveSpace(parent):null;
      const created=await createSpace({name,parentId:parentSpace?.id??null});
      const path=await getSpacePath(created.id);
      const activity=await recordSpaceActivitySafely({
        action:"create_space",space:{id:created.id,name:created.name},
        afterParentId:created.parentId,changedFields:["name","parent"],summary:change_summary,clientLabel,
      });
      return toolResult({ok:true,space:{...created,display_path:path.map((item)=>item.name).join(" / ")},receipt:activityReceipt("create_space",activity,change_summary,["name","parent"])});
    }catch(error){return toolFailure(error)}
  });

  server.registerTool("update_space",{
    title:"修改或移动知识空间",
    description:"重要操作：重命名空间，或将空间移动到新的父空间；所有后代与文章会一起移动。",
    inputSchema:{space:SPACE_SCHEMA,name:z.string().trim().min(1).max(100).optional(),parent:SPACE_SCHEMA.nullable().optional(),change_summary:CHANGE_SUMMARY_SCHEMA},
    outputSchema:{ok:z.boolean(),space:z.record(z.string(),z.unknown()).optional(),receipt:RECEIPT_OUTPUT_SCHEMA.optional(),error:z.string().optional()},
    annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:false},
  },async({space,name,parent,change_summary})=>{
    try{
      requireScope(auth, "xingyu.publish");
      const current=await resolveSpace(space);
      const parentSpace=typeof parent==="string"?await resolveSpace(parent):parent===null?null:undefined;
      const updated=await updateSpace(current.id,{name,parentId:parentSpace===undefined?undefined:parentSpace?.id??null});
      const path=await getSpacePath(updated.id);
      const changedFields=[
        name!==undefined&&name.trim()!==current.name?"name":null,
        parentSpace!==undefined&&(parentSpace?.id??null)!==current.parentId?"parent":null,
      ].filter((field):field is string=>field!==null);
      const activity=await recordSpaceActivitySafely({
        action:"update_space",space:{id:updated.id,name:updated.name},
        beforeParentId:current.parentId,afterParentId:updated.parentId,
        changedFields,summary:change_summary,clientLabel,
      });
      return toolResult({ok:true,space:{...updated,display_path:path.map((item)=>item.name).join(" / ")},receipt:activityReceipt("update_space",activity,change_summary,changedFields)});
    }catch(error){return toolFailure(error)}
  });

  server.registerTool("move_space",{
    title:"移动知识空间",
    description:"重要操作：将空间及其所有后代与文章移动到新的父空间。移动到知识空间根层时 parent 传 null。",
    inputSchema:{space:SPACE_SCHEMA,parent:SPACE_SCHEMA.nullable(),change_summary:CHANGE_SUMMARY_SCHEMA},
    outputSchema:{ok:z.boolean(),space:z.record(z.string(),z.unknown()).optional(),receipt:RECEIPT_OUTPUT_SCHEMA.optional(),error:z.string().optional()},
    annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:false},
  },async({space,parent,change_summary})=>{
    try{
      requireScope(auth, "xingyu.publish");
      const current=await resolveSpace(space);
      const parentSpace=parent===null?null:await resolveSpace(parent);
      const updated=await updateSpace(current.id,{parentId:parentSpace?.id??null});
      const path=await getSpacePath(updated.id);
      const activity=await recordSpaceActivitySafely({
        action:"move_space",space:{id:updated.id,name:updated.name},
        beforeParentId:current.parentId,afterParentId:updated.parentId,
        changedFields:["parent"],summary:change_summary,clientLabel,
      });
      return toolResult({ok:true,space:{...updated,display_path:path.map((item)=>item.name).join(" / ")},receipt:activityReceipt("move_space",activity,change_summary,["parent"])});
    }catch(error){return toolFailure(error)}
  });

  server.registerTool("delete_space",{
    title:"删除知识空间",
    description:"高风险操作：可仅删除空空间、将内容移动到另一知识空间后删除，或递归删除全部后代与文章。递归删除必须提供与空间名称完全一致的确认文本。",
    inputSchema:{
      space:SPACE_SCHEMA,
      mode:z.enum(["empty","move","recursive"]).default("empty"),
      move_to:SPACE_SCHEMA.optional().describe("mode=move 时必填；接收原空间直属文章和子空间的目标知识空间"),
      confirm_name:z.string().optional().default(""),
      change_summary:CHANGE_SUMMARY_SCHEMA,
    },
    outputSchema:{ok:z.boolean(),result:z.record(z.string(),z.unknown()).optional(),receipt:RECEIPT_OUTPUT_SCHEMA.optional(),error:z.string().optional()},
    annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:false},
  },async({space,mode,move_to,confirm_name,change_summary})=>{
    try{
      requireScope(auth, "xingyu.publish");
      const current=await resolveSpace(space);
      const moveTarget=mode==="move"&&move_to?await resolveSpace(move_to):null;
      if(mode==="move"&&!moveTarget)throw new Error("移动内容后删除必须提供 move_to 目标知识空间");
      const result=await deleteSpace(current.id,{mode,moveTo:moveTarget?.id,confirmName:confirm_name});
      const changedFields=mode==="recursive"
        ? ["space","descendants","articles"]
        : mode==="move"
          ? ["space","children_parent","article_space"]
          : ["space"];
      const activity=await recordSpaceActivitySafely({
        action:"delete_space",space:{id:current.id,name:current.name},
        beforeParentId:current.parentId,changedFields,
        summary:change_summary,clientLabel,
      });
      return toolResult({ok:true,result,receipt:activityReceipt("delete_space",activity,change_summary,changedFields)});
    }catch(error){return toolFailure(error)}
  });

  server.registerTool("search_posts", {
    title: "搜索文章",
    description: "按标题、摘要、Slug 或正文全文搜索公开文章和私有空间知识；可限定空间并选择是否包含全部后代。",
    inputSchema: {
      query: z.string().trim().max(200).optional().default(""),
      status: z.enum(["all", "draft", "published"]).optional().default("all"),
      category: z.string().trim().max(100).optional().default("all"),
      space: SPACE_SCHEMA.optional(),
      include_descendants:z.boolean().optional().default(true),
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
  }, async ({ query, status, category, space, include_descendants, cursor, page_size }) => {
    try {
      requireScope(auth, "xingyu.read");
      const resolvedSpace=space?await resolveSpace(space):null;
      const result = resolvedSpace
        ? await listSpacePosts({spaceId:resolvedSpace.id,includeDescendants:include_descendants,query,status,category,cursor,limit:page_size})
        : await listAdminPosts({query,status,category,cursor,limit:page_size,space:"all"});
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
        visibility:post.spaceId?"space":"public",
        space_path:post.spacePath??null,
        public_url: post.status === "published"&&!post.spaceId ? publicPostUrl(origin, post) : null,
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
      requireScope(auth, "xingyu.read");
      const post = await hydratePost(identifier);
      const category = await getDb().select({
        name: categories.name, slug: categories.slug, color: categories.color,
      }).from(categories).where(eq(categories.id, post.categoryId)).limit(1);
      const spacePath=post.spaceId?await getSpacePath(post.spaceId):[];
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
          visibility:post.spaceId?"space":"public",
          space:post.spaceId?{id:post.spaceId,path:spacePath.map((item)=>item.name),display_path:spacePath.map((item)=>item.name).join(" / ")}:null,
          published_at: post.publishedAt,
          created_at: post.createdAt,
          updated_at: post.updatedAt,
          public_url: post.status === "published"&&!post.spaceId ? publicPostUrl(origin, post) : null,
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
      requireScope(auth, "xingyu.read");
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
      requireScope(auth, "xingyu.publish");
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
      requireScope(auth, "xingyu.read");
      return toolResult({ ok: true, activities: await listMcpActivity(limit) });
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("upload_attachment", {
    title: "上传文章附件",
    description: "把 Base64 文件上传到博客 R2。可关联现有文章；返回可直接插入正文的标准 Markdown。调用前须说明文件名、大小、目标文章与 change_summary。",
    inputSchema: {
      filename: z.string().trim().min(1).max(240),
      content_type: z.string().trim().min(1).max(160),
      content_base64: z.string().min(1).max(12_000_000).describe("文件原始字节的标准 Base64，不含 data URL 前缀"),
      post_identifier: IDENTIFIER_SCHEMA.optional(),
      change_summary: CHANGE_SUMMARY_SCHEMA.optional().default("上传文章附件"),
    },
    outputSchema: {
      ok: z.boolean(),
      attachment: z.record(z.string(), z.unknown()).optional(),
      error: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ filename, content_type, content_base64, post_identifier, change_summary }) => {
    try {
      const post = post_identifier ? await hydratePost(post_identifier) : null;
      if (post && post.status === "published" && !post.spaceId) requireScope(auth, "xingyu.publish");
      else requireScope(auth, "xingyu.draft");
      const bytes = decodeBase64(content_base64);
      if (bytes.byteLength > MAX_MCP_ATTACHMENT_BYTES) {
        throw new AttachmentError("MCP 单个附件不能超过 8 MB；更大的文件请使用写作后台上传", 413);
      }
      const attachment = await createAttachment({
        name: filename,
        contentType: content_type,
        bytes,
        postId: post?.id ?? null,
      });
      return toolResult({
        ok: true,
        attachment: {
          public_id: attachment.publicId,
          filename: attachment.originalName,
          content_type: attachment.contentType,
          size: attachment.size,
          sha256: attachment.sha256,
          post_public_id: post?.publicId ?? null,
          markdown: attachmentMarkdown(attachment),
          url: `${origin}${attachmentUrl(attachment)}`,
          change_summary,
          visibility: post ? (post.status === "published" && post.spaceId === null ? "public" : "private") : "unbound_private",
        },
      });
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("list_attachments", {
    title: "列出文章附件",
    description: "读取一篇文章已绑定的全部附件及其 Markdown 链接。",
    inputSchema: { identifier: IDENTIFIER_SCHEMA },
    outputSchema: {
      ok: z.boolean(),
      attachments: z.array(z.record(z.string(), z.unknown())).optional(),
      error: z.string().optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ identifier }) => {
    try {
      requireScope(auth, "xingyu.read");
      const post = await hydratePost(identifier);
      const rows = await listPostAttachments(post.id);
      return toolResult({
        ok: true,
        attachments: rows.map((attachment) => ({
          public_id: attachment.publicId,
          filename: attachment.originalName,
          content_type: attachment.contentType,
          size: attachment.size,
          sha256: attachment.sha256,
          markdown: attachmentMarkdown(attachment),
          url: `${origin}${attachmentUrl(attachment)}`,
          created_at: attachment.createdAt,
        })),
      });
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("download_attachment", {
    title: "下载文章附件",
    description: "通过附件 public_id 读取文件。返回 Base64、校验值与文件信息，适合 Agent 保存到本地或继续处理。",
    inputSchema: { public_id: z.string().regex(/^att_[a-f0-9]{32}$/i) },
    outputSchema: {
      ok: z.boolean(),
      attachment: z.record(z.string(), z.unknown()).optional(),
      error: z.string().optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ public_id }) => {
    try {
      requireScope(auth, "xingyu.read");
      const attachment = await getAttachment(public_id.toLowerCase());
      if (!attachment) throw new AttachmentError("附件不存在", 404);
      if (attachment.size > MAX_MCP_ATTACHMENT_BYTES) {
        throw new AttachmentError("附件超过 MCP 的 8 MB 下载上限，请使用返回的 URL 在已登录后台下载", 413);
      }
      const object = await getAttachmentObject(attachment.objectKey);
      if (!object) throw new AttachmentError("附件文件不存在", 404);
      const bytes = new Uint8Array(await object.arrayBuffer());
      return toolResult({
        ok: true,
        attachment: {
          public_id: attachment.publicId,
          filename: attachment.originalName,
          content_type: attachment.contentType,
          size: attachment.size,
          sha256: attachment.sha256,
          content_base64: encodeBase64(bytes),
          url: `${origin}${attachmentUrl(attachment)}`,
        },
      });
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
      space: SPACE_SCHEMA.optional(),
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
  }, async ({ title, content_markdown, excerpt, category, space, slug, featured, change_summary }) => {
    try {
      requireScope(auth, "xingyu.draft");
      const resolvedCategory = await resolveCategory(category);
      const resolvedSpace=space?await resolveSpace(space):null;
      const post = await createPostRecord({
        title,
        slug: slugify(slug || title),
        excerpt,
        content: content_markdown,
        categoryId: resolvedCategory.id,
        spaceId:resolvedSpace?.id??null,
        status: "draft",
        featured:resolvedSpace?false:featured,
        publishedAt: null,
      });
      const changedFields = ["title", "slug", "excerpt", "content_markdown", "category", "space", "featured"];
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
          visibility:resolvedSpace?"space":"public",
          space_path:resolvedSpace?(await getSpacePath(resolvedSpace.id)).map((item)=>item.name).join(" / "):null,
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
    description: "在用户确认后更新文章内容并记录修改字段。已发布且不属于知识空间的文章会立即改变公开页面；知识空间文章仍保持私有。发布状态本身保持不变。",
    inputSchema: {
      identifier: IDENTIFIER_SCHEMA,
      title: z.string().trim().min(1).max(200).optional(),
      content_markdown: z.string().max(750_000).optional(),
      excerpt: z.string().max(1_000).optional(),
      category: CATEGORY_SCHEMA.optional(),
      space: SPACE_SCHEMA.nullable().optional().describe("目标知识空间；传 null 表示移回公开博客，省略则保持当前位置"),
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
  }, async ({ identifier, title, content_markdown, excerpt, category, space, slug, featured, change_summary }) => {
    try {
      const current = await hydratePost(identifier);
      requireScope(auth, current.status === "published" ? "xingyu.publish" : "xingyu.draft");
      const resolvedCategory = category ? await resolveCategory(category) : null;
      const resolvedSpace=typeof space==="string"?await resolveSpace(space):space===null?null:undefined;
      const nextSpaceId=resolvedSpace===undefined?current.spaceId:resolvedSpace?.id??null;
      const input: PostPayload = {
        title: title ?? current.title,
        slug: slug ? slugify(slug) : current.slug,
        excerpt: excerpt ?? current.excerpt,
        content: content_markdown ?? current.content,
        categoryId: resolvedCategory?.id ?? current.categoryId,
        spaceId:nextSpaceId,
        status: current.status,
        featured:nextSpaceId===null?(featured??current.featured):false,
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
            public_url: current.status === "published"&&!current.spaceId ? publicPostUrl(origin, current) : null,
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
          visibility:post.spaceId?"space":"public",
          space_path:post.spaceId?(await getSpacePath(post.spaceId)).map((item)=>item.name).join(" / "):null,
          public_url: post.status === "published"&&!post.spaceId ? publicPostUrl(origin, post) : null,
        },
        receipt: activityReceipt("update_post", activity, change_summary, changedFields),
      });
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("publish_post", {
    title: "发布文章或标记内容完成",
    description: "重要操作：公开博客文章会发布到互联网；知识空间文章只会标记为内容完成，仍保持私有。必须在用户明确确认后调用。",
    inputSchema: {
      identifier: IDENTIFIER_SCHEMA,
      published_at: z.string().datetime({ offset: true }).optional()
        .describe("可选 ISO 8601 发布时间；留空时使用首次发布时间或当前时间"),
      change_summary: CHANGE_SUMMARY_SCHEMA.optional().default("发布文章或将空间文章标记为内容完成"),
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
      requireScope(auth, "xingyu.publish");
      const current = await hydratePost(identifier);
      if (current.status === "published") {
        return toolResult({
          ok: true,
          post: {
            public_id: current.publicId,
            title: current.title,
            status: current.status,
            published_at: current.publishedAt,
            visibility:current.spaceId?"space":"public",
            public_url: current.spaceId?null:publicPostUrl(origin, current),
          },
          receipt: {
            action: "publish_post",
            activity_id: null,
            summary: current.spaceId ? "空间文章已经标记为内容完成，未重复写入。" : "文章已经处于公开发布状态，未重复写入。",
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
        spaceId:current.spaceId,
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
          visibility:post.spaceId?"space":"public",
          public_url: post.spaceId?null:publicPostUrl(origin, post),
        },
        receipt: activityReceipt("publish_post", activity, change_summary, changedFields),
      });
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("unpublish_post", {
    title: "将文章退回草稿",
    description: "重要操作：公开文章会从站点撤回；知识空间文章会从内容完成状态退回草稿。正文不会删除。",
    inputSchema: {
      identifier: IDENTIFIER_SCHEMA,
      change_summary: CHANGE_SUMMARY_SCHEMA.optional().default("将文章退回草稿并保留正文"),
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
      requireScope(auth, "xingyu.publish");
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
        spaceId:current.spaceId,
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

function decodeBase64(value: string) {
  try {
    const normalized = value.replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 === 1) throw new Error();
    const binary = atob(normalized);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new AttachmentError("content_base64 不是有效的 Base64");
  }
}

function encodeBase64(bytes: Uint8Array) {
  let result = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    result += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(result);
}

export async function handleBlogMcpRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
) {
  await ensureDatabase();
  const auth = await authenticateMcp(request);
  if (auth instanceof Response) return auth;
  await rememberTokenUse(auth, ctx);

  const origin = new URL(request.url).origin;
  const clientLabel = auth.authType === "legacy"
    ? (request.headers.get("User-Agent") || "remote-mcp").slice(0, 160)
    : `oauth:${auth.clientId}`;
  const server = createBlogMcpServer(origin, clientLabel, auth);
  const response = await createMcpHandler(server, {
    route: MCP_PATH,
    enableJsonResponse: true,
  })(request, env, ctx);
  return securedResponse(response);
}

export function isBlogMcpPath(pathname: string) {
  return pathname === MCP_PATH;
}
