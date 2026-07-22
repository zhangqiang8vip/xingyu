import { cookies } from "next/headers";
import { getChatGPTUser } from "../chatgpt-auth";

const SESSION_COOKIE = "xingyu_admin_session";
const SESSION_SECONDS = 8 * 60 * 60;

export type AdminIdentity = { displayName: string; email: string };

export function isAllowedAdminEmail(email: string) {
  const allowlist = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.trim().toLowerCase());
}

export async function getAdminIdentity(): Promise<AdminIdentity | null> {
  const user = await getChatGPTUser();
  if (user && isAllowedAdminEmail(user.email)) {
    return { displayName: user.displayName, email: user.email };
  }

  if (process.env.NODE_ENV === "development" && await hasValidLocalSession()) {
    return { displayName: "本地管理员", email: "local-admin" };
  }
  return null;
}

export async function isAdminRequest(request?: Request) {
  if (request && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return false;
  }
  return Boolean(await getAdminIdentity());
}

export async function verifyLocalAdminPassword(password: string) {
  if (process.env.NODE_ENV !== "development" || !process.env.ADMIN_PASSWORD) return false;
  const [provided, expected] = await Promise.all([sha256(password), sha256(process.env.ADMIN_PASSWORD)]);
  let difference = 0;
  for (let index = 0; index < provided.length; index += 1) difference |= provided[index] ^ expected[index];
  return difference === 0;
}

export async function createLocalAdminSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = String(expiresAt);
  const signature = await sign(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, `${payload}.${signature}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function clearLocalAdminSession() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "strict", secure: false, path: "/", maxAge: 0 });
}

async function hasValidLocalSession() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return false;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const separator = token.indexOf(".");
  if (separator < 1) return false;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!/^\d+$/.test(payload) || Number(payload) <= Math.floor(Date.now() / 1000)) return false;
  return constantTimeTextEqual(signature, await sign(payload));
}

async function sign(payload: string) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return bytesToBase64Url(bytes);
}

async function sha256(value: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function constantTimeTextEqual(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return difference === 0;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function unauthorized() {
  return Response.json({ error: "无权访问写作后台" }, { status: 401, headers: { "Cache-Control": "no-store" } });
}
