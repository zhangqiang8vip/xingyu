"use client";

import { useCallback, useEffect, useState } from "react";
import BlogHomeExperience, { type BlogHomePost } from "@/features/home/BlogHomeExperience";
import { readApiJson } from "@/app/api-response";
import type { SiteSettingsForm } from "./AdminSettingsPanel";
import type { AdminCategory, AdminStats } from "./admin-types";

type Visibility="all"|"public"|"private";

export default function AdminBrowsePanel({
  settings,
  categories,
  stats,
  onEdit,
  onWrite,
  onOpenArticles,
  onOpenSpaces,
}:{
  settings:SiteSettingsForm;
  categories:AdminCategory[];
  stats:AdminStats;
  onEdit:(postId:number)=>void;
  onWrite:()=>void;
  onOpenArticles:()=>void;
  onOpenSpaces:(spaceId?:number)=>void;
}){
  const [posts,setPosts]=useState<BlogHomePost[]>([]);
  const [category,setCategory]=useState("all");
  const [visibility,setVisibility]=useState<Visibility>("all");
  const [loading,setLoading]=useState(true);

  const load=useCallback(async(signal:AbortSignal)=>{
    setLoading(true);
    try{
      const params=new URLSearchParams({
        scope:visibility,
        pageSize:String(Math.min(18,Math.max(8,settings.homePostLimit))),
        status:"all",
        category,
      });
      const response=await fetch(`/api/posts?${params}`,{signal});
      if(!response.ok)throw new Error("browse failed");
      setPosts((await readApiJson<{rows:BlogHomePost[]}>(response)).rows??[]);
    }catch(error){
      if(!(error instanceof DOMException&&error.name==="AbortError"))setPosts([]);
    }finally{
      if(!signal.aborted)setLoading(false);
    }
  },[category,settings.homePostLimit,visibility]);

  useEffect(()=>{
    const controller=new AbortController();
    const timer=window.setTimeout(()=>void load(controller.signal),80);
    return()=>{window.clearTimeout(timer);controller.abort()};
  },[load]);

  return <section className="admin-main admin-browse admin-public-browser">
    <div className="admin-browser-context">
      <div><i/><span>管理员浏览</span><b>{stats.total+stats.privateArticles} 篇内容</b></div>
      <p>这里与公开博客共用首页、卡片和完整阅读器；草稿与知识空间仅管理员可见。</p>
    </div>
    {loading&&!posts.length?<div className="admin-public-browser-loading"><i/><i/><i/><span>正在打开真实博客视图</span></div>:<BlogHomeExperience
      mode="admin"
      settings={settings}
      categories={categories}
      posts={posts}
      selectedCategory={category}
      visibility={visibility}
      onCategoryChange={setCategory}
      onVisibilityChange={setVisibility}
      onEdit={onEdit}
      onWrite={onWrite}
      onOpenArticles={onOpenArticles}
      onOpenSpaces={()=>onOpenSpaces()}
    />}
  </section>;
}
