import assert from "node:assert/strict";
import test from "node:test";
import {mergeResponseHeaders,normalizeImageOutputFormat} from "../domain/media/image-transform.ts";

test("image output formats are narrowed to the Cloudflare Images contract",()=>{
  assert.equal(normalizeImageOutputFormat("image/avif"),"image/avif");
  assert.equal(normalizeImageOutputFormat("image/webp"),"image/webp");
  assert.equal(normalizeImageOutputFormat("unexpected"),"image/jpeg");
});

test("transformed image headers are merged without discarding its content type",async()=>{
  const transformed=new Response("image",{status:201,statusText:"Created",headers:{"Content-Type":"image/webp"}});
  const response=mergeResponseHeaders(transformed,{"Cache-Control":"private, no-store","ETag":"\"image-1\""});
  assert.equal(response.status,201);
  assert.equal(response.statusText,"Created");
  assert.equal(response.headers.get("Content-Type"),"image/webp");
  assert.equal(response.headers.get("Cache-Control"),"private, no-store");
  assert.equal(response.headers.get("ETag"),'"image-1"');
  assert.equal(await response.text(),"image");
});
