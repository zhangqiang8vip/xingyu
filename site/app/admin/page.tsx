import { redirect } from "next/navigation";
import { getAdminIdentity } from "../api/admin-auth";
import { getAdminStats, getCategories, getContentPage, getSiteSettings } from "../../db/queries";
import AdminClient from "./AdminClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await getAdminIdentity();
  if (!admin) redirect("/admin/login");
  const [categories, settings, connectPage, aboutPage, stats] = await Promise.all([getCategories(), getSiteSettings(), getContentPage("connect"), getContentPage("about"), getAdminStats()]);
  return <AdminClient categories={categories} settings={settings} connectPage={connectPage!} aboutPage={aboutPage!} stats={stats} userName={admin.displayName} signOutPath="/api/admin/logout" />;
}
