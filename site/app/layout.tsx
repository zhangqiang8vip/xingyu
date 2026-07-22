import type { Metadata } from "next";
import "./globals.css";
import ScrollIndicator from "./ScrollIndicator";
import RouteTransition from "./RouteTransition";
import { getSiteSettings } from "../db/queries";

export async function generateMetadata():Promise<Metadata>{
  const settings=await getSiteSettings();
  return {title:{default:settings.seoTitle,template:`%s · ${settings.brandName}`},description:settings.seoDescription,icons:{
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  }};
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head><script dangerouslySetInnerHTML={{ __html: `(function(){try{var saved=localStorage.getItem("xingyu-theme-mode");var legacy=localStorage.getItem("xingyu-theme");var mode=(saved==="light"||saved==="dark"||saved==="system")?saved:((legacy==="light"||legacy==="dark")?legacy:"system");var dark=mode==="system"?matchMedia("(prefers-color-scheme: dark)").matches:mode==="dark";document.documentElement.dataset.themeMode=mode;document.documentElement.dataset.theme=dark?"dark":"light";document.documentElement.style.colorScheme=dark?"dark":"light"}catch(e){}})();` }} /></head>
      <body id="page-content"><RouteTransition>{children}</RouteTransition><ScrollIndicator /></body>
    </html>
  );
}
