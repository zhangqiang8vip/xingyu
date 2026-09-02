import { z } from "zod";
import { slugify, type PostPayload } from "@/domain/posts/post-input";
import { createPostRecord, updatePostRecord } from "../../db/post-write";
import { getSpacePath, resolveSpace } from "../../db/spaces";
import {
  AttachmentError,
  MAX_MCP_ATTACHMENT_BYTES,
  attachmentMarkdown,
  attachmentUrl,
  createAttachment,
} from "../../db/attachments";
import { requireScope } from "../mcp-auth";
import { scopeForAttachment, scopeForPostWrite } from "./scope-policy";
import {
  CATEGORY_SCHEMA,
  CHANGE_SUMMARY_SCHEMA,
  IDENTIFIER_SCHEMA,
  RECEIPT_OUTPUT_SCHEMA,
  SPACE_SCHEMA,
  activityReceipt,
  changedPostFields,
  hydratePost,
  publicPostUrl,
  recordActivitySafely,
  resolveCategory,
  toolFailure,
  toolResult,
  type McpToolContext,
} from "./shared";

export function registerDraftTools({ server, origin, clientLabel, auth }: McpToolContext) {
  server.registerTool("upload_attachment", {
    title: "上传图片或文件到文章",
    description: "星屿支持附件上传。把用户提供的图片、PDF、Markdown、文本、ZIP 或 Office 文件编成标准 Base64 后上传；可关联现有文章。成功后返回可直接插入正文的 Markdown。单文件不超过 8MB。用户要插图或传文件时必须用这个工具，不要回答没有上传功能。",
    inputSchema: {
      filename: z.string().trim().min(1).max(240),
      content_type: z.string().trim().min(1).max(160),
      content_base64: z.string().min(1).max(12_000_000).describe("文件原始字节的标准 Base64，不含 data URL 前缀"),
      post_identifier: IDENTIFIER_SCHEMA.optional(),
      change_summary: CHANGE_SUMMARY_SCHEMA.optional().default("上传文章附件"),
    },
    outputSchema: { ok: z.boolean(), attachment: z.record(z.string(), z.unknown()).optional(), error: z.string().optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ filename, content_type, content_base64, post_identifier, change_summary }) => {
    try {
      const post = post_identifier ? await hydratePost(post_identifier) : null;
      requireScope(auth, scopeForAttachment(post));
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
    outputSchema: { ok: z.boolean(), post: z.record(z.string(), z.unknown()).optional(), receipt: RECEIPT_OUTPUT_SCHEMA.optional(), error: z.string().optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ title, content_markdown, excerpt, category, space, slug, featured, change_summary }) => {
    try {
      requireScope(auth, "xingyu.draft");
      const resolvedCategory = await resolveCategory(category);
      const resolvedSpace = space ? await resolveSpace(space) : null;
      const post = await createPostRecord({
        title,
        slug: slugify(slug || title),
        excerpt,
        content: content_markdown,
        categoryId: resolvedCategory.id,
        spaceId: resolvedSpace?.id ?? null,
        status: "draft",
        featured: resolvedSpace ? false : featured,
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
          visibility: resolvedSpace ? "space" : "public",
          space_path: resolvedSpace ? (await getSpacePath(resolvedSpace.id)).map((item) => item.name).join(" / ") : null,
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
    outputSchema: { ok: z.boolean(), post: z.record(z.string(), z.unknown()).optional(), receipt: RECEIPT_OUTPUT_SCHEMA.optional(), error: z.string().optional() },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  }, async ({ identifier, title, content_markdown, excerpt, category, space, slug, featured, change_summary }) => {
    try {
      const current = await hydratePost(identifier);
      requireScope(auth, scopeForPostWrite(current.status));
      const resolvedCategory = category ? await resolveCategory(category) : null;
      const resolvedSpace = typeof space === "string" ? await resolveSpace(space) : space === null ? null : undefined;
      const nextSpaceId = resolvedSpace === undefined ? current.spaceId : resolvedSpace?.id ?? null;
      const input: PostPayload = {
        title: title ?? current.title,
        slug: slug ? slugify(slug) : current.slug,
        excerpt: excerpt ?? current.excerpt,
        content: content_markdown ?? current.content,
        categoryId: resolvedCategory?.id ?? current.categoryId,
        spaceId: nextSpaceId,
        status: current.status,
        featured: nextSpaceId === null ? (featured ?? current.featured) : false,
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
            public_url: current.status === "published" && !current.spaceId ? publicPostUrl(origin, current) : null,
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
          visibility: post.spaceId ? "space" : "public",
          space_path: post.spaceId ? (await getSpacePath(post.spaceId)).map((item) => item.name).join(" / ") : null,
          public_url: post.status === "published" && !post.spaceId ? publicPostUrl(origin, post) : null,
        },
        receipt: activityReceipt("update_post", activity, change_summary, changedFields),
      });
    } catch (error) {
      return toolFailure(error);
    }
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
