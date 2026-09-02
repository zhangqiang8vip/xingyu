"use client";

import { useCallback, useEffect, useRef } from "react";
import type { SiteSettingsForm } from "./AdminSettingsPanel";
import type { EditablePage } from "./AdminPageEditor";

export function HomeLivePreview({ settings,onClose }:{settings:SiteSettingsForm;onClose:()=>void}){
  const payload={...settings,footerCopyright:`© ${new Date().getFullYear()} ${settings.brandName} · ${settings.footerText}`};
  return <RealPagePreview label="首页即时预览" kind="home" src="/?adminPreview=home" payload={payload} onClose={onClose}/>;
}

export function ContentPageLivePreview({ page,settings,kind,onClose }:{page:EditablePage;settings:SiteSettingsForm;kind:"about"|"connect";onClose:()=>void}){
  const [titleLead,titleTail]=splitTitle(page.title);
  const payload={...settings,...page,titleLead,titleTail,authorIdentity:`${settings.authorName} · ${settings.brandLatin}`,footerCopyright:`© ${new Date().getFullYear()} ${settings.brandName} · ${settings.footerText}`};
  const label=kind==="about"?"关于页即时预览":"接入页即时预览";
  return <RealPagePreview label={label} kind={kind} src={`/${kind}?adminPreview=${kind}`} payload={payload} onClose={onClose}/>;
}

function RealPagePreview({label,kind,src,payload,onClose}:{label:string;kind:"home"|"about"|"connect";src:string;payload:object;onClose:()=>void}){
  const frame=useRef<HTMLIFrameElement>(null);
  usePreviewEscape(onClose);
  const sync=useCallback(()=>frame.current?.contentWindow?.postMessage({type:"xingyu:admin-preview",kind,payload},window.location.origin),[kind,payload]);
  useEffect(()=>{const ready=(event:MessageEvent)=>{if(event.origin===window.location.origin&&event.data?.type==="xingyu:admin-preview-ready"&&event.data?.kind===kind)sync()};window.addEventListener("message",ready);sync();return()=>window.removeEventListener("message",ready)},[kind,sync]);
  return <div className="admin-live-preview" role="dialog" aria-modal="true" aria-label={label}><div className="live-preview-toolbar"><div><i/><span>{label}</span><b>真实前台 · 未保存内容实时同步</b></div><button onClick={onClose} aria-label="关闭预览">×</button></div><iframe ref={frame} className="live-preview-frame" src={src} title={label} onLoad={sync}/></div>;
}
function usePreviewEscape(onClose:()=>void){useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose()};window.addEventListener("keydown",close);const overflow=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{window.removeEventListener("keydown",close);document.body.style.overflow=overflow}},[onClose])}
function splitTitle(title:string){const index=Math.max(title.indexOf("，"),title.indexOf(","));return index>=0?[title.slice(0,index+1),title.slice(index+1)]:[title,""]}
