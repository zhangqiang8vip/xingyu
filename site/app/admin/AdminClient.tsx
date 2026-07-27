"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AdminSettingsPanel, { type SiteSettingsForm } from "./AdminSettingsPanel";
import AdminPageEditor, { type EditablePage } from "./AdminPageEditor";
import { CONTENT_LIMITS } from "../site-config";
import AdminCategoriesPanel from "./AdminCategoriesPanel";
import AdminSpacesPanel from "./AdminSpacesPanel";
import ArticleWritingStudio, { useSplitScrollSync } from "./ArticleWritingStudio";
import AdminArticleSearch from "./AdminArticleSearch";
import AdminBrowsePanel from "./AdminBrowsePanel";
import AdminArticlesPanel from "./AdminArticlesPanel";
import AdminSidebar from "./AdminSidebar";
import AdminArticleEditor from "./AdminArticleEditor";
import type { AdminCategory, AdminPost, AdminSection, AdminStats, ArticleForm } from "./admin-types";
import { readApiJson } from "../api-response";
import ModalPostLink from "../ModalPostLink";

const emptyForm = (categoryId = 1,spaceId:number|null=null,spacePath=""): ArticleForm => ({ title: "", slug: "", excerpt: "", content: "", categoryId, spaceId,spacePath,status: "draft", featured: false, publishedAt:null });

export default function AdminClient({ categories:initialCategories, settings, connectPage, aboutPage, stats:initialStats, userName, signOutPath }: { categories: AdminCategory[]; settings:SiteSettingsForm; connectPage:EditablePage; aboutPage:EditablePage; stats:AdminStats; userName: string; signOutPath: string }) {
  const articleEditorPreviewRef=useRef<HTMLDivElement>(null);
  const [section,setSection]=useState<AdminSection>("browse");
  const [spaceLandingId,setSpaceLandingId]=useState<number|null>(null);
  const [createSpaceOnOpen,setCreateSpaceOnOpen]=useState(false);
  const [categories,setCategories]=useState(initialCategories);
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<ArticleForm | null>(null);
  const [message, setMessage] = useState("");
  const [stats,setStats]=useState(initialStats);
  const [studio,setStudio]=useState<null|"code"|"split"|"reading">(null);
  const [sidebarCollapsed,setSidebarCollapsed]=useState(false);
  useSplitScrollSync(articleEditorPreviewRef,Boolean(form));
  const selectedFormCategory = form ? categories.find((item) => item.id === form.categoryId) : undefined;

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    const params = new URLSearchParams({ pageSize: String(CONTENT_LIMITS.adminBatch), q: query, category, status });
    if (cursor) params.set("cursor", cursor);
    try {
      const response = await fetch(`/api/posts?${params}`, { signal });
      const data = await readApiJson<{rows:AdminPost[];nextCursor:string|null}>(response);
      if (!signal?.aborted) { setPosts(data.rows ?? []); setNextCursor(data.nextCursor ?? null); }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setMessage("文章列表读取失败，请稍后重试");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [cursor, query, category, status]);

  const loadStats = useCallback(async () => {
    const response = await fetch("/api/stats");
    if (response.ok) setStats((await readApiJson<{stats:AdminStats}>(response)).stats);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const task = window.setTimeout(() => { void load(controller.signal); }, 160);
    return () => { window.clearTimeout(task); controller.abort(); };
  }, [load]);

  useEffect(()=>{
    const frame=window.requestAnimationFrame(()=>{
      setSidebarCollapsed(window.localStorage.getItem("xingyu:admin-sidebar") === "collapsed");
    });
    return()=>window.cancelAnimationFrame(frame);
  },[]);

  function toggleSidebar(){
    setSidebarCollapsed((current)=>{
      const next=!current;
      window.localStorage.setItem("xingyu:admin-sidebar",next?"collapsed":"expanded");
      return next;
    });
  }

  function resetCursor() {
    setCursor(null);
    setCursorStack([]);
  }

  function closeEditor() {
    setStudio(null);
    setForm(null);
  }

  function openNewArticle(spaceId:number|null=null,spacePath="") {
    setStudio(null);
    setForm(emptyForm(categories[0]?.id,spaceId,spacePath));
    setMessage("");
  }

  function previousBatch() {
    const history = [...cursorStack];
    setCursor(history.pop() ?? null);
    setCursorStack(history);
  }

  function nextBatch() {
    if (!nextCursor) return;
    setCursorStack((history) => [...history, cursor]);
    setCursor(nextCursor);
  }

  async function save() {
    if (!form) return;
    const response = await fetch(form.id ? `/api/posts/${form.id}` : "/api/posts", {
      method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const data = await readApiJson<{post:ArticleForm}>(response);
    if (!response.ok) return setMessage(data.error ?? "保存失败");
    setMessage("保存成功"); closeEditor(); await Promise.all([load(), loadStats()]);
  }

  async function loadArticle(postId:number){
    const response=await fetch(`/api/posts/${postId}`);
    const data=await readApiJson<{post:ArticleForm}>(response);
    return response.ok?data.post:null;
  }

  async function editById(postId:number){
    const article=await loadArticle(postId);
    if(article){setStudio(null);setForm(article);setMessage("")}
  }

  async function browseById(postId:number){
    const article=await loadArticle(postId);
    if(!article)return setMessage("文章暂时无法打开，请稍后再试");
    setStudio(null);setForm(null);setMessage("");
    window.dispatchEvent(new CustomEvent("xingyu:admin-reader-open",{detail:{publicId:article.publicId}}));
  }

  function changeSpace(choice:{id:number;name:string;path?:Array<{id:number;name:string}>}|null){
    if(!form)return;
    const nextSpaceId=choice?.id??null;
    if(form.spaceId===nextSpaceId)return;
    if(form.id&&form.spaceId===null&&nextSpaceId!==null){
      if(!window.confirm("这篇文章保存后将离开公开博客，只能由管理员和 MCP 检索。确认移入知识空间吗？"))return;
    }
    if(form.id&&form.spaceId!==null&&nextSpaceId===null){
      const consequence=form.status==="published"
        ?"这篇文章当前为“内容完成”，保存后会立即进入公开博客并可被所有人访问。"
        :"这篇文章会移回公开博客草稿区，发布后才会公开访问。";
      if(!window.confirm(`${consequence}\n\n确认移出知识空间吗？`))return;
    }
    setForm({...form,spaceId:nextSpaceId,spacePath:choice?.path?.map((item)=>item.name).join(" / ")??"",featured:nextSpaceId===null?form.featured:false});
  }

  async function remove(post: AdminPost) {
    if (!window.confirm(`确定删除《${post.title}》吗？`)) return;
    await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
    await Promise.all([load(), loadStats()]);
  }

  async function signOut() {
    if (signOutPath.startsWith("/api/")) {
      await fetch(signOutPath, { method: "POST" });
      window.location.replace("/admin/login");
      return;
    }
    window.location.href = signOutPath;
  }

  function changeSection(next:AdminSection){
    if(next==="spaces"){
      setCreateSpaceOnOpen(false);
      setSpaceLandingId(null);
    }
    setSection(next);
  }

  return (
    <main className={`admin-shell${sidebarCollapsed?" sidebar-collapsed":""}`}>
      <AdminSidebar brandName={settings.brandName} avatarUrl={settings.avatarUrl} authorName={settings.authorName} userName={userName} section={section} stats={stats} categoryCount={categories.length} collapsed={sidebarCollapsed} onSectionChange={changeSection} onToggle={toggleSidebar} onSignOut={()=>void signOut()}/>
      <div className="admin-search-island">
        <AdminArticleSearch disabled={Boolean(form||studio)} articleCount={stats.total+stats.privateArticles} onBrowse={(postId)=>void browseById(postId)}/>
      </div>

      {section==="browse" ? <AdminBrowsePanel settings={settings} categories={categories} stats={stats} onEdit={(postId)=>void editById(postId)} onWrite={()=>openNewArticle()} onOpenArticles={()=>setSection("articles")} onOpenSpaces={(spaceId)=>{setCreateSpaceOnOpen(false);setSpaceLandingId(spaceId??null);setSection("spaces")}} /> : section==="home" ? <AdminSettingsPanel initial={settings} /> : section==="articles" ? <AdminArticlesPanel brandName={settings.brandName} stats={stats} posts={posts} categories={categories} loading={loading} query={query} category={category} status={status} batch={cursorStack.length+1} hasPrevious={cursorStack.length>0} hasNext={Boolean(nextCursor)} onQueryChange={(value)=>{setQuery(value);resetCursor()}} onCategoryChange={(value)=>{setCategory(value);resetCursor()}} onStatusChange={(value)=>{setStatus(value);resetCursor()}} onNew={()=>openNewArticle()} onBrowse={(postId)=>void browseById(postId)} onEdit={(postId)=>void editById(postId)} onRemove={(post)=>void remove(post)} onPrevious={previousBatch} onNext={nextBatch}/> : section==="spaces" ? <AdminSpacesPanel initialSpaceId={spaceLandingId} createOnOpen={createSpaceOnOpen} onCreateArticle={(spaceId,spacePath)=>openNewArticle(spaceId,spacePath)} onEditArticle={(postId)=>void editById(postId)} onBrowseArticle={(postId)=>void browseById(postId)} /> : section==="connect" ? <AdminPageEditor initial={connectPage} settings={settings} kind="connect" label="接入" /> : section==="about" ? <AdminPageEditor initial={aboutPage} settings={settings} kind="about" label="关于" /> : <AdminCategoriesPanel initial={categories} onChange={setCategories} />}

      {form&&<AdminArticleEditor form={form} category={selectedFormCategory} categories={categories} settings={settings} message={message} previewRef={articleEditorPreviewRef} onChange={setForm} onChangeSpace={changeSpace} onClose={closeEditor} onOpenStudio={setStudio} onSave={save}/>}
      {form&&studio&&<ArticleWritingStudio draft={form} categoryName={selectedFormCategory?.name??"随笔"} categoryColor={selectedFormCategory?.color??"#8E8E93"} authorName={settings.authorName} avatarUrl={settings.avatarUrl} initialMode={studio} onChange={(content)=>setForm(current=>current?{...current,content}:current)} onClose={()=>setStudio(null)}/>}
      <ModalPostLink controllerOnly readerScope="admin" publicId="" slug="" onEdit={(postId)=>void editById(postId)}/>
    </main>
  );
}
