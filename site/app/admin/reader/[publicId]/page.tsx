import { notFound, redirect } from "next/navigation";
import { getAdminReaderPost } from "../../../../db/queries";
import { getAdminIdentity } from "../../../api/admin-auth";
import PostPageView from "@/features/reader/PostPageView";
import "../../admin-reader.css";

export const dynamic="force-dynamic";

export default async function AdminReaderPage({params}:{params:Promise<{publicId:string}>}){
  const admin=await getAdminIdentity();
  if(!admin)redirect("/admin/login");
  const {publicId}=await params;
  const post=await getAdminReaderPost(publicId);
  if(!post)notFound();
  return <PostPageView post={post} readerScope="admin"/>;
}
