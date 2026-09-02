import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureDatabase } from "@/db/bootstrap";
import { getContentPage, getSiteSettings } from "@/db/queries";
import { contentPages, siteSettings } from "@/db/schema";
import { CONTENT_LIMITS } from "@/domain/site/config";

export class SiteContentError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export async function updateSiteSettings(payload: Record<string, unknown>) {
  await ensureDatabase();
  const text = (key: string, fallback = "") => String(payload[key] ?? fallback).trim();
  const values = {
    brandName: text("brandName", "星屿"),
    brandLatin: text("brandLatin", "XINGYU"),
    authorName: text("authorName", "星屿"),
    avatarUrl: text("avatarUrl", "/images/xingyu-avatar.jpg"),
    tagline: text("tagline"),
    description: text("description"),
    heroLead: text("heroLead"),
    heroTail: text("heroTail"),
    homeSectionTitle: text("homeSectionTitle", "最近在写"),
    homeAboutTitle: text("homeAboutTitle"),
    homeAboutCopy: text("homeAboutCopy"),
    footerText: text("footerText"),
    seoTitle: text("seoTitle"),
    seoDescription: text("seoDescription"),
    homePostLimit: Math.min(
      CONTENT_LIMITS.homeMaximum,
      Math.max(1, Number(payload.homePostLimit) || CONTENT_LIMITS.homeDefault),
    ),
    updatedAt: new Date().toISOString(),
  };
  await getDb().update(siteSettings).set(values).where(eq(siteSettings.id, 1));
  return getSiteSettings();
}

export async function upsertContentPage(slug: string, payload: Record<string, unknown>) {
  await ensureDatabase();
  const values = {
    eyebrow: String(payload.eyebrow ?? "").trim(),
    title: String(payload.title ?? "").trim(),
    excerpt: String(payload.excerpt ?? "").trim(),
    content: String(payload.content ?? ""),
    updatedAt: new Date().toISOString(),
  };
  if (!values.title) throw new SiteContentError("页面标题不能为空");
  const existing = await getContentPage(slug);
  if (existing) await getDb().update(contentPages).set(values).where(eq(contentPages.slug, slug));
  else await getDb().insert(contentPages).values({ slug, ...values });
  return getContentPage(slug);
}
