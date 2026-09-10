import assert from "node:assert/strict";
import test from "node:test";
import {
  adminReaderHref,
  adminReaderReturnHref,
  adminReaderSearchParams,
  adminReaderSqlFilter,
  normalizeAdminReaderContext,
  parseAdminReaderContext,
} from "../domain/reader/admin-reader-context.ts";
import { visibleIslandSearchRows } from "../domain/navigation/search-results.ts";
import { adminLocationHref, parseAdminLocation } from "../domain/admin/location.ts";

test("admin location URLs preserve only the active workspace state",()=>{
  assert.equal(adminLocationHref({section:"browse",browseVisibility:"private",browseCategory:"notes",query:"ignored"}),"/admin?section=browse&visibility=private&category=notes");
  assert.equal(adminLocationHref({section:"articles",query:"Windows 环境",category:"dev",status:"draft",spaceId:9}),"/admin?section=articles&q=Windows+%E7%8E%AF%E5%A2%83&category=dev&status=draft");
  assert.equal(adminLocationHref({section:"spaces",spaceId:12}),"/admin?section=spaces&spaceId=12");
  assert.deepEqual(parseAdminLocation(new URLSearchParams("section=spaces&spaceId=12&q=ignored")),{
    section:"spaces",browseCategory:"all",browseVisibility:"all",query:"",category:"all",status:"all",spaceId:12,
  });
  assert.equal(parseAdminLocation(new URLSearchParams("section=unknown&spaceId=-1")).section,"browse");
});

test("admin reader context keeps public, private and filtered ranges stable",()=>{
  assert.deepEqual(normalizeAdminReaderContext({range:"public",category:"notes",status:"draft",source:"browse"}),{
    range:"public",category:"notes",status:"draft",source:"browse",
  });
  assert.equal(adminReaderHref("post id",{range:"private"}),"/admin/reader/post%20id?range=private");
  assert.equal(adminReaderSearchParams({range:"public",category:"notes"}).toString(),"scope=admin&range=public&category=notes");
});

test("admin neighbor SQL applies the selected visibility, category and status",()=>{
  assert.deepEqual(adminReaderSqlFilter({range:"public",category:"notes",status:"draft"}),{
    sql:" AND p.space_id IS NULL AND c.slug=? AND p.status=?",
    bindings:["notes","draft"],
  });
  const descendants=adminReaderSqlFilter({range:"space",spaceId:12,includeDescendants:true});
  assert.match(descendants.sql,/WITH RECURSIVE descendants/);
  assert.match(descendants.sql,/s\.parent_id=descendants\.id/);
  assert.deepEqual(descendants.bindings,[12]);
});

test("admin reader search keeps the same short-query and FTS result boundary",()=>{
  const shortContext=normalizeAdminReaderContext({range:"all",query:"AI"});
  assert.equal(adminReaderSearchParams(shortContext).get("q"),"AI");
  assert.deepEqual(adminReaderSqlFilter(shortContext),{
    sql:" AND (p.title LIKE ? OR p.excerpt LIKE ? OR p.slug LIKE ?)",
    bindings:["%AI%","%AI%","%AI%"],
  });
  const fts=adminReaderSqlFilter({range:"all",query:'Windows "环境"'});
  assert.match(fts.sql,/posts_fts MATCH/);
  assert.deepEqual(fts.bindings,['"Windows ""环境"""']);
});

test("standalone admin reading returns to its originating browse state",()=>{
  assert.equal(adminReaderReturnHref({range:"private",category:"notes",source:"browse"}),"/admin?section=browse&visibility=private&category=notes");
  assert.equal(adminReaderReturnHref({range:"all",query:"Windows 环境",category:"dev",status:"draft",source:"articles"}),"/admin?section=articles&q=Windows+%E7%8E%AF%E5%A2%83&category=dev&status=draft");
  assert.equal(adminReaderReturnHref({range:"space",spaceId:12,includeDescendants:true,source:"spaces"}),"/admin?section=spaces&spaceId=12");
});

test("space reader context preserves subtree intent and fails closed without a space",()=>{
  const context=parseAdminReaderContext(new URLSearchParams("range=space&spaceId=12&descendants=1"));
  assert.deepEqual(context,{range:"space",spaceId:12,includeDescendants:true});
  assert.equal(adminReaderHref("01ABC",context),"/admin/reader/01ABC?range=space&spaceId=12&descendants=1");
  assert.deepEqual(normalizeAdminReaderContext({range:"space",spaceId:0}),{range:"private"});
});

test("reader search only excludes the open article from the empty recent list",()=>{
  const rows=[{slug:"current",title:"Current"},{slug:"other",title:"Other"}];
  assert.deepEqual(visibleIslandSearchRows(rows,"current",""),[rows[1]]);
  assert.deepEqual(visibleIslandSearchRows(rows,"current","Windows"),rows);
  assert.deepEqual(visibleIslandSearchRows(rows,undefined,""),rows);
});
