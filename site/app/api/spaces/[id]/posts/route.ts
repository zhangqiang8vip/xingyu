import { isAdminRequest, unauthorized } from "../../../admin-auth";
import { listAdminPosts } from "../../../../../db/queries";
import { getSpace, listSpacePosts } from "../../../../../db/spaces";

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!(await isAdminRequest(request)))return unauthorized();
  const {id}=await params;
  const spaceId=Number(id);
  if(!(await getSpace(spaceId)))return Response.json({error:"空间不存在"},{status:404});
  const url=new URL(request.url);
  if(url.searchParams.get("scope")==="all"){
    return Response.json(await listAdminPosts({
      query:url.searchParams.get("q")??"",
      cursor:url.searchParams.get("cursor")??undefined,
      limit:Number(url.searchParams.get("limit"))||20,
      space:"private",
    }));
  }
  return Response.json(await listSpacePosts({
    spaceId,
    includeDescendants:url.searchParams.get("scope")==="descendants",
    query:url.searchParams.get("q")??"",
    cursor:url.searchParams.get("cursor")??undefined,
    limit:Number(url.searchParams.get("limit"))||20,
  }));
}
