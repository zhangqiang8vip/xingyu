import { getDb } from "../../../db";
import { ensureDatabase } from "../../../db/bootstrap";
import { listAdminPosts } from "../../../db/queries";
import { posts } from "../../../db/schema";
import { postSlugHistory } from "../../../db/schema";
import { eq } from "drizzle-orm";
import { createPostPublicId } from "../../../db/public-id";
import { isAdminRequest, unauthorized } from "../admin-auth";
import { parsePostPayload } from "./post-input";

export async function GET(request: Request) {
  if (!(await isAdminRequest(request))) return unauthorized();
  const url = new URL(request.url);
  return Response.json(await listAdminPosts({
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: Number(url.searchParams.get("pageSize")) || 20,
    query: url.searchParams.get("q") ?? "",
    category: url.searchParams.get("category") ?? "all",
    status: (url.searchParams.get("status") as "draft" | "published" | "all") ?? "all",
  }));
}

export async function POST(request: Request) {
  if (!(await isAdminRequest(request))) return unauthorized();
  await ensureDatabase();
  const payload = await request.json() as Record<string, unknown>;
  const input = parsePostPayload(payload);
  if (!input.title) return Response.json({ error: "文章标题不能为空" }, { status: 400 });
  try {
    const historical = await getDb().select({ postId: postSlugHistory.postId }).from(postSlugHistory).where(eq(postSlugHistory.slug, input.slug)).limit(1);
    if (historical[0]) return Response.json({ error: "该 Slug 曾被使用，请换一个地址" }, { status: 409 });
    const [post] = await getDb().insert(posts).values({
      ...input,
      publicId: createPostPublicId(),
      publishedAt: input.status === "published" ? input.publishedAt ?? new Date().toISOString() : null,
    }).returning();
    return Response.json({ post }, { status: 201 });
  } catch { return Response.json({ error: "Slug 已存在，请换一个地址" }, { status: 409 }); }
}
