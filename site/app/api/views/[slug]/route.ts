import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../../db/bootstrap";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  await ensureDatabase();
  const { slug } = await params;
  const payload = await request.json().catch(() => ({})) as { visitor?: string };
  if (!payload.visitor || payload.visitor.length > 160) return Response.json({ counted: false }, { status: 400 });
  const post = await env.DB.prepare("SELECT id FROM posts WHERE slug = ? AND status = 'published'").bind(slug).first<{ id: number }>();
  if (!post) return Response.json({ counted: false }, { status: 404 });
  const viewedOn = new Date().toISOString().slice(0, 10);
  const visitorHash = await sha256(payload.visitor);
  const inserted = await env.DB.prepare("INSERT OR IGNORE INTO post_views (post_id, visitor_hash, viewed_on) VALUES (?, ?, ?)")
    .bind(post.id, visitorHash, viewedOn).run();
  const counted = Number(inserted.meta.changes ?? 0) > 0;
  if (counted) await env.DB.prepare("UPDATE posts SET view_count = view_count + 1 WHERE id = ?").bind(post.id).run();
  return Response.json({ counted });
}

async function sha256(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
