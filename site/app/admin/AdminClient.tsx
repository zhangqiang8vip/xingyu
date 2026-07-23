"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import VditorEditor from "./VditorEditor";
import { postPath } from "../post-path";
import AdminSettingsPanel, { type SiteSettingsForm } from "./AdminSettingsPanel";
import AdminPageEditor, { type EditablePage } from "./AdminPageEditor";
import { CONTENT_LIMITS } from "../site-config";
import AdminCategoriesPanel from "./AdminCategoriesPanel";
import ArticleWritingStudio from "./ArticleWritingStudio";
import ThemeToggle from "../ThemeToggle";
import { readApiJson } from "../api-response";

type Category = { id: number; name: string; slug: string; color: string };
type Post = { id: number; publicId:string; title: string; slug: string; excerpt: string; categoryId: number; categoryName: string; status: string; featured: boolean; viewCount: number; publishedAt: string | null; updatedAt: string };
type FormData = { id?: number; publicId?:string; title: string; slug: string; excerpt: string; content: string; categoryId: number; status: "draft" | "published"; featured: boolean; publishedAt?:string | null };
type Stats = { total:number; published:number; drafts:number; views:number };
const emptyForm = (categoryId = 1): FormData => ({ title: "", slug: "", excerpt: "", content: "", categoryId, status: "draft", featured: false, publishedAt:null });

function slugPreview(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]+/gu, "").replace(/-+/g, "-") || "your-article";
}

function toLocalDateTime(value?:string|null){
  if(!value)return "";
  const date=new Date(value); if(Number.isNaN(date.getTime()))return "";
  const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,16);
}

export default function AdminClient({ categories:initialCategories, settings, aboutPage, stats:initialStats, userName, signOutPath }: { categories: Category[]; settings:SiteSettingsForm; aboutPage:EditablePage; stats:Stats; userName: string; signOutPath: string }) {
  const [section,setSection]=useState<"home"|"articles"|"page"|"categories">("home");
  const [categories,setCategories]=useState(initialCategories);
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormData | null>(null);
  const [message, setMessage] = useState("");
  const [slugCopied, setSlugCopied] = useState(false);
  const [stats,setStats]=useState(initialStats);
  const [studio,setStudio]=useState<null|"code"|"split"|"reading">(null);
  const selectedFormCategory = form ? categories.find((item) => item.id === form.categoryId) : undefined;

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    const params = new URLSearchParams({ pageSize: String(CONTENT_LIMITS.adminBatch), q: query, category, status });
    if (cursor) params.set("cursor", cursor);
    try {
      const response = await fetch(`/api/posts?${params}`, { signal });
      const data = await readApiJson<{rows:Post[];nextCursor:string|null}>(response);
      if (!signal?.aborted) { setPosts(data.rows ?? []); setNextCursor(data.nextCursor ?? null); }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setMessage("文章列表读取失败，请稍后重试");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [cursor, query, category, status]);

  const loadStats = useCallback(async () => {
    const response = await fetch("/api/stats");
    if (response.ok) setStats((await readApiJson<{stats:Stats}>(response)).stats);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const task = window.setTimeout(() => { void load(controller.signal); }, 160);
    return () => { window.clearTimeout(task); controller.abort(); };
  }, [load]);

  function resetCursor() {
    setCursor(null);
    setCursorStack([]);
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

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const response = await fetch(form.id ? `/api/posts/${form.id}` : "/api/posts", {
      method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const data = await readApiJson<{post:FormData}>(response);
    if (!response.ok) return setMessage(data.error ?? "保存失败");
    setMessage("保存成功"); setForm(null); await Promise.all([load(), loadStats()]);
  }

  async function edit(post: Post) {
    const response = await fetch(`/api/posts/${post.id}`);
    const data = await readApiJson<{post:FormData}>(response);
    setForm(data.post); setMessage("");
  }

  async function remove(post: Post) {
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

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-top"><Link className="brand admin-brand" href="/">{settings.brandName}<span>。</span></Link><div className="admin-mobile-actions"><Link href="/" target="_blank" aria-label="查看前台">↗</Link><button type="button" onClick={signOut} aria-label="安全退出">⏻</button></div><ThemeToggle /></div>
        <nav><button className={section==="home"?"selected":""} onClick={()=>setSection("home")}><span>首页设置</span><b>01</b></button><button className={section==="articles"?"selected":""} onClick={()=>setSection("articles")}><span>文章管理</span><b>{stats.total}</b></button><button className={section==="page"?"selected":""} onClick={()=>setSection("page")}><span>关于设置</span><b>03</b></button><button className={section==="categories"?"selected":""} onClick={()=>setSection("categories")}><span>分类管理</span><b>{categories.length}</b></button><Link className="admin-desktop-utility" href="/" target="_blank">查看前台 ↗</Link><button className="admin-desktop-utility" onClick={signOut}>安全退出 <b>↗</b></button></nav>
        <div className="admin-user"><img src={settings.avatarUrl} alt={`${settings.authorName}管理员`} /><div><b>{userName}</b><small>管理员</small></div></div>
      </aside>

      {section==="home" ? <AdminSettingsPanel initial={settings} /> : section==="articles" ? <section className="admin-main">
        <header className="admin-header"><div><p>CONTENT</p><h1>文章管理</h1><span>管理、筛选并发布{settings.brandName}的全部内容。</span></div><button className="new-button" onClick={() => setForm(emptyForm(categories[0]?.id))}>＋ 新建文章</button></header>
        <div className="stats admin-real-stats"><div><span>全部文章</span><b>{stats.total.toLocaleString()}</b></div><div><span>已发布</span><b>{stats.published.toLocaleString()}</b></div><div><span>草稿</span><b>{stats.drafts.toLocaleString()}</b></div><div><span>总阅读量</span><b>{stats.views.toLocaleString()}</b></div></div>
        <div className="table-tools">
          <div className="admin-search"><span>⌕</span><input value={query} onChange={(e) => { setQuery(e.target.value); resetCursor(); }} placeholder="全文搜索标题、摘要或正文" /></div>
          <select value={category} onChange={(e) => { setCategory(e.target.value); resetCursor(); }}><option value="all">全部分类</option>{categories.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}</select>
          <select value={status} onChange={(e) => { setStatus(e.target.value); resetCursor(); }}><option value="all">全部状态</option><option value="published">已发布</option><option value="draft">草稿</option></select>
        </div>
        <div className="table-wrap">
          <table><thead><tr><th>文章</th><th>分类</th><th>状态</th><th>浏览</th><th>发布时间</th><th>操作</th></tr></thead>
            <tbody>{loading ? <tr><td colSpan={6} className="table-empty">正在读取文章…</td></tr> : posts.length === 0 ? <tr><td colSpan={6} className="table-empty">没有符合条件的文章</td></tr> : posts.map(post => (
              <tr key={post.id}><td data-label="文章"><div className="title-cell"><span>{post.id}</span><div><b>{post.title}</b><small>/{post.slug}</small></div></div></td><td data-label="分类">{post.categoryName}</td><td data-label="状态"><i className={`status ${post.status}`} />{post.status === "published" ? "已发布" : "草稿"}</td><td data-label="浏览">{post.viewCount.toLocaleString()}</td><td data-label="发布">{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("zh-CN") : "—"}</td><td data-label="操作"><div className="row-actions"><button onClick={() => edit(post)}>编辑</button><button className="danger" onClick={() => remove(post)}>删除</button></div></td></tr>
            ))}</tbody></table>
        </div>
        <div className="table-footer"><span>游标分页 · 第 {cursorStack.length + 1} 批{posts.length ? ` · 当前 ${posts.length} 篇` : ""}</span><div><button disabled={cursorStack.length === 0} onClick={previousBatch}>←</button><button disabled={!nextCursor} onClick={nextBatch}>→</button></div></div>
      </section> : section==="page" ? <AdminPageEditor initial={aboutPage} settings={settings} /> : <AdminCategoriesPanel initial={categories} onChange={setCategories} />}

      {form && <div className="editor-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setForm(null)}><form className="editor-panel" onSubmit={save} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") e.currentTarget.requestSubmit(); }}>
        <header className="editor-header">
          <div><small>{form.id ? `EDITING · ARTICLE ${form.id}` : "COMPOSE · NEW ARTICLE"}</small><h2>{form.id ? "编辑文章" : "写一篇新文章"}</h2><p>编辑内容、检查链接，然后发布到{settings.brandName}。</p></div>
          <div className="editor-header-actions"><button className="editor-preview-button" type="button" onClick={()=>setStudio("reading")}>即时预览 <b>↗</b></button><span className={`editor-state ${form.status}`}>{form.status === "published" ? "已发布" : "草稿"}</span><button type="button" aria-label="关闭编辑器" onClick={() => {setStudio(null);setForm(null)}}>×</button></div>
        </header>

        <div className="editor-form-body">
          <section className="editor-section metadata-section">
            <div className="editor-section-title"><span>01</span><div><b>文章信息</b><small>标题、链接与首页摘要</small></div></div>
            <label className="title-field">文章标题<input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="输入一个清晰、有吸引力的标题" /></label>
            <div className="form-row"><label>Slug<input value={form.slug} onChange={e => { setForm({ ...form, slug: e.target.value }); setSlugCopied(false); }} placeholder="留空将根据标题自动生成" /></label><label>分类<select value={form.categoryId} onChange={e => setForm({ ...form, categoryId: Number(e.target.value) })}>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>
            <div className="slug-preview">
              <div className="slug-icon">↗</div>
              <div className="slug-copy"><small>文章访问地址 · 永久 ID</small><p><span>{settings.brandName}</span><i>/</i><span>posts</span><i>/</i>{form.publicId&&<><span>{form.publicId.slice(0,8)}…</span><i>/</i></>}<b>{slugPreview(form.slug || form.title)}</b></p></div>
              <span className="slug-category" style={{ color: selectedFormCategory?.color }}>{selectedFormCategory?.name ?? "未分类"}</span>
              <button type="button" onClick={async () => { const slug=slugPreview(form.slug || form.title); const path=form.publicId?postPath({publicId:form.publicId,slug}):`/posts/${slug}`; await navigator.clipboard.writeText(`${window.location.origin}${path}`); setSlugCopied(true); }}>{slugCopied ? "已复制" : "复制链接"}</button>
            </div>
            <label>文章摘要<textarea rows={3} value={form.excerpt} onChange={e => setForm({ ...form, excerpt: e.target.value })} placeholder="用一两句话告诉读者这篇文章讲什么" /></label>
          </section>

          <section className="editor-section writing-section">
            <div className="editor-section-title"><span>02</span><div><b>正文内容</b><small>专注写作，右侧同步预览</small></div><button className="writing-launch" type="button" onClick={()=>setStudio("split")}><i>↗</i> 打开沉浸写作</button></div>
            <div className="md-field">
              <div className="md-field-head"><span>Markdown</span><span className="paste-status">输入 / 查看指令 · Ctrl+V 粘贴图片 · 右侧实时预览</span></div>
              <VditorEditor value={form.content} onChange={(content) => setForm((current) => current ? { ...current, content } : current)} />
            </div>
          </section>

          <section className="editor-section publish-section">
            <div className="editor-section-title"><span>03</span><div><b>发布设置</b><small>决定文章如何出现在前台</small></div></div>
            <div className="form-row"><label>发布状态<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as FormData["status"] })}><option value="draft">保存为草稿</option><option value="published">立即发布</option></select></label><label>发布时间<input type="datetime-local" value={toLocalDateTime(form.publishedAt)} onChange={e=>setForm({...form,publishedAt:e.target.value?new Date(e.target.value).toISOString():null})} /></label></div><label className="check"><input type="checkbox" checked={form.featured} onChange={e => setForm({ ...form, featured: e.target.checked })} /><span><b>设为精选文章</b><small>优先展示在首页首张大卡片</small></span></label>
          </section>
          {message && <p className="form-message">{message}</p>}
        </div>

        <footer className="editor-footer"><span>⌘ Enter 快速保存</span><div><button type="button" onClick={() => setForm(null)}>取消</button><button className="save-button" type="submit">{form.status === "published" ? "保存并发布" : "保存草稿"}<i>→</i></button></div></footer>
      </form></div>}
      {form&&studio&&<ArticleWritingStudio draft={form} categoryName={selectedFormCategory?.name??"未分类"} categoryColor={selectedFormCategory?.color??"#0071e3"} authorName={settings.authorName} avatarUrl={settings.avatarUrl} initialMode={studio} onChange={(content)=>setForm(current=>current?{...current,content}:current)} onClose={()=>setStudio(null)}/>} 
    </main>
  );
}
