"use client";

import { FormEvent, useState } from "react";
import VditorEditor from "./VditorEditor";
import type { SiteSettingsForm } from "./AdminSettingsPanel";
import { AboutLivePreview } from "./AdminLivePreview";
import { readApiJson } from "../api-response";

export type EditablePage = { slug:string; eyebrow:string; title:string; excerpt:string; content:string };

export default function AdminPageEditor({ initial, settings }: { initial:EditablePage; settings:SiteSettingsForm }) {
  const [form,setForm]=useState(initial); const [saving,setSaving]=useState(false); const [message,setMessage]=useState("");
  const [preview,setPreview]=useState(false);
  async function save(event:FormEvent){event.preventDefault();setSaving(true);setMessage("");const response=await fetch(`/api/pages/${form.slug}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});const data=await readApiJson<{page:EditablePage}>(response);setSaving(false);if(!response.ok)return setMessage(data.error??"保存失败");setForm(data.page);setMessage("页面已发布，前台刷新后立即生效");}
  return <><section className="admin-main admin-config-main">
    <header className="admin-header"><div><p>ABOUT EXPERIENCE</p><h1>关于设置</h1><span>使用与文章相同的 Markdown 工作流维护独立页面。</span></div><button className="config-preview-link" type="button" onClick={()=>setPreview(true)}>即时预览 <b>↗</b></button></header>
    <form className="config-form page-config-form" onSubmit={save}>
      <section className="editor-section"><div className="editor-section-title"><span>01</span><div><b>页面封面</b><small>标题与简介沿用前台排版比例</small></div></div>
        <label>眉题<input value={form.eyebrow} onChange={e=>setForm({...form,eyebrow:e.target.value})} /></label>
        <label className="title-field">页面标题<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} /></label>
        <label>开场简介<textarea rows={4} value={form.excerpt} onChange={e=>setForm({...form,excerpt:e.target.value})} /></label>
        <div className="about-admin-preview"><div><small>{form.eyebrow}</small><b>{form.title}</b><p>{form.excerpt}</p></div><img src={settings.avatarUrl} alt={`${settings.authorName}头像`} /></div>
      </section>
      <section className="editor-section writing-section"><div className="editor-section-title"><span>02</span><div><b>页面正文</b><small>Markdown 编辑与实时预览</small></div><em>VDITOR · MARKDOWN</em></div><VditorEditor value={form.content} onChange={(content)=>setForm((current)=>({...current,content}))} /></section>
      <footer className="config-footer"><span>{message||"正文样式与前台文章阅读区保持一致"}</span><button disabled={saving} className="save-button">{saving?"正在保存…":"保存关于页面"}<i>→</i></button></footer>
    </form>
  </section>{preview&&<AboutLivePreview page={form} settings={settings} onClose={()=>setPreview(false)}/>}</>;
}
