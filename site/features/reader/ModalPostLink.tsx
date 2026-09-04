"use client";

import { lazy, Suspense, useCallback, useEffect, useState, type ComponentPropsWithoutRef } from "react";
import { postPath } from "@/app/post-path";

const ModalPostReader = lazy(() => import("./ModalPostReader"));

type Props = Omit<ComponentPropsWithoutRef<"a">, "href"> & {
  publicId:string;
  slug:string;
  readerScope?:"public"|"admin";
  controllerOnly?:boolean;
  onEdit?:(postId:number)=>void;
};

export default function ModalPostLink({ publicId, slug, readerScope="public", controllerOnly=false, onEdit, children, onClick, ...props }: Props) {
  const [activePublicId,setActivePublicId]=useState(publicId);
  const [open,setOpen]=useState(false);
  const close=useCallback(()=>setOpen(false),[]);

  useEffect(()=>{
    if(!controllerOnly)return;
    const openRequested=(event:Event)=>{
      const requested=(event as CustomEvent<{publicId?:string}>).detail?.publicId;
      if(!requested)return;
      setActivePublicId(requested);
      setOpen(true);
    };
    window.addEventListener("xingyu:admin-reader-open",openRequested);
    return()=>window.removeEventListener("xingyu:admin-reader-open",openRequested);
  },[controllerOnly]);

  const openReader=(event:React.MouseEvent<HTMLAnchorElement>)=>{
    onClick?.(event);
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    if(document.documentElement.dataset.readingMode==="page")return;
    event.preventDefault();
    setActivePublicId(publicId);
    setOpen(true);
  };

  return <>
    {!controllerOnly&&<a {...props} href={readerScope==="admin"?`/admin/reader/${encodeURIComponent(publicId)}`:postPath({publicId,slug})} onClick={openReader}>{children}</a>}
    {open&&<Suspense fallback={<ReaderChunkFallback onClose={close}/> }>
      <ModalPostReader key={activePublicId} initialPublicId={activePublicId} readerScope={readerScope} onEdit={onEdit} onClose={close}/>
    </Suspense>}
  </>;
}

function ReaderChunkFallback({onClose}:{onClose:()=>void}){
  return <div className="reader-modal" role="dialog" aria-modal="true" aria-label="正在打开文章" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose()}}>
    <div className="reader-layout" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose()}}>
      <section className="reader-panel">
        <header className="reader-toolbar"><div><i/><span>沉浸阅读</span></div><button className="reader-toolbar-close" type="button" onClick={onClose} aria-label="关闭阅读弹窗">×</button></header>
        <div className="reader-loading"><i/><i/><i/><span>正在展开文章</span></div>
      </section>
    </div>
  </div>;
}
