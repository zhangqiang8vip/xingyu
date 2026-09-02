"use client";

import React, { useState } from "react";
import { readApiJson } from "@/app/api-response";

export type EditableCategory={id:number;name:string;slug:string;color:string};
export default function AdminCategoriesPanel({initial,onChange}:{initial:EditableCategory[];onChange:(items:EditableCategory[])=>void}){
  const [items,setItems]=useState(initial);const [message,setMessage]=useState("");
  const commit=(next:EditableCategory[])=>{setItems(next);onChange(next)};
  const update=(id:number,key:keyof EditableCategory,value:string)=>commit(items.map(item=>item.id===id?{...item,[key]:value}:item));
  async function save(item:EditableCategory){const response=await fetch(`/api/categories/${item.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(item)});const data=await readApiJson<{category:EditableCategory}>(response);if(!response.ok)return setMessage(data.error??"保存失败");commit(items.map(current=>current.id===item.id?data.category:current));setMessage(`“${data.category.name}”已保存`)}
  async function remove(item:EditableCategory){if(!confirm(`确定删除“${item.name}”吗？`))return;const response=await fetch(`/api/categories/${item.id}`,{method:"DELETE"});const data=await readApiJson<Record<string,never>>(response);if(!response.ok)return setMessage(data.error??"删除失败");commit(items.filter(current=>current.id!==item.id));setMessage("分类已删除")}
  async function create(){const name=prompt("新分类名称");if(!name?.trim())return;const response=await fetch("/api/categories",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name})});const data=await readApiJson<{category:EditableCategory}>(response);if(!response.ok)return setMessage(data.error??"创建失败");commit([...items,data.category]);setMessage(`“${data.category.name}”已创建`)}
  return <section className="admin-main admin-config-main"><header className="admin-header"><div><p>CONTENT TAXONOMY</p><h1>分类管理</h1><span>名称、链接标识和强调色会同步到首页、归档和关于页。</span></div><button className="new-button" onClick={create}>＋ 新增分类</button></header><div className="category-manager">{items.map((item,index)=><article key={item.id} style={{"--category-color":item.color} as React.CSSProperties}><header><i/><span>{String(index+1).padStart(2,"0")}</span><b>{item.name}</b></header><div><label>名称<input value={item.name} onChange={e=>update(item.id,"name",e.target.value)}/></label><label>Slug<input value={item.slug} onChange={e=>update(item.id,"slug",e.target.value)}/></label><label>颜色<input type="color" value={item.color} onChange={e=>update(item.id,"color",e.target.value)}/></label></div><footer><button onClick={()=>remove(item)}>删除</button><button onClick={()=>save(item)}>保存更改</button></footer></article>)}</div><div className="category-manager-message">{message||`${items.length} 个分类 · 仅空分类可以删除`}</div></section>;
}
