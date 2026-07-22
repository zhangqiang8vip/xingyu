import { getDb } from "../../../db";
import { ensureDatabase } from "../../../db/bootstrap";
import { getCategories } from "../../../db/queries";
import { categories } from "../../../db/schema";
import { isAdminRequest, unauthorized } from "../admin-auth";
import { slugify } from "../posts/post-input";

export async function GET(request: Request) {
  if (!(await isAdminRequest(request))) return unauthorized();
  return Response.json({ categories: await getCategories() });
}

export async function POST(request: Request) {
  if (!(await isAdminRequest(request))) return unauthorized();
  await ensureDatabase();
  const payload = await request.json() as { name?: string; slug?: string; color?: string };
  const name = payload.name?.trim();
  if (!name) return Response.json({ error: "分类名称不能为空" }, { status: 400 });
  try {
    const [category] = await getDb().insert(categories).values({
      name, slug: slugify(payload.slug || name), color: payload.color || "#0071e3",
    }).returning();
    return Response.json({ category }, { status: 201 });
  } catch { return Response.json({ error: "这个分类已经存在" }, { status: 409 }); }
}
