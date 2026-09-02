"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readApiJson } from "@/app/api-response";
import AdminSpacePicker, { type SpaceChoice } from "./AdminSpacePicker";

type SpaceNode={id:number;parentId:number|null;name:string;slug:string;sortOrder:number;childCount:number;articleCount:number;totalArticleCount?:number;latestActivityAt?:string;childPreview?:string|null;updatedAt:string;path?:PathNode[]};
type PathNode={id:number;parentId:number|null;name:string;slug:string};
type Overview=SpaceNode&{path:PathNode[];children:SpaceNode[];descendantCount:number;articleCount:number};
type SpacePost={id:number;publicId:string;title:string;slug:string;excerpt:string;status:"draft"|"published";categoryName:string;updatedAt:string;spaceId:number;spacePath:string};
type DialogState={kind:"create"|"rename"|"move"|"delete";target?:SpaceNode};
type DialogImpact={descendantCount:number;articleCount:number}|null;

export default function AdminSpacesPanel({initialSpaceId=null,createOnOpen=false,onCreateArticle,onEditArticle,onBrowseArticle,onShareArticle}:{initialSpaceId?:number|null;createOnOpen?:boolean;onCreateArticle:(spaceId:number,spacePath:string)=>void;onEditArticle:(postId:number)=>void;onBrowseArticle:(postId:number)=>void;onShareArticle:(post:{id:number;title:string})=>void}){
  const [roots,setRoots]=useState<SpaceNode[]>([]);
  const [rootMeta,setRootMeta]=useState({rootCount:0,spaceCount:0,articleCount:0});
  const [currentId,setCurrentId]=useState<number|null>(initialSpaceId);
  const [overview,setOverview]=useState<Overview|null>(null);
  const [posts,setPosts]=useState<SpacePost[]>([]);
  const [spaceMatches,setSpaceMatches]=useState<SpaceNode[]>([]);
  const [nextCursor,setNextCursor]=useState<string|null>(null);
  const [loadingMore,setLoadingMore]=useState(false);
  const [query,setQuery]=useState("");
  const [searchKind,setSearchKind]=useState<"all"|"spaces"|"articles">("all");
  const [scope,setScope]=useState<"current"|"descendants"|"all">("current");
  const [dialog,setDialog]=useState<DialogState|null>(createOnOpen?{kind:"create"}:null);
  const [name,setName]=useState("");
  const [moveTarget,setMoveTarget]=useState<SpaceChoice|null>(null);
  const [deleteMode,setDeleteMode]=useState<"empty"|"move"|"recursive">("empty");
  const [confirmName,setConfirmName]=useState("");
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(true);
  const [treeOpen,setTreeOpen]=useState(false);
  const [dialogImpact,setDialogImpact]=useState<DialogImpact>(null);
  const loadRequest=useRef(0);

  const loadRoots=useCallback(async()=>{
    setLoading(true);
    try{
      const response=await fetch("/api/spaces?parent=root");
      const data=await readApiJson<{spaces:SpaceNode[];meta?:{rootCount:number;spaceCount:number;articleCount:number}}>(response);
      setRoots(data.spaces??[]);
      if(data.meta)setRootMeta(data.meta);
    }finally{
      if(!currentId)setLoading(false);
    }
  },[currentId]);
  const loadCurrent=useCallback(async()=>{
    const requestId=++loadRequest.current;
    if(!currentId){setOverview(null);setPosts([]);setSpaceMatches([]);setNextCursor(null);return}
    setLoading(true);
    try{
      const articleSearchDisabled=Boolean(query.trim()&&searchKind==="spaces");
      const params=new URLSearchParams({scope,q:query});
      const [spaceResponse,postsResponse,matchesResponse]=await Promise.all([
        fetch(`/api/spaces/${currentId}`),
        articleSearchDisabled?Promise.resolve(null):fetch(`/api/spaces/${currentId}/posts?${params}`),
        query.trim()&&searchKind!=="articles"?fetch(`/api/spaces?q=${encodeURIComponent(query.trim())}&root=${currentId}&scope=${scope}`):Promise.resolve(null),
      ]);
      if(requestId!==loadRequest.current)return;
      if(spaceResponse.ok)setOverview((await readApiJson<{space:Overview}>(spaceResponse)).space);
      if(postsResponse?.ok){
        const data=await readApiJson<{rows:SpacePost[];nextCursor:string|null}>(postsResponse);
        setPosts(data.rows??[]);setNextCursor(data.nextCursor??null);
      }else if(articleSearchDisabled){setPosts([]);setNextCursor(null)}
      if(matchesResponse?.ok)setSpaceMatches((await readApiJson<{spaces:SpaceNode[]}>(matchesResponse)).spaces??[]);
      else setSpaceMatches([]);
    }finally{if(requestId===loadRequest.current)setLoading(false)}
  },[currentId,query,scope,searchKind]);
  useEffect(()=>{
    const timer=window.setTimeout(()=>void loadRoots(),0);
    return()=>window.clearTimeout(timer);
  },[loadRoots]);
  useEffect(()=>{
    const timer=window.setTimeout(()=>void loadCurrent(),query?160:0);
    return()=>window.clearTimeout(timer);
  },[loadCurrent,query]);

  const pathLabel=overview?.path.map((item)=>item.name).join(" / ")??"";
  const loadMore=async()=>{
    if(!currentId||!nextCursor||loadingMore)return;
    setLoadingMore(true);
    try{
      const params=new URLSearchParams({scope,q:query,cursor:nextCursor});
      const response=await fetch(`/api/spaces/${currentId}/posts?${params}`);
      if(response.ok){
        const data=await readApiJson<{rows:SpacePost[];nextCursor:string|null}>(response);
        setPosts((current)=>[...current,...(data.rows??[])]);
        setNextCursor(data.nextCursor??null);
      }
    }finally{setLoadingMore(false)}
  };
  const beginDialog=(kind:DialogState["kind"],target?:SpaceNode)=>{
    setDialog({kind,target});
    setName(kind==="rename"&&target?target.name:"");
    setMoveTarget(null);setDeleteMode("empty");setConfirmName("");setMessage("");
    setDialogImpact(target?{descendantCount:target.childCount,articleCount:target.articleCount}:null);
    if(target&&(kind==="move"||kind==="delete")){
      void fetch(`/api/spaces/${target.id}`).then(async(response)=>{
        if(!response.ok)return;
        const data=await readApiJson<{space:Overview}>(response);
        setDialogImpact({descendantCount:data.space.descendantCount,articleCount:data.space.articleCount});
      });
    }
  };
  const submitDialog=async()=>{
    if(!dialog)return;
    const target=dialog.target;
    let response:Response;
    if(dialog.kind==="create"){
      response=await fetch("/api/spaces",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,parentId:currentId})});
    }else if(dialog.kind==="rename"&&target){
      response=await fetch(`/api/spaces/${target.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name})});
    }else if(dialog.kind==="move"&&target){
      response=await fetch(`/api/spaces/${target.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({parentId:moveTarget?.id??null})});
    }else if(dialog.kind==="delete"&&target){
      response=await fetch(`/api/spaces/${target.id}`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:deleteMode,moveTo:moveTarget?.id??target.parentId,confirmName})});
    }else return;
    const data=await readApiJson<{error?:string}>(response);
    if(!response.ok){setMessage(data.error??"操作失败");return}
    if(dialog.kind==="delete"&&target?.id===currentId)setCurrentId(target.parentId);
    setDialog(null);setMessage("");
    await Promise.all([loadRoots(),loadCurrent()]);
  };
  const currentActions=overview?{id:overview.id,parentId:overview.parentId,name:overview.name,slug:overview.slug,sortOrder:overview.sortOrder,childCount:overview.children.length,articleCount:overview.articleCount,updatedAt:overview.updatedAt}:undefined;

  if(!currentId)return <section className="admin-main spaces-root">
    <header className="admin-header"><div><p>PRIVATE KNOWLEDGE</p><h1>知识空间</h1><span>顶级空间彼此独立，只承载私有知识入口。</span></div><button className="new-button" onClick={()=>beginDialog("create")}>＋ 新建顶级空间</button></header>
    <div className="spaces-root-summary"><span>{rootMeta.rootCount} 个顶级空间 · {rootMeta.articleCount} 篇私有文章</span><i/><span>{rootMeta.spaceCount} 个空间节点</span><i/>空间文章不会进入首页或公开归档</div>
    <div className="space-domain-grid">{roots.map((space)=><article className="space-domain-card" key={space.id} onClick={()=>setCurrentId(space.id)}>
      <div><i/><span>{space.childCount} 个子空间</span><SpaceActions space={space} onAction={beginDialog}/></div>
      <h2>{space.name}</h2><p>{space.childPreview||"尚未创建子空间"} · {space.totalArticleCount??space.articleCount} 篇知识文章</p><footer><span>最近更新 {new Date(space.latestActivityAt??space.updatedAt).toLocaleDateString("zh-CN")}</span><b>进入空间 ↗</b></footer>
    </article>)}</div>
    {!roots.length&&!loading&&<div className="space-empty"><i>◇</i><h2>建立第一个知识空间</h2><p>空间只在后台与 MCP 中可见，不会改变公开博客。</p><button onClick={()=>beginDialog("create")}>新建顶级空间</button></div>}
    {dialog&&<SpaceDialog dialog={dialog} impact={dialogImpact} name={name} setName={setName} moveTarget={moveTarget} setMoveTarget={setMoveTarget} deleteMode={deleteMode} setDeleteMode={setDeleteMode} confirmName={confirmName} setConfirmName={setConfirmName} message={message} onClose={()=>setDialog(null)} onSubmit={submitDialog}/>}
  </section>;

  return <section className="admin-main spaces-page">
    <header className="admin-header space-page-header"><div><button className="space-back" onClick={()=>setCurrentId(overview?.parentId??null)}>←</button><p>PRIVATE KNOWLEDGE</p><h1>{overview?.name??"知识空间"}</h1><SpaceBreadcrumb path={overview?.path??[]} onSelect={setCurrentId}/></div><div className="space-header-actions"><button className="space-mobile-tree-toggle" onClick={()=>setTreeOpen(true)}>☰ 空间路径</button><button onClick={()=>beginDialog("create")}>＋ 子空间</button><button className="new-button" onClick={()=>overview&&onCreateArticle(overview.id,pathLabel)}>＋ 新建文章</button>{currentActions&&<SpaceActions space={currentActions} onAction={beginDialog}/>}</div></header>
    <div className="space-workbench">
      {treeOpen&&<button className="space-tree-mobile-backdrop" aria-label="关闭空间树" onClick={()=>setTreeOpen(false)}/>}
      <aside className={`space-tree-panel ${treeOpen?"mobile-open":""}`}><div><b>知识空间</b><button onClick={()=>{setCurrentId(null);setTreeOpen(false)}}>全部</button></div><label><span>⌕</span><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="搜索空间或文章"/></label><div className="space-search-kind"><button className={searchKind==="all"?"active":""} onClick={()=>setSearchKind("all")}>全部</button><button className={searchKind==="spaces"?"active":""} onClick={()=>setSearchKind("spaces")}>空间</button><button className={searchKind==="articles"?"active":""} onClick={()=>setSearchKind("articles")}>正文</button></div><nav>{query&&spaceMatches.length>0&&<div className="space-tree-search-results"><small>空间</small>{spaceMatches.map((space)=><button key={space.id} onClick={()=>{setCurrentId(space.id);setQuery("");setTreeOpen(false)}}><b>{space.name}</b><span>{space.path?.map((item)=>item.name).join(" / ")}</span></button>)}<small>空间树</small></div>}{roots.map((space)=><SpaceTreeNode key={space.id} node={space} currentId={currentId} activePathIds={overview?.path.map((item)=>item.id)??[]} onSelect={(id)=>{setCurrentId(id);setTreeOpen(false)}}/>)}</nav></aside>
      <div className="space-content">
        <div className="space-content-intro"><div><span>{overview?.children.length??0} 个直属子空间 · {overview?.articleCount??0} 篇知识文章</span><p>{pathLabel}</p></div><div className="space-scope"><button className={scope==="current"?"active":""} onClick={()=>setScope("current")}>仅当前空间</button><button className={scope==="descendants"?"active":""} onClick={()=>setScope("descendants")}>包含子空间</button><button className={scope==="all"?"active":""} onClick={()=>setScope("all")}>全部空间</button></div></div>
        {!!overview?.children.length&&<><div className="space-section-heading"><b>子空间</b><span>只展示当前层级</span></div><div className="space-child-grid">{overview.children.map((space)=><article key={space.id} onClick={()=>setCurrentId(space.id)}><div><i/><SpaceActions space={space} onAction={beginDialog}/></div><h3>{space.name}</h3><p>{pathLabel} / {space.name}</p><footer>{space.childCount} 个子空间 · {space.articleCount} 篇文章 <b>↗</b></footer></article>)}</div></>}
        <div className="space-section-heading"><b>{scope==="current"?"直属文章":scope==="descendants"?"空间内文章":"全部私有文章"}</b><span>{query?`搜索“${query}”`:"按最近更新排序"}</span></div>
        <div className="space-article-list">{loading?<p className="space-loading">正在读取空间内容…</p>:posts.map((post)=><article key={post.id}><time>{new Date(post.updatedAt).toLocaleDateString("zh-CN",{month:"2-digit",day:"2-digit"})}</time><div><small>{post.categoryName} · {post.status==="published"?"内容完成":"草稿"}</small><b>{post.title}</b><p>{post.spacePath||post.excerpt||"暂无摘要"}</p></div><div><button onClick={()=>onBrowseArticle(post.id)}>浏览</button><button onClick={()=>onShareArticle(post)}>分享</button><button onClick={()=>onEditArticle(post.id)}>编辑 ↗</button></div></article>)}{!loading&&!posts.length&&<div className="space-empty compact"><h3>{query&&searchKind==="spaces"?"正在按空间名称搜索":"这个空间还很安静"}</h3><p>{query?(searchKind==="spaces"?"匹配空间显示在左侧，正文列表保持隐藏。":"没有找到匹配文章"):"可以创建子空间，或从这里开始写第一篇知识文章。"}</p></div>}{!loading&&nextCursor&&<button className="space-load-more" onClick={()=>void loadMore()} disabled={loadingMore}>{loadingMore?"正在加载…":"继续加载"}</button>}</div>
      </div>
    </div>
    {dialog&&<SpaceDialog dialog={dialog} impact={dialogImpact} name={name} setName={setName} moveTarget={moveTarget} setMoveTarget={setMoveTarget} deleteMode={deleteMode} setDeleteMode={setDeleteMode} confirmName={confirmName} setConfirmName={setConfirmName} message={message} onClose={()=>setDialog(null)} onSubmit={submitDialog}/>}
  </section>;
}

function SpaceBreadcrumb({path,onSelect}:{path:PathNode[];onSelect:(id:number|null)=>void}){
  const [expanded,setExpanded]=useState(false);
  const visible=!expanded&&path.length>4?[path[0],null,...path.slice(-2)]:path;
  return <div className="space-breadcrumb"><button onClick={()=>onSelect(null)}>知识空间</button>{visible.map((item,index)=>item?<span key={item.id}><i>/</i><button onClick={()=>onSelect(item.id)}>{item.name}</button></span>:<span key={`ellipsis-${index}`}><i>/</i><button className="space-breadcrumb-ellipsis" title={path.map((part)=>part.name).join(" / ")} onClick={()=>setExpanded(true)}>…</button></span>)}</div>;
}

function SpaceTreeNode({node,currentId,activePathIds,onSelect}:{node:SpaceNode;currentId:number|null;activePathIds:number[];onSelect:(id:number)=>void}){
  const [open,setOpen]=useState(false);
  const [children,setChildren]=useState<SpaceNode[]>([]);
  const loadChildren=useCallback(async()=>{
    if(children.length||!node.childCount)return;
    const response=await fetch(`/api/spaces?parent=${node.id}`);
    if(response.ok)setChildren((await readApiJson<{spaces:SpaceNode[]}>(response)).spaces??[]);
  },[children.length,node.childCount,node.id]);
  useEffect(()=>{
    if(activePathIds.includes(node.id)&&node.id!==currentId&&node.childCount){
      const timer=window.setTimeout(()=>{
        setOpen(true);
        void loadChildren();
      },0);
      return()=>window.clearTimeout(timer);
    }
  },[activePathIds,currentId,loadChildren,node.childCount,node.id]);
  const toggle=async(event:React.MouseEvent)=>{
    event.stopPropagation();
    if(!open)await loadChildren();
    setOpen((value)=>!value);
  };
  return <div className="space-tree-node"><button className={currentId===node.id?"current":""} onClick={()=>onSelect(node.id)} title={node.name}><i onClick={toggle}>{node.childCount?(open?"⌄":"›"):"·"}</i><span>{node.name}</span><small>{node.articleCount}</small></button>{open&&<div>{children.map((child)=><SpaceTreeNode key={child.id} node={child} currentId={currentId} activePathIds={activePathIds} onSelect={onSelect}/>)}</div>}</div>;
}

function SpaceActions({space,onAction}:{space:SpaceNode;onAction:(kind:DialogState["kind"],target?:SpaceNode)=>void}){
  const [open,setOpen]=useState(false);
  const rootRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!open)return;
    const close=(event:PointerEvent)=>{if(!rootRef.current?.contains(event.target as Node))setOpen(false)};
    document.addEventListener("pointerdown",close);
    return()=>document.removeEventListener("pointerdown",close);
  },[open]);
  return <div className="space-card-actions" ref={rootRef} onClick={(event)=>event.stopPropagation()}><button type="button" aria-label={`${space.name}操作`} aria-expanded={open} onClick={()=>setOpen((value)=>!value)}>···</button>{open&&<div role="menu"><button role="menuitem" onClick={()=>{setOpen(false);onAction("rename",space)}}>重命名</button><button role="menuitem" onClick={()=>{setOpen(false);onAction("move",space)}}>移动空间</button><button role="menuitem" className="danger" onClick={()=>{setOpen(false);onAction("delete",space)}}>删除空间</button></div>}</div>;
}

function SpaceDialog({dialog,impact,name,setName,moveTarget,setMoveTarget,deleteMode,setDeleteMode,confirmName,setConfirmName,message,onClose,onSubmit}:{dialog:DialogState;impact:DialogImpact;name:string;setName:(value:string)=>void;moveTarget:SpaceChoice|null;setMoveTarget:(value:SpaceChoice|null)=>void;deleteMode:"empty"|"move"|"recursive";setDeleteMode:(value:"empty"|"move"|"recursive")=>void;confirmName:string;setConfirmName:(value:string)=>void;message:string;onClose:()=>void;onSubmit:()=>void}){
  const title=dialog.kind==="create"?"新建知识空间":dialog.kind==="rename"?"重命名空间":dialog.kind==="move"?"移动空间":"删除空间";
  return <div className="space-dialog-backdrop" onMouseDown={(event)=>event.target===event.currentTarget&&onClose()}><div className="space-dialog"><header><div><small>SPACE MANAGEMENT</small><h2>{title}</h2></div><button onClick={onClose}>×</button></header>
    {(dialog.kind==="create"||dialog.kind==="rename")&&<label>空间名称<input autoFocus value={name} onChange={(event)=>setName(event.target.value)} placeholder="例如：QSG、技术知识、个人项目"/></label>}
    {dialog.kind==="move"&&<><p>将同时移动 {impact?.descendantCount??0} 个后代空间和 {impact?.articleCount??0} 篇文章。</p><AdminSpacePicker value={moveTarget?.id??null} path={moveTarget?.id===0?"知识空间根层":moveTarget?.path?.map((item)=>item.name).join(" / ")} onChange={setMoveTarget} allowPublic={false} allowRoot excludeBranchId={dialog.target?.id} label="选择目标"/></>}
    {dialog.kind==="delete"&&<><p>此空间包含 {impact?.descendantCount??0} 个后代空间和 {impact?.articleCount??0} 篇文章，请明确选择处理方式。</p><div className="space-delete-options"><button className={deleteMode==="empty"?"selected":""} onClick={()=>setDeleteMode("empty")}><b>仅空空间删除</b><small>有内容时拒绝操作</small></button><button className={deleteMode==="move"?"selected":""} onClick={()=>setDeleteMode("move")}><b>移动内容后删除</b><small>保留文章和子空间</small></button><button className={deleteMode==="recursive"?"selected danger":""} onClick={()=>setDeleteMode("recursive")}><b>递归删除</b><small>删除所有后代与文章</small></button></div>{deleteMode==="move"&&<AdminSpacePicker value={moveTarget?.id??null} path={moveTarget?.path?.map((item)=>item.name).join(" / ")} onChange={setMoveTarget} allowPublic={false} excludeBranchId={dialog.target?.id} label="选择接收空间"/>}{deleteMode==="recursive"&&<label>输入“{dialog.target?.name}”确认<input value={confirmName} onChange={(event)=>setConfirmName(event.target.value)}/></label>}</>}
    {message&&<p className="space-dialog-message">{message}</p>}<footer><button onClick={onClose}>取消</button><button className={dialog.kind==="delete"&&deleteMode==="recursive"?"danger":""} onClick={()=>void onSubmit()} disabled={((dialog.kind==="create"||dialog.kind==="rename")&&!name.trim())||(dialog.kind==="move"&&!moveTarget)||(dialog.kind==="delete"&&deleteMode==="move"&&!moveTarget)||(dialog.kind==="delete"&&deleteMode==="recursive"&&confirmName!==dialog.target?.name)}>确认</button></footer>
  </div></div>;
}
