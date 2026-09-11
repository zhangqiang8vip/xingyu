import { z } from "zod";
import { getDb } from "../../db";
import { ensureDatabase } from "../../db/bootstrap";
import { getContentPage } from "../../db/queries";
import { contentPages } from "../../db/schema";
import { PostWriteError, updatePostRecord } from "../../db/post-write";
import { requireScope } from "../mcp-auth";
import {
  CHANGE_SUMMARY_SCHEMA,
  IDENTIFIER_SCHEMA,
  MCP_ERROR_OUTPUT_FIELDS,
  RECEIPT_OUTPUT_SCHEMA,
  activityReceipt,
  hydratePost,
  publicPostUrl,
  recordActivitySafely,
  recordPageActivitySafely,
  toolFailure,
  toolResult,
  type McpToolContext,
} from "./shared";

export function registerPublishTools({ server, origin, clientLabel, auth }: McpToolContext) {
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
    outputSchema: { page: z.record(z.string(), z.unknown()).optional(), receipt: RECEIPT_OUTPUT_SCHEMA.optional(), ...MCP_ERROR_OUTPUT_FIELDS },
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
          receipt: { action: "update_page", activity_id: null, summary: "没有检测到内容变化，未执行写入。", changed_fields: [], recorded_at: null },
        });
      }
      const updatedAt = new Date().toISOString();
      await ensureDatabase();
      await getDb().insert(contentPages).values({ slug, ...next, updatedAt }).onConflictDoUpdate({
        target: contentPages.slug,
        set: { ...next, updatedAt },
      });
      const activity = await recordPageActivitySafely({ slug, title: next.title, changedFields, summary: change_summary, clientLabel });
      return toolResult({
        ok: true,
        page: { slug, title: next.title, updated_at: updatedAt, public_url: `${origin}/${slug}` },
        receipt: activityReceipt("update_page", activity, change_summary, changedFields),
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
    outputSchema: { post: z.record(z.string(), z.unknown()).optional(), receipt: RECEIPT_OUTPUT_SCHEMA.optional(), ...MCP_ERROR_OUTPUT_FIELDS },
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
            visibility: current.spaceId ? "space" : "public",
            public_url: current.spaceId ? null : publicPostUrl(origin, current),
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
        spaceId: current.spaceId,
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
          visibility: post.spaceId ? "space" : "public",
          public_url: post.spaceId ? null : publicPostUrl(origin, post),
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
    outputSchema: { post: z.record(z.string(), z.unknown()).optional(), receipt: RECEIPT_OUTPUT_SCHEMA.optional(), ...MCP_ERROR_OUTPUT_FIELDS },
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
        spaceId: current.spaceId,
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
          slug: post.slug,
          status: post.status,
          message: "文章已撤回为草稿，内容仍然保留。",
        },
        receipt: activityReceipt("unpublish_post", activity, change_summary, changedFields),
      });
    } catch (error) {
      return toolFailure(error);
    }
  });
}
