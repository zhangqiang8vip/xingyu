import { env } from "cloudflare:workers";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from ".";
import { ensureDatabase } from "./bootstrap";
import { posts, spaces } from "./schema";

export type SpaceSummary = {
  id:number;
  parentId:number|null;
  name:string;
  slug:string;
  sortOrder:number;
  createdAt:string;
  updatedAt:string;
  childCount:number;
  articleCount:number;
  totalArticleCount?:number;
  latestActivityAt?:string;
  childPreview:string|null;
};
export type SpacePostRow={
  id:number;publicId:string;title:string;slug:string;excerpt:string;status:"draft"|"published";
  featured:number|boolean;viewCount:number;publishedAt:string|null;updatedAt:string;
  categoryId:number;categoryName:string|null;categoryColor:string|null;spaceId:number;spacePath:string;
};

export class SpaceWriteError extends Error {
  constructor(message:string,readonly status:400|404|409=400){
    super(message);
    this.name="SpaceWriteError";
  }
}

export function slugifySpace(value:string){
  return value.trim().toLowerCase().replace(/\s+/g,"-").replace(/[^\p{L}\p{N}-]+/gu,"").replace(/-+/g,"-")||`space-${Date.now()}`;
}

export async function listSpaceChildren(parentId:number|null){
  await ensureDatabase();
  const result=await env.DB.prepare(`SELECT
    s.id, s.parent_id AS parentId, s.name, s.slug, s.sort_order AS sortOrder,
    s.created_at AS createdAt, s.updated_at AS updatedAt,
    (SELECT count(*) FROM spaces child WHERE child.parent_id=s.id) AS childCount,
    (SELECT count(*) FROM posts p WHERE p.space_id=s.id) AS articleCount,
    (SELECT group_concat(name,' · ') FROM (
      SELECT name FROM spaces child WHERE child.parent_id=s.id
      ORDER BY child.sort_order ASC,child.name COLLATE NOCASE ASC,child.id ASC LIMIT 3
    )) AS childPreview
    FROM spaces s
    WHERE ((? IS NULL AND s.parent_id IS NULL) OR s.parent_id=?)
    ORDER BY s.sort_order ASC, s.name COLLATE NOCASE ASC, s.id ASC`)
    .bind(parentId,parentId).all<SpaceSummary>();
  const rows=(result.results??[]).map((row)=>({...row,childCount:Number(row.childCount),articleCount:Number(row.articleCount)}));
  if(parentId!==null||!rows.length)return rows;
  // Root cards represent whole knowledge domains, so their count and activity
  // include every descendant without loading the tree into the browser.
  const totals=await env.DB.prepare(`WITH RECURSIVE hierarchy(root_id,id,updated_at) AS (
      SELECT id,id,updated_at FROM spaces WHERE parent_id IS NULL
      UNION ALL
      SELECT hierarchy.root_id,child.id,child.updated_at
      FROM spaces child JOIN hierarchy ON child.parent_id=hierarchy.id
    )
    SELECT hierarchy.root_id AS rootId,
      count(posts.id) AS totalArticleCount,
      max(CASE
        WHEN posts.updated_at IS NULL OR hierarchy.updated_at >= posts.updated_at THEN hierarchy.updated_at
        ELSE posts.updated_at
      END) AS latestActivityAt
    FROM hierarchy
    LEFT JOIN posts ON posts.space_id=hierarchy.id
    GROUP BY hierarchy.root_id`).all<{rootId:number;totalArticleCount:number;latestActivityAt:string}>();
  const byRoot=new Map((totals.results??[]).map((row)=>[row.rootId,row]));
  return rows.map((row)=>{
    const total=byRoot.get(row.id);
    return {
      ...row,
      totalArticleCount:Number(total?.totalArticleCount??row.articleCount),
      latestActivityAt:total?.latestActivityAt??row.updatedAt,
    };
  });
}

export async function getSpaceRootStats(){
  await ensureDatabase();
  const row=await env.DB.prepare(`SELECT
    (SELECT count(*) FROM spaces WHERE parent_id IS NULL) AS rootCount,
    (SELECT count(*) FROM spaces) AS spaceCount,
    (SELECT count(*) FROM posts WHERE space_id IS NOT NULL) AS articleCount`)
    .first<{rootCount:number;spaceCount:number;articleCount:number}>();
  return {
    rootCount:Number(row?.rootCount??0),
    spaceCount:Number(row?.spaceCount??0),
    articleCount:Number(row?.articleCount??0),
  };
}

export async function getSpace(spaceId:number){
  await ensureDatabase();
  const rows=await getDb().select().from(spaces).where(eq(spaces.id,spaceId)).limit(1);
  return rows[0]??null;
}

export async function getSpacePath(spaceId:number){
  await ensureDatabase();
  const result=await env.DB.prepare(`WITH RECURSIVE ancestors(id,parent_id,name,slug,depth) AS (
      SELECT id,parent_id,name,slug,0 FROM spaces WHERE id=?
      UNION ALL
      SELECT s.id,s.parent_id,s.name,s.slug,ancestors.depth+1
      FROM spaces s JOIN ancestors ON s.id=ancestors.parent_id
    )
    SELECT id,parent_id AS parentId,name,slug,depth FROM ancestors ORDER BY depth DESC`)
    .bind(spaceId).all<{id:number;parentId:number|null;name:string;slug:string;depth:number}>();
  return result.results??[];
}

export async function getSpaceDescendantIds(spaceId:number,includeSelf=true){
  await ensureDatabase();
  const result=await env.DB.prepare(`WITH RECURSIVE descendants(id,depth) AS (
      SELECT id,0 FROM spaces WHERE id=?
      UNION ALL
      SELECT s.id,descendants.depth+1 FROM spaces s JOIN descendants ON s.parent_id=descendants.id
    )
    SELECT id FROM descendants ${includeSelf?"":"WHERE depth>0"}`).bind(spaceId).all<{id:number}>();
  return (result.results??[]).map((row)=>row.id);
}

export async function getSpaceOverview(spaceId:number){
  const space=await getSpace(spaceId);
  if(!space)return null;
  const [path,children,counts]=await Promise.all([
    getSpacePath(spaceId),
    listSpaceChildren(spaceId),
    env.DB.prepare(`WITH RECURSIVE descendants(id) AS (
        SELECT id FROM spaces WHERE id=?
        UNION ALL
        SELECT s.id FROM spaces s JOIN descendants ON s.parent_id=descendants.id
      )
      SELECT
        (SELECT count(*)-1 FROM descendants) AS descendantCount,
        (SELECT count(*) FROM posts WHERE space_id IN (SELECT id FROM descendants)) AS articleCount`)
      .bind(spaceId).first<{descendantCount:number;articleCount:number}>(),
  ]);
  return {...space,path,children,descendantCount:Number(counts?.descendantCount??0),articleCount:Number(counts?.articleCount??0)};
}

async function assertParent(parentId:number|null,excludeId?:number){
  if(parentId===null)return;
  if(parentId===excludeId)throw new SpaceWriteError("空间不能移动到自身");
  const parent=await getSpace(parentId);
  if(!parent)throw new SpaceWriteError("父空间不存在",404);
  if(excludeId){
    const descendant=await env.DB.prepare(`WITH RECURSIVE descendants(id) AS (
        SELECT id FROM spaces WHERE parent_id=?
        UNION ALL
        SELECT s.id FROM spaces s JOIN descendants ON s.parent_id=descendants.id
      ) SELECT id FROM descendants WHERE id=? LIMIT 1`)
      .bind(excludeId,parentId).first<{id:number}>();
    if(descendant)throw new SpaceWriteError("空间不能移动到自己的下级空间");
  }
}

async function assertUniqueSpaceName(parentId:number|null,name:string,excludeId?:number){
  const result=await env.DB.prepare(`SELECT id FROM spaces
    WHERE ((? IS NULL AND parent_id IS NULL) OR parent_id=?)
      AND name = ? COLLATE NOCASE
      AND (? IS NULL OR id <> ?)
    LIMIT 1`).bind(parentId,parentId,name,excludeId??null,excludeId??null).first<{id:number}>();
  if(result)throw new SpaceWriteError("同一层级下已存在同名空间",409);
}

export async function createSpace(input:{name:string;slug?:string;parentId?:number|null;sortOrder?:number}){
  await ensureDatabase();
  const name=input.name.trim();
  if(!name)throw new SpaceWriteError("空间名称不能为空");
  if(name.length>100)throw new SpaceWriteError("空间名称不能超过 100 个字符");
  const parentId=input.parentId??null;
  await assertParent(parentId);
  await assertUniqueSpaceName(parentId,name);
  try{
    const [created]=await getDb().insert(spaces).values({
      name,slug:slugifySpace(input.slug||name),parentId,sortOrder:input.sortOrder??0,
    }).returning();
    if(!created)throw new SpaceWriteError("空间创建失败",409);
    return created;
  }catch(error){
    if(error instanceof SpaceWriteError)throw error;
    throw new SpaceWriteError("同一层级下已存在相同空间",409);
  }
}

export async function updateSpace(spaceId:number,input:{name?:string;slug?:string;parentId?:number|null;sortOrder?:number}){
  await ensureDatabase();
  const current=await getSpace(spaceId);
  if(!current)throw new SpaceWriteError("空间不存在",404);
  const name=input.name?.trim()??current.name;
  if(!name)throw new SpaceWriteError("空间名称不能为空");
  if(name.length>100)throw new SpaceWriteError("空间名称不能超过 100 个字符");
  const parentId=input.parentId===undefined?current.parentId:input.parentId;
  await assertParent(parentId,spaceId);
  await assertUniqueSpaceName(parentId,name,spaceId);
  try{
    const [updated]=await getDb().update(spaces).set({
      name,
      slug:input.slug===undefined?current.slug:slugifySpace(input.slug||name),
      parentId,
      sortOrder:input.sortOrder??current.sortOrder,
      updatedAt:new Date().toISOString(),
    }).where(eq(spaces.id,spaceId)).returning();
    return updated;
  }catch{
    throw new SpaceWriteError("目标层级下已存在同名空间",409);
  }
}

export async function deleteSpace(spaceId:number,input:{mode:"empty"|"move"|"recursive";moveTo?:number|null;confirmName?:string}){
  await ensureDatabase();
  const current=await getSpace(spaceId);
  if(!current)throw new SpaceWriteError("空间不存在",404);
  const [children,articleCount]=await Promise.all([
    listSpaceChildren(spaceId),
    getDb().select({value:sql<number>`count(*)`}).from(posts).where(eq(posts.spaceId,spaceId)),
  ]);
  const directArticles=Number(articleCount[0]?.value??0);
  if(input.mode==="empty"&&(children.length||directArticles))throw new SpaceWriteError("空间中仍有子空间或文章，请先移动内容",409);
  if(input.mode==="move"){
    const moveTo=input.moveTo??null;
    if(moveTo===null)throw new SpaceWriteError("请选择另一个知识空间接收内容，空间文章不能移动到知识空间根层",409);
    await assertParent(moveTo,spaceId);
    const collision=await env.DB.prepare(`SELECT child.name
      FROM spaces child
      JOIN spaces existing ON existing.parent_id=?
        AND (existing.name COLLATE NOCASE=child.name COLLATE NOCASE OR existing.slug=child.slug)
      WHERE child.parent_id=?
      LIMIT 1`).bind(moveTo,spaceId).first<{name:string}>();
    if(collision)throw new SpaceWriteError(`接收空间中已存在与“${collision.name}”同名或同 Slug 的子空间`,409);
    await env.DB.batch([
      env.DB.prepare("UPDATE spaces SET parent_id=?, updated_at=CURRENT_TIMESTAMP WHERE parent_id=?").bind(moveTo,spaceId),
      env.DB.prepare("UPDATE posts SET space_id=?, updated_at=CURRENT_TIMESTAMP WHERE space_id=?").bind(moveTo,spaceId),
      env.DB.prepare("DELETE FROM spaces WHERE id=?").bind(spaceId),
    ]);
    return {ok:true,deleted:1};
  }
  if(input.mode==="recursive"){
    if(input.confirmName!==current.name)throw new SpaceWriteError("请输入空间名称确认递归删除");
    const counts=await env.DB.prepare(`WITH RECURSIVE descendants(id) AS (
        SELECT id FROM spaces WHERE id=?
        UNION ALL
        SELECT s.id FROM spaces s JOIN descendants ON s.parent_id=descendants.id
      )
      SELECT
        (SELECT count(*) FROM descendants) AS spaceCount,
        (SELECT count(*) FROM posts WHERE space_id IN (SELECT id FROM descendants)) AS articleCount`)
      .bind(spaceId).first<{spaceCount:number;articleCount:number}>();
    const subtree=`WITH RECURSIVE descendants(id) AS (
      SELECT id FROM spaces WHERE id=?
      UNION ALL
      SELECT s.id FROM spaces s JOIN descendants ON s.parent_id=descendants.id
    )`;
    const statements=[
      env.DB.prepare(`${subtree} DELETE FROM post_slug_history WHERE post_id IN (
        SELECT id FROM posts WHERE space_id IN (SELECT id FROM descendants)
      )`).bind(spaceId),
      env.DB.prepare(`${subtree} DELETE FROM post_views WHERE post_id IN (
        SELECT id FROM posts WHERE space_id IN (SELECT id FROM descendants)
      )`).bind(spaceId),
      env.DB.prepare(`${subtree} DELETE FROM post_preview_tokens WHERE post_id IN (
        SELECT id FROM posts WHERE space_id IN (SELECT id FROM descendants)
      )`).bind(spaceId),
      env.DB.prepare(`${subtree} DELETE FROM posts WHERE space_id IN (SELECT id FROM descendants)`).bind(spaceId),
      env.DB.prepare(`${subtree} DELETE FROM spaces WHERE id IN (SELECT id FROM descendants)`).bind(spaceId),
    ];
    await env.DB.batch(statements);
    return {ok:true,deleted:Number(counts?.spaceCount??0),deletedArticles:Number(counts?.articleCount??0)};
  }
  await getDb().delete(spaces).where(eq(spaces.id,spaceId));
  return {ok:true,deleted:1};
}

export async function resolveSpace(reference:string|number){
  await ensureDatabase();
  if(typeof reference==="number"||/^\d+$/.test(reference)){
    const space=await getSpace(Number(reference));
    if(!space)throw new SpaceWriteError("空间不存在",404);
    return space;
  }
  const parts=String(reference).split("/").map((part)=>part.trim()).filter(Boolean);
  if(!parts.length)throw new SpaceWriteError("空间路径不能为空");
  let parentId:number|null=null;
  let current=null;
  for(const part of parts){
    const rows=await getDb().select().from(spaces).where(and(
      parentId===null?isNull(spaces.parentId):eq(spaces.parentId,parentId),
      sql`(${spaces.name} = ${part} OR ${spaces.slug} = ${part})`,
    )).limit(1);
    current=rows[0]??null;
    if(!current)throw new SpaceWriteError(`找不到空间路径“${reference}”`,404);
    parentId=current.id;
  }
  return current!;
}

export async function searchSpaces(query:string,limit=20,options?:{rootId?:number;scope?:"current"|"descendants"|"all"}){
  await ensureDatabase();
  const needle=`%${query.trim()}%`;
  const rootId=options?.rootId;
  const scope=options?.scope??"all";
  const params:Array<string|number>=[];
  let range="";
  if(rootId&&scope==="current"){
    range="s.parent_id=? AND ";
    params.push(rootId);
  }else if(rootId&&scope==="descendants"){
    range=`s.id IN (
      WITH RECURSIVE descendants(id) AS (
        SELECT id FROM spaces WHERE parent_id=?
        UNION ALL
        SELECT child.id FROM spaces child JOIN descendants ON child.parent_id=descendants.id
      )
      SELECT id FROM descendants
    ) AND `;
    params.push(rootId);
  }
  const result=await env.DB.prepare(`SELECT
      s.id,s.parent_id AS parentId,s.name,s.slug,s.sort_order AS sortOrder,
      s.created_at AS createdAt,s.updated_at AS updatedAt,
      (SELECT count(*) FROM spaces child WHERE child.parent_id=s.id) AS childCount,
      (SELECT count(*) FROM posts p WHERE p.space_id=s.id) AS articleCount,
      (SELECT group_concat(name,' · ') FROM (
        SELECT name FROM spaces child WHERE child.parent_id=s.id
        ORDER BY child.sort_order ASC,child.name COLLATE NOCASE ASC,child.id ASC LIMIT 3
      )) AS childPreview
    FROM spaces s WHERE ${range}(s.name LIKE ? OR s.slug LIKE ?)
    ORDER BY s.updated_at DESC,s.id DESC LIMIT ?`)
    .bind(...params,needle,needle,Math.max(1,Math.min(50,limit))).all<SpaceSummary>();
  return Promise.all((result.results??[]).map(async(space)=>({...space,path:await getSpacePath(space.id)})));
}

export async function listSpacePosts(input:{spaceId:number;includeDescendants?:boolean;query?:string;status?:"all"|"draft"|"published";category?:string;cursor?:string;limit?:number}){
  await ensureDatabase();
  const limit=Math.max(1,Math.min(50,input.limit??20));
  const params:Array<string|number>=[input.spaceId];
  const conditions=[input.includeDescendants
    ? `p.space_id IN (
        WITH RECURSIVE descendants(id) AS (
          SELECT id FROM spaces WHERE id=?
          UNION ALL
          SELECT s.id FROM spaces s JOIN descendants ON s.parent_id=descendants.id
        )
        SELECT id FROM descendants
      )`
    : "p.space_id=?"];
  let from="FROM posts p LEFT JOIN categories c ON c.id=p.category_id";
  const query=input.query?.trim()??"";
  if(Array.from(query).length>=3){
    from+=" JOIN posts_fts ON posts_fts.rowid=p.id";
    conditions.push("posts_fts MATCH ?");
    params.push(`"${query.replace(/"/g,'""')}"`);
  }else if(query){
    conditions.push("(p.title LIKE ? OR p.excerpt LIKE ? OR p.slug LIKE ?)");
    const needle=`%${query}%`;
    params.push(needle,needle,needle);
  }
  if(input.status&&input.status!=="all"){conditions.push("p.status=?");params.push(input.status)}
  if(input.category&&input.category!=="all"){conditions.push("c.slug=?");params.push(input.category)}
  const cursor=decodeSpaceCursor(input.cursor);
  if(cursor){
    conditions.push("(p.updated_at < ? OR (p.updated_at = ? AND p.id < ?))");
    params.push(cursor.updatedAt,cursor.updatedAt,cursor.id);
  }
  const result=await env.DB.prepare(`SELECT
      p.id,p.public_id AS publicId,p.title,p.slug,p.excerpt,p.status,p.featured,
      p.view_count AS viewCount,p.published_at AS publishedAt,p.updated_at AS updatedAt,
      p.category_id AS categoryId,c.name AS categoryName,c.color AS categoryColor,p.space_id AS spaceId,
      (
        WITH RECURSIVE ancestors(id,parent_id,name,depth) AS (
          SELECT id,parent_id,name,0 FROM spaces WHERE id=p.space_id
          UNION ALL
          SELECT s.id,s.parent_id,s.name,ancestors.depth+1 FROM spaces s JOIN ancestors ON s.id=ancestors.parent_id
        )
        SELECT group_concat(name,' / ') FROM (SELECT name FROM ancestors ORDER BY depth DESC)
      ) AS spacePath
    ${from}
    WHERE ${conditions.join(" AND ")}
    ORDER BY p.updated_at DESC,p.id DESC LIMIT ?`).bind(...params,limit+1).all<SpacePostRow>();
  const all=result.results??[];
  const hasMore=all.length>limit;
  const rows=all.slice(0,limit);
  const last=rows.at(-1) as {id?:number;updatedAt?:string}|undefined;
  return {
    rows:rows.map((row)=>({...row,featured:Boolean(row.featured)})),
    nextCursor:hasMore&&last?.id&&last.updatedAt?encodeSpaceCursor(last.updatedAt,last.id):null,
  };
}

function encodeSpaceCursor(updatedAt:string,id:number){
  return btoa(`${updatedAt}|${id}`).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}

function decodeSpaceCursor(cursor?:string){
  if(!cursor||cursor.length>180)return null;
  try{
    const normalized=cursor.replace(/-/g,"+").replace(/_/g,"/");
    const decoded=atob(normalized+"=".repeat((4-normalized.length%4)%4));
    const separator=decoded.lastIndexOf("|");
    const updatedAt=decoded.slice(0,separator);
    const id=Number(decoded.slice(separator+1));
    return separator>0&&updatedAt&&Number.isInteger(id)&&id>0?{updatedAt,id}:null;
  }catch{return null}
}
