import { adminLocationHref } from "#domain/admin/location";

export type AdminReaderRange="all"|"public"|"private"|"space";
export type AdminReaderStatus="all"|"draft"|"published";
export type AdminReaderSource="browse"|"articles"|"spaces"|"search";

export type AdminReaderContext={
  range:AdminReaderRange;
  spaceId?:number;
  includeDescendants?:boolean;
  query?:string;
  category?:string;
  status?:AdminReaderStatus;
  source?:AdminReaderSource;
};

export type AdminReaderReturnTarget={
  publicId:string;
  adminReaderContext:AdminReaderContext;
};

export const DEFAULT_ADMIN_READER_CONTEXT:AdminReaderContext={range:"all"};

export function normalizeAdminReaderContext(input?:Partial<AdminReaderContext>|null):AdminReaderContext{
  const requestedRange=input?.range;
  const range:AdminReaderRange=requestedRange==="public"||requestedRange==="private"||requestedRange==="space"?requestedRange:"all";
  const spaceId=Number(input?.spaceId);
  const query=input?.query?.trim()||undefined;
  const category=input?.category&&input.category!=="all"?input.category.trim():undefined;
  const status=input?.status==="draft"||input?.status==="published"?input.status:"all";
  const source:AdminReaderSource|undefined=input?.source==="browse"||input?.source==="articles"||input?.source==="spaces"||input?.source==="search"?input.source:undefined;
  if(range==="space"&&(!Number.isInteger(spaceId)||spaceId<1))return normalizeAdminReaderContext({range:"private",category,status});
  return {
    range,
    ...(range==="space"?{spaceId,includeDescendants:Boolean(input?.includeDescendants)}:{}),
    ...(query?{query}:{}),
    ...(category?{category}:{}),
    ...(status!=="all"?{status}:{}),
    ...(source?{source}:{}),
  };
}

export function parseAdminReaderContext(params:URLSearchParams):AdminReaderContext{
  return normalizeAdminReaderContext({
    range:(params.get("range") as AdminReaderRange|null)??undefined,
    spaceId:Number(params.get("spaceId")),
    includeDescendants:params.get("descendants")==="1",
    query:params.get("q")??undefined,
    category:params.get("category")??undefined,
    status:(params.get("status") as AdminReaderStatus|null)??undefined,
    source:(params.get("from") as AdminReaderSource|null)??undefined,
  });
}

export function adminReaderSearchParams(input?:Partial<AdminReaderContext>|null){
  const context=normalizeAdminReaderContext(input);
  const params=new URLSearchParams({scope:"admin",range:context.range});
  if(context.spaceId)params.set("spaceId",String(context.spaceId));
  if(context.includeDescendants)params.set("descendants","1");
  if(context.query)params.set("q",context.query);
  if(context.category)params.set("category",context.category);
  if(context.status&&context.status!=="all")params.set("status",context.status);
  if(context.source)params.set("from",context.source);
  return params;
}

export function adminReaderHref(publicId:string,input?:Partial<AdminReaderContext>|null){
  const params=adminReaderSearchParams(input);
  params.delete("scope");
  const query=params.toString();
  return `/admin/reader/${encodeURIComponent(publicId)}${query?`?${query}`:""}`;
}

export function adminReaderReturnHref(input?:Partial<AdminReaderContext>|null){
  const context=normalizeAdminReaderContext(input);
  const source=context.source??(context.range==="space"?"spaces":"browse");
  const section=source==="search"?"browse":source;
  if(source==="browse"){
    return adminLocationHref({section,browseVisibility:context.range==="public"||context.range==="private"?context.range:"all",browseCategory:context.category});
  }else if(source==="articles"){
    return adminLocationHref({section,query:context.query,category:context.category,status:context.status});
  }
  return adminLocationHref({section,spaceId:context.spaceId});
}

export function adminReaderSqlFilter(input?:AdminReaderContext){
  const context=normalizeAdminReaderContext(input);
  const conditions:string[]=[];
  const bindings:Array<string|number>=[];
  if(context.range==="public")conditions.push("p.space_id IS NULL");
  if(context.range==="private")conditions.push("p.space_id IS NOT NULL");
  if(context.range==="space"){
    if(context.includeDescendants){
      conditions.push(`p.space_id IN (
        WITH RECURSIVE descendants(id) AS (
          SELECT id FROM spaces WHERE id=?
          UNION ALL
          SELECT s.id FROM spaces s JOIN descendants ON s.parent_id=descendants.id
        ) SELECT id FROM descendants
      )`);
    }else conditions.push("p.space_id=?");
    bindings.push(context.spaceId!);
  }
  if(context.query){
    if(Array.from(context.query).length>=3){
      conditions.push("p.id IN (SELECT rowid FROM posts_fts WHERE posts_fts MATCH ?)");
      bindings.push(`"${context.query.replace(/"/g,'""')}"`);
    }else{
      conditions.push("(p.title LIKE ? OR p.excerpt LIKE ? OR p.slug LIKE ?)");
      const needle=`%${context.query}%`;
      bindings.push(needle,needle,needle);
    }
  }
  if(context.category){conditions.push("c.slug=?");bindings.push(context.category)}
  if(context.status){conditions.push("p.status=?");bindings.push(context.status)}
  return {sql:conditions.length?` AND ${conditions.join(" AND ")}`:"",bindings};
}
