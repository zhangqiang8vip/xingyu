"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readApiJson } from "@/app/api-response";

export type SpaceChoice={id:number;name:string;path?:Array<{id:number;name:string}>};
type SpaceNode={id:number;parentId:number|null;name:string;slug:string;childCount:number;articleCount:number;path?:Array<{id:number;name:string}>};

export default function AdminSpacePicker({value,path,onChange,allowPublic=true,allowRoot=false,label="更改空间",excludeBranchId}:{value:number|null;path?:string;onChange:(choice:SpaceChoice|null)=>void;allowPublic?:boolean;allowRoot?:boolean;label?:string;excludeBranchId?:number}){
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState("");
  const [roots,setRoots]=useState<SpaceNode[]>([]);
  const [results,setResults]=useState<SpaceNode[]>([]);
  const [loading,setLoading]=useState(false);
  const rootRef=useRef<HTMLDivElement>(null);

  const loadRoots=useCallback(async()=>{
    const response=await fetch("/api/spaces?parent=root");
    if(response.ok)setRoots((await readApiJson<{spaces:SpaceNode[]}>(response)).spaces??[]);
  },[]);
  const closePicker=useCallback(()=>{
    setOpen(false);
    setQuery("");
    setResults([]);
  },[]);
  const togglePicker=()=>{
    if(open){closePicker();return}
    setQuery("");
    setResults([]);
    setOpen(true);
    if(!roots.length)void loadRoots();
  };
  useEffect(()=>{
    if(!open)return;
    const close=(event:PointerEvent)=>{if(!rootRef.current?.contains(event.target as Node))closePicker()};
    document.addEventListener("pointerdown",close);
    return()=>document.removeEventListener("pointerdown",close);
  },[closePicker,open]);
  useEffect(()=>{
    if(!open||!query.trim())return;
    const controller=new AbortController();
    const timer=window.setTimeout(async()=>{
      setLoading(true);
      try{
        const response=await fetch(`/api/spaces?q=${encodeURIComponent(query.trim())}`,{signal:controller.signal});
        if(response.ok)setResults((await readApiJson<{spaces:SpaceNode[]}>(response)).spaces??[]);
      }finally{if(!controller.signal.aborted)setLoading(false)}
    },160);
    return()=>{window.clearTimeout(timer);controller.abort()};
  },[open,query]);
  const select=async(node:SpaceNode)=>{
    const response=await fetch(`/api/spaces/${node.id}`);
    const data=response.ok?await readApiJson<{space:{path:Array<{id:number;name:string}>}}>(response):null;
    onChange({id:node.id,name:node.name,path:data?.space.path});
    closePicker();
  };
  const searching=Boolean(query.trim());
  const visible=searching?results:roots;
  return <div className="space-picker" ref={rootRef}>
    <button className="space-picker-trigger" type="button" onClick={togglePicker}>
      <span><i className={value!==null?"private":"public"}/><b>{value!==null?(path||"知识空间根层"):"公开博客"}</b><small>{value!==null?"仅管理员与 MCP 可检索":"进入首页与公开文章归档"}</small></span>
      <em>{label}⌄</em>
    </button>
    {open&&<div className="space-picker-popover">
      <header><b>选择归属位置</b><button type="button" onClick={closePicker}>×</button></header>
      <label><span>⌕</span><input autoFocus value={query} onChange={(event)=>{const value=event.target.value;setQuery(value);if(!value.trim())setResults([])}} placeholder="搜索空间名称或路径"/></label>
      <div className="space-picker-list">
        {allowPublic&&!query&&<button type="button" className={value===null?"selected":""} onClick={()=>{onChange(null);closePicker()}}><i className="public"/><span><b>公开博客</b><small>首页与文章归档</small></span>{value===null&&<em>✓</em>}</button>}
        {allowRoot&&!query&&<button type="button" className={value===0?"selected":""} onClick={()=>{onChange({id:0,name:"知识空间",path:[]});closePicker()}}><i className="private"/><span><b>知识空间根层</b><small>移动后成为顶级空间</small></span>{value===0&&<em>✓</em>}</button>}
        {loading?<p>正在搜索空间…</p>:searching
          ? visible.map((node)=>{
            const blocked=Boolean(excludeBranchId&&node.path?.some((part)=>part.id===excludeBranchId));
            return <button type="button" key={node.id} disabled={blocked} className={value===node.id?"selected":""} onClick={()=>void select(node)}><i className="private"/><span><b>{node.name}</b><small>{blocked?"不能移动到自身或下级空间":node.path?.map((part)=>part.name).join(" / ")||`${node.childCount} 个子空间 · ${node.articleCount} 篇直属文章`}</small></span>{value===node.id&&<em>✓</em>}</button>;
          })
          : visible.map((node)=><SpacePickerNode key={node.id} node={node} value={value} depth={0} ancestorIds={[]} excludeBranchId={excludeBranchId} onSelect={select}/>)}
        {!loading&&!visible.length&&<p>{query?"没有匹配的空间":"还没有知识空间"}</p>}
      </div>
    </div>}
  </div>;
}

function SpacePickerNode({node,value,depth,ancestorIds,excludeBranchId,onSelect}:{node:SpaceNode;value:number|null;depth:number;ancestorIds:number[];excludeBranchId?:number;onSelect:(node:SpaceNode)=>Promise<void>}){
  const [open,setOpen]=useState(false);
  const [children,setChildren]=useState<SpaceNode[]>([]);
  const [loading,setLoading]=useState(false);
  const toggle=async(event:React.MouseEvent)=>{
    event.stopPropagation();
    if(!open&&!children.length&&node.childCount){
      setLoading(true);
      try{
        const response=await fetch(`/api/spaces?parent=${node.id}`);
        if(response.ok)setChildren((await readApiJson<{spaces:SpaceNode[]}>(response)).spaces??[]);
      }finally{setLoading(false)}
    }
    setOpen((current)=>!current);
  };
  const blocked=Boolean(excludeBranchId&&(node.id===excludeBranchId||ancestorIds.includes(excludeBranchId)));
  return <div className="space-picker-node">
    <button type="button" disabled={blocked} className={value===node.id?"selected":""} style={{paddingLeft:9+depth*16}} onClick={()=>void onSelect(node)}>
      <span className="space-picker-expander" onClick={toggle}>{node.childCount?(loading?"·":open?"⌄":"›"):"·"}</span>
      <i className="private"/>
      <span><b>{node.name}</b><small>{blocked?"不能移动到自身或下级空间":`${node.childCount} 个子空间 · ${node.articleCount} 篇直属文章`}</small></span>
      {value===node.id&&<em>✓</em>}
    </button>
    {open&&children.map((child)=><SpacePickerNode key={child.id} node={child} value={value} depth={depth+1} ancestorIds={[...ancestorIds,node.id]} excludeBranchId={excludeBranchId} onSelect={onSelect}/>)}
  </div>;
}
