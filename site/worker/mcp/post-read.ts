export type SearchDetail = "minimal" | "summary";
export type PostView = "meta" | "excerpt" | "outline" | "content";

export type SearchPostInput = {
  publicId: string;
  title: string;
  slug: string;
  excerpt: string;
  status: string;
  categoryName?: string | null;
  featured: boolean;
  publishedAt: string | null;
  updatedAt: string;
  spaceId: number | null;
  spacePath?: string | null;
};

export function extractMarkdownOutline(markdown: string) {
  const outline: Array<{ level: number; text: string }> = [];
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) outline.push({ level: match[1].length, text: match[2].trim() });
  }
  return outline;
}

export function searchPostCard(post: SearchPostInput, origin: string, detail: SearchDetail) {
  const card: Record<string, unknown> = {
    public_id: post.publicId,
    title: post.title,
    slug: post.slug,
    status: post.status,
    category: post.categoryName ?? null,
    visibility: post.spaceId ? "space" : "public",
    space_path: post.spacePath ?? null,
    public_url: post.status === "published" && !post.spaceId
      ? `${origin}/posts/${post.publicId}/${post.slug}`
      : null,
  };
  if (detail === "summary") {
    card.excerpt = post.excerpt;
    card.featured = post.featured;
    card.published_at = post.publishedAt;
    card.updated_at = post.updatedAt;
  }
  return card;
}

export function postReadHint(view: PostView) {
  if (view === "content") return null;
  return "修改、引用或核对正文前，请再用 view=content 读取全文。不要连续打开多篇全文。";
}
