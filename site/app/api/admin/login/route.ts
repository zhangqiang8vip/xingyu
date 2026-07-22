import { createLocalAdminSession, verifyLocalAdminPassword } from "../../admin-auth";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const payload = await request.json() as { password?: string };
  if (!(await verifyLocalAdminPassword(String(payload.password ?? "")))) {
    return Response.json({ error: "密码不正确" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  await createLocalAdminSession();
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
