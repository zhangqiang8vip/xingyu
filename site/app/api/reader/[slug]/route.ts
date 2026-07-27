import {
  getAdminReaderPost,
  getNextAdminPost,
  getNextPublishedPost,
  getPreviousAdminPost,
  resolvePublicPost,
  getPreviousPublishedPost,
} from "../../../../db/queries";
import { isAdminRequest, unauthorized } from "../../admin-auth";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin=new URL(request.url).searchParams.get("scope")==="admin";
  if(admin&&!(await isAdminRequest(request)))return unauthorized();
  if(admin){
    const post=await getAdminReaderPost(slug);
    if(!post)return Response.json({error:"文章不存在"},{status:404});
    const [previousPost,nextPost]=await Promise.all([
      getPreviousAdminPost(post.updatedAt,post.id),
      getNextAdminPost(post.updatedAt,post.id),
    ]);
    return Response.json({post,previousPost,nextPost},{headers:{"Cache-Control":"no-store"}});
  }
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
