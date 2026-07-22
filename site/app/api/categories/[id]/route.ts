import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { ensureDatabase } from "../../../../db/bootstrap";
import { categories, posts } from "../../../../db/schema";
import { isAdminRequest, unauthorized } from "../../admin-auth";
import { slugify } from "../../posts/post-input";

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!(await isAdminRequest(request)))return unauthorized(); await ensureDatabase();
  const {id}=await params; const payload=await request.json() as {name?:string;slug?:string;color?:string};
  const name=payload.name?.trim(); if(!name)return Response.json({error:"分类名称不能为空"},{status:400});
  try{const [category]=await getDb().update(categories).set({name,slug:slugify(payload.slug||name),color:payload.color||"#0071e3"}).where(eq(categories.id,Number(id))).returning();return category?Response.json({category}):Response.json({error:"分类不存在"},{status:404});}
  catch{return Response.json({error:"分类名称或 Slug 已存在"},{status:409});}
}

export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!(await isAdminRequest(request)))return unauthorized(); await ensureDatabase(); const {id}=await params;
  const usage=await getDb().select({value:sql<number>`count(*)`}).from(posts).where(eq(posts.categoryId,Number(id)));
  if(Number(usage[0]?.value??0)>0)return Response.json({error:"该分类仍有文章，暂时不能删除"},{status:409});
  await getDb().delete(categories).where(eq(categories.id,Number(id))); return Response.json({ok:true});
}
