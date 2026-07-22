import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureDatabase } from "../../../db/bootstrap";
import { getSiteSettings } from "../../../db/queries";
import { siteSettings } from "../../../db/schema";
import { CONTENT_LIMITS } from "../../site-config";
import { isAdminRequest, unauthorized } from "../admin-auth";

export async function GET(request: Request) {
  if (!(await isAdminRequest(request))) return unauthorized();
  return Response.json({ settings: await getSiteSettings() }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  if (!(await isAdminRequest(request))) return unauthorized();
  await ensureDatabase();
  const payload = await request.json() as Record<string, unknown>;
  const text = (key: string, fallback = "") => String(payload[key] ?? fallback).trim();
  const values = {
    brandName: text("brandName", "星屿"),
    brandLatin: text("brandLatin", "XINGYU"),
    authorName: text("authorName", "星屿"),
    avatarUrl: text("avatarUrl", "/images/xingyu-avatar.jpg"),
    tagline: text("tagline"), description: text("description"),
    heroLead: text("heroLead"), heroTail: text("heroTail"),
    homeSectionTitle: text("homeSectionTitle", "最近在写"),
    homeAboutTitle: text("homeAboutTitle"), homeAboutCopy: text("homeAboutCopy"),
    footerText: text("footerText"), seoTitle: text("seoTitle"), seoDescription: text("seoDescription"),
    homePostLimit: Math.min(CONTENT_LIMITS.homeMaximum, Math.max(1, Number(payload.homePostLimit) || CONTENT_LIMITS.homeDefault)),
    updatedAt: new Date().toISOString(),
  };
  await getDb().update(siteSettings).set(values).where(eq(siteSettings.id, 1));
  return Response.json({ settings: await getSiteSettings() });
}
