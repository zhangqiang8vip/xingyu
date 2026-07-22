import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { ensureDatabase } from "../../../../db/bootstrap";
import { getContentPage } from "../../../../db/queries";
import { contentPages } from "../../../../db/schema";
import { isAdminRequest, unauthorized } from "../../admin-auth";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAdminRequest(request))) return unauthorized();
  const { slug } = await params;
  const page = await getContentPage(slug);
  return page ? Response.json({ page }) : Response.json({ error: "页面不存在" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAdminRequest(request))) return unauthorized();
  await ensureDatabase();
  const { slug } = await params;
  const payload = await request.json() as Record<string, unknown>;
  const values = {
    eyebrow: String(payload.eyebrow ?? "").trim(),
    title: String(payload.title ?? "").trim(),
    excerpt: String(payload.excerpt ?? "").trim(),
    content: String(payload.content ?? ""),
    updatedAt: new Date().toISOString(),
  };
  if (!values.title) return Response.json({ error: "页面标题不能为空" }, { status: 400 });
  const existing = await getContentPage(slug);
  if (existing) await getDb().update(contentPages).set(values).where(eq(contentPages.slug, slug));
  else await getDb().insert(contentPages).values({ slug, ...values });
  return Response.json({ page: await getContentPage(slug) });
}
