import { env } from "cloudflare:workers";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb } from ".";
import { ensureDatabase } from "./bootstrap";
import { attachments, posts } from "./schema";

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_MCP_ATTACHMENT_BYTES = 8 * 1024 * 1024;

const allowedTypes = new Map<string, string[]>([
  ["image/jpeg", ["jpg", "jpeg"]],
  ["image/png", ["png"]],
  ["image/webp", ["webp"]],
  ["image/gif", ["gif"]],
  ["image/avif", ["avif"]],
  ["application/pdf", ["pdf"]],
  ["text/plain", ["txt", "log"]],
  ["text/markdown", ["md", "markdown"]],
  ["text/csv", ["csv"]],
  ["application/json", ["json"]],
  ["application/zip", ["zip"]],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ["docx"]],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ["xlsx"]],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", ["pptx"]],
]);

export class AttachmentError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 | 413 | 415 = 400) {
    super(message);
    this.name = "AttachmentError";
  }
}

export function validateAttachmentInput(name: string, contentType: string, size: number, maxBytes = MAX_ATTACHMENT_BYTES) {
  const normalizedName = name.trim();
  if (!normalizedName || normalizedName.length > 240) throw new AttachmentError("附件名称无效");
  if (/[\u0000-\u001f\u007f]/.test(normalizedName)) throw new AttachmentError("附件名称包含无效字符");
  if (!Number.isSafeInteger(size) || size < 1) throw new AttachmentError("附件不能为空");
  if (size > maxBytes) throw new AttachmentError(`附件不能超过 ${formatBytes(maxBytes)}`, 413);
  const extension = normalizedName.split(".").pop()?.toLowerCase() ?? "";
  const extensions = allowedTypes.get(contentType.toLowerCase());
  if (!extensions?.includes(extension)) {
    throw new AttachmentError("不支持这种附件。可上传图片、PDF、Markdown、文本、CSV、JSON、ZIP 与 Office 文档", 415);
  }
  return { name: normalizedName, contentType: contentType.toLowerCase(), extension };
}

export async function createAttachment(input: {
  name: string;
  contentType: string;
  bytes: Uint8Array;
  postId?: number | null;
}) {
  await ensureDatabase();
  const checked = validateAttachmentInput(input.name, input.contentType, input.bytes.byteLength);
  if (input.postId) {
    const post = await getDb().select({ id: posts.id }).from(posts).where(eq(posts.id, input.postId)).limit(1);
    if (!post[0]) throw new AttachmentError("要关联的文章不存在", 404);
  }

  const publicId = `att_${crypto.randomUUID().replaceAll("-", "")}`;
  const now = new Date();
  const safeName = safeObjectName(checked.name);
  const objectKey = `attachments/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${publicId}/${safeName}`;
  const stableBytes = new Uint8Array(input.bytes);
  const digest = await crypto.subtle.digest("SHA-256", stableBytes);
  const sha256 = bytesToHex(new Uint8Array(digest));

  await env.MEDIA.put(objectKey, stableBytes, {
    httpMetadata: { contentType: checked.contentType },
    customMetadata: { originalName: checked.name, attachmentId: publicId, sha256 },
  });

  try {
    const [record] = await getDb().insert(attachments).values({
      publicId,
      postId: input.postId ?? null,
      objectKey,
      originalName: checked.name,
      contentType: checked.contentType,
      size: input.bytes.byteLength,
      sha256,
    }).returning();
    if (!record) throw new AttachmentError("附件记录创建失败", 409);
    return record;
  } catch (error) {
    await env.MEDIA.delete(objectKey);
    if (error instanceof AttachmentError) throw error;
    throw new AttachmentError("附件保存失败", 409);
  }
}

export async function getAttachment(publicId: string) {
  await ensureDatabase();
  const rows = await getDb().select({
    id: attachments.id,
    publicId: attachments.publicId,
    postId: attachments.postId,
    objectKey: attachments.objectKey,
    originalName: attachments.originalName,
    contentType: attachments.contentType,
    size: attachments.size,
    sha256: attachments.sha256,
    createdAt: attachments.createdAt,
    postStatus: posts.status,
    postSpaceId: posts.spaceId,
  }).from(attachments).leftJoin(posts, eq(attachments.postId, posts.id))
    .where(eq(attachments.publicId, publicId)).limit(1);
  return rows[0] ?? null;
}

export async function getAttachmentObject(objectKey: string) {
  return env.MEDIA.get(objectKey);
}

export async function listPostAttachments(postId: number) {
  await ensureDatabase();
  return getDb().select().from(attachments)
    .where(eq(attachments.postId, postId))
    .orderBy(attachments.createdAt, attachments.id);
}

export async function bindMarkdownAttachments(postId: number, markdown: string) {
  const ids = attachmentIdsFromMarkdown(markdown);
  if (!ids.length) return;
  await getDb().update(attachments).set({ postId })
    .where(and(
      inArray(attachments.publicId, ids),
      or(eq(attachments.postId, postId), isNull(attachments.postId)),
    ));
}

export function attachmentIdsFromMarkdown(markdown: string) {
  const matches = markdown.matchAll(/\/api\/attachments\/(att_[a-f0-9]{32})(?:\/|[)\s"']|$)/gi);
  return [...new Set(Array.from(matches, (match) => match[1].toLowerCase()))].slice(0, 200);
}

export function attachmentUrl(record: { publicId: string; originalName: string }) {
  return `/api/attachments/${record.publicId}/${encodeURIComponent(record.originalName)}`;
}

export function attachmentMarkdown(record: { publicId: string; originalName: string; contentType: string; size: number }) {
  const url = attachmentUrl(record);
  const escapedName = record.originalName.replaceAll("[", "\\[").replaceAll("]", "\\]");
  if (record.contentType.startsWith("image/")) return `![${escapedName}](${url})`;
  return `[${escapedName}](${url} "${fileKind(record.originalName)} · ${formatBytes(record.size)}")`;
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function fileKind(name: string) {
  return name.split(".").pop()?.toUpperCase() || "FILE";
}

function safeObjectName(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "bin";
  const stem = name.slice(0, Math.max(0, name.length - extension.length - 1))
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "file";
  return `${stem}.${extension}`;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
