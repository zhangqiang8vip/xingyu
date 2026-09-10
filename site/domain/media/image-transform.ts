export type ImageOutputFormat="image/jpeg"|"image/png"|"image/gif"|"image/webp"|"image/avif"|"rgb"|"rgba";

const IMAGE_OUTPUT_FORMATS=new Set<ImageOutputFormat>([
  "image/jpeg","image/png","image/gif","image/webp","image/avif","rgb","rgba",
]);

export function normalizeImageOutputFormat(format:string):ImageOutputFormat{
  return IMAGE_OUTPUT_FORMATS.has(format as ImageOutputFormat)?format as ImageOutputFormat:"image/jpeg";
}

export function mergeResponseHeaders(response:Response,additional:HeadersInit):Response{
  const headers=new Headers(response.headers);
  new Headers(additional).forEach((value,key)=>headers.set(key,value));
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
