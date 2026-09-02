import { redirect } from "next/navigation";
import { getAdminIdentity } from "../api/admin-auth";
import { listMcpConnections } from "../../db/integrations";
import { getAdminStats, getCategories, getContentPage, getSiteSettings } from "../../db/queries";
import AdminClient from "@/features/admin/AdminClient";
import { getAdminPost } from "@/server/services/admin-posts";

export const dynamic = "force-dynamic";

export default async function AdminPage({searchParams}:{searchParams:Promise<{edit?:string}>}) {
  const admin = await getAdminIdentity();
  if (!admin) redirect("/admin/login");
  const editId=Number((await searchParams).edit);
  const [categories, settings, connectPage, aboutPage, stats, connections, initialArticle] = await Promise.all([getCategories(), getSiteSettings(), getContentPage("connect"), getContentPage("about"), getAdminStats(), listMcpConnections(),Number.isInteger(editId)&&editId>0?getAdminPost(editId):Promise.resolve(null)]);
  return <AdminClient categories={categories} settings={settings} connectPage={connectPage!} aboutPage={aboutPage!} stats={stats} connections={connections} initialArticle={initialArticle} userName={admin.displayName} signOutPath="/api/admin/logout" />;
}
