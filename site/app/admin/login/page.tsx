import Link from "next/link";
import { redirect } from "next/navigation";
import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "../../chatgpt-auth";
import { getAdminIdentity, isAllowedAdminEmail } from "../../api/admin-auth";
import AdminLoginForm from "./AdminLoginForm";
import { getSiteSettings } from "../../../db/queries";
import ThemeToggle from "../../ThemeToggle";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await getAdminIdentity()) redirect("/admin");
  const user = await getChatGPTUser();
  const local = process.env.NODE_ENV === "development";
  const denied = user && !isAllowedAdminEmail(user.email);
  const settings=await getSiteSettings();

  return <main className="signin admin-signin"><div className="admin-login-theme"><ThemeToggle /></div><div>
    <span className="admin-mark">{settings.brandName.slice(0,1)}</span>
    <small>PRIVATE WRITING SPACE</small>
    <h1>{denied ? "此账号没有管理权限" : `${settings.brandName}写作后台`}</h1>
    <p>{denied ? "只有管理员白名单中的账号可以访问。" : `这是${settings.brandName}的私密写作空间，请验证管理员身份。`}</p>
    {denied ? <a className="primary-button" href={chatGPTSignOutPath("/admin/login")}>切换账号</a> : local ? <AdminLoginForm /> : <a className="primary-button" href={chatGPTSignInPath("/admin")}>使用 ChatGPT 登录</a>}
    <Link href="/">返回博客</Link>
  </div></main>;
}
