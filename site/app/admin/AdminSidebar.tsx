"use client";

import Link from "next/link";
import ThemeToggle from "../ThemeToggle";
import type { AdminSection, AdminStats } from "./admin-types";

const NAV_ITEMS:Array<{
  section:AdminSection;
  icon:string;
  label:string;
  count:(stats:AdminStats,categoryCount:number)=>number|string;
  settings?:boolean;
}>=[
  {section:"browse",icon:"◉",label:"浏览",count:(stats)=>stats.total+stats.privateArticles},
  {section:"articles",icon:"▤",label:"文章管理",count:(stats)=>stats.total},
  {section:"spaces",icon:"◇",label:"知识空间",count:(stats)=>stats.privateArticles},
  {section:"home",icon:"⌂",label:"首页设置",count:()=>"01",settings:true},
  {section:"connect",icon:"↗",label:"接入设置",count:()=>"03"},
  {section:"about",icon:"○",label:"关于设置",count:()=>"04"},
  {section:"categories",icon:"#",label:"分类管理",count:(_,categoryCount)=>categoryCount},
];

export default function AdminSidebar({
  brandName,
  avatarUrl,
  authorName,
  userName,
  section,
  stats,
  categoryCount,
  collapsed,
  onSectionChange,
  onToggle,
  onSignOut,
}:{
  brandName:string;
  avatarUrl:string;
  authorName:string;
  userName:string;
  section:AdminSection;
  stats:AdminStats;
  categoryCount:number;
  collapsed:boolean;
  onSectionChange:(section:AdminSection)=>void;
  onToggle:()=>void;
  onSignOut:()=>void;
}){
  return <aside className="admin-sidebar">
    <div className="admin-sidebar-top">
      <Link className="brand admin-brand" href="/">
        <span className="admin-brand-full">{brandName}</span>
        <span className="admin-brand-compact">屿</span>
        <i className="admin-brand-point">。</i>
      </Link>
      <div className="admin-mobile-actions">
        <Link href="/" target="_blank" aria-label="查看前台">↗</Link>
        <button type="button" onClick={onSignOut} aria-label="安全退出">⏻</button>
      </div>
      <ThemeToggle/>
    </div>
    <nav>
      {NAV_ITEMS.map((item)=><button
        key={item.section}
        data-icon={item.icon}
        title={item.label}
        className={`${item.settings?"admin-nav-settings-start ":""}${section===item.section?"selected":""}`.trim()}
        onClick={()=>onSectionChange(item.section)}
      ><span>{item.label}</span><b>{item.count(stats,categoryCount)}</b></button>)}
      <Link data-icon="↗" title="查看前台" className="admin-desktop-utility" href="/" target="_blank">查看前台 ↗</Link>
      <button data-icon="⏻" title="安全退出" className="admin-desktop-utility" onClick={onSignOut}>安全退出 <b>↗</b></button>
    </nav>
    <div className="admin-user"><img src={avatarUrl} alt={`${authorName}管理员`}/><div><b>{userName}</b><small>管理员</small></div></div>
    <button className="admin-sidebar-collapse" type="button" onClick={onToggle} aria-expanded={!collapsed} aria-label={collapsed?"展开管理栏":"收起管理栏"} title={collapsed?"展开管理栏":"收起管理栏"}><span aria-hidden="true">{collapsed?"›":"‹"}</span></button>
  </aside>;
}
