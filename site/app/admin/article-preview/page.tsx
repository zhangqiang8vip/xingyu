import { redirect } from "next/navigation";
import { getAdminIdentity } from "../../api/admin-auth";
import { listHomePosts } from "../../../db/queries";

export const dynamic="force-dynamic";

/** Selects a real published article as the shell for a new/draft preview. */
export default async function ArticlePreviewEntry(){
  if(!await getAdminIdentity())redirect("/admin/login");
  const [post]=await listHomePosts("all",1);
  if(!post)redirect("/archive");
  redirect(`/posts/${post.slug}?adminPreview=article`);
}
