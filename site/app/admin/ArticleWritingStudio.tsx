"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import VditorEditor from "./VditorEditor";
import { formatLongDate } from "../content-utils";

type Mode="code"|"split"|"reading";
type Draft={title:string;slug?:string;excerpt:string;content:string;publishedAt?:string|null;status?:"draft"|"published"};
export default function ArticleWritingStudio({draft,categoryName,categoryColor,authorName,avatarUrl,initialMode="split",onChange,onClose}:{draft:Draft;categoryName:string;categoryColor:string;authorName:string;avatarUrl:string;initialMode?:Mode;onChange:(content:string)=>void;onClose:()=>void}){
  const [mode,setMode]=useState<Mode>(initialMode);
  useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose()};window.addEventListener("keydown",close);const overflow=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{window.removeEventListener("keydown",close);document.body.style.overflow=overflow}},[onClose]);
  return <div className={`writing-studio mode-${mode}`} role="dialog" aria-modal="true" aria-label="沉浸式文章写作">
    <header><div className="writing-studio-brand"><i style={{background:categoryColor}}/><span>实时写作</span><b>{draft.title||"未命名文章"}</b></div><div className="writing-mode-switch" aria-label="写作方式"><button className={mode==="code"?"active":""} onClick={()=>setMode("code")}>源码</button><button className={mode==="split"?"active":""} onClick={()=>setMode("split")}>分屏</button><button className={mode==="reading"?"active":""} onClick={()=>setMode("reading")}>阅读</button></div><div className="writing-studio-actions"><span>内容实时保留在编辑表单</span><button onClick={onClose}>完成</button></div></header>
    <main>{mode!=="reading"&&<section className="writing-source"><div><span>MARKDOWN SOURCE</span><small>输入 / 使用指令 · Ctrl+V 粘贴图片</small></div><VditorEditor value={draft.content} onChange={onChange} previewMode="editor"/></section>}{mode!=="code"&&<ArticleFrontstage draft={draft} categoryName={categoryName} categoryColor={categoryColor} authorName={authorName} avatarUrl={avatarUrl}/>}</main>
  </div>;
}

function ArticleFrontstage({draft,categoryName,categoryColor,authorName,avatarUrl}:{draft:Draft;categoryName:string;categoryColor:string;authorName:string;avatarUrl:string}){
  const frame=useRef<HTMLIFrameElement>(null);
  const payload=useMemo(()=>({...draft,title:draft.title||"未命名文章",excerpt:draft.excerpt||"文章摘要会显示在这里。",content:draft.content||"从左侧开始写作，正文会在这里实时呈现。",categoryName,categoryColor,authorName,avatarUrl,publishedLabel:formatLongDate(draft.publishedAt,"预览日期")}),[draft,categoryName,categoryColor,authorName,avatarUrl]);
  const sync=useCallback(()=>frame.current?.contentWindow?.postMessage({type:"xingyu:admin-preview",kind:"article",payload},window.location.origin),[payload]);
  useEffect(()=>{const ready=(event:MessageEvent)=>{if(event.origin===window.location.origin&&event.data?.type==="xingyu:admin-preview-ready"&&event.data?.kind==="article")sync()};window.addEventListener("message",ready);sync();return()=>window.removeEventListener("message",ready)},[sync]);
  const source="/admin/article-preview";
  return <section className="writing-render"><iframe ref={frame} className="writing-frontstage-frame" src={source} title="真实文章前台预览" onLoad={sync}/></section>;
}
