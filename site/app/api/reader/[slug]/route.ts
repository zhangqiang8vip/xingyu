import {
  getNextPublishedPost,
  resolvePublicPost,
  getPreviousPublishedPost,
} from "../../../../db/queries";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await resolvePublicPost(slug);
  if (!post) return Response.json({ error: "文章不存在" }, { status: 404 });

  const [previousPost, nextPost] = await Promise.all([
    getPreviousPublishedPost(post.publishedAt, post.id),
    getNextPublishedPost(post.publishedAt, post.id),
  ]);

  return Response.json(
    { post, previousPost, nextPost },
    { headers: { "Cache-Control": "no-store" } },
  );
}
