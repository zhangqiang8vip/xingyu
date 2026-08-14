import { env } from "cloudflare:workers";

export const ADMIN_SESSION_COOKIE = "xingyu_admin_session";
export const ADMIN_SESSION_SECONDS = 8 * 60 * 60;

type AdminRuntimeEnv = Env & {
  ADMIN_PASSWORD_HASH?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_SESSION_SECRET?: string;
  APP_ENV?: string;
};

export function adminRuntimeEnv() {
  return env as AdminRuntimeEnv;
}

export function isDevelopment() {
  return adminRuntimeEnv().APP_ENV !== "production";
}

export function validSessionSecret() {
  const secret = adminRuntimeEnv().ADMIN_SESSION_SECRET;
  return secret && secret.length >= 32 ? secret : "";
}

export function parseCookieValue(cookieHeader: string | null | undefined, name: string) {
  if (!cookieHeader) return "";
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export async function signAdminPayload(payload: string) {
  const secret = validSessionSecret();
  if (!secret) return "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))));
}

export async function isValidAdminSessionToken(token?: string) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1" || !/^\d+$/.test(parts[1])) return false;
  if (Number(parts[1]) <= Math.floor(Date.now() / 1000)) return false;
  return constantTimeTextEqual(parts[3], await signAdminPayload(parts.slice(0, 3).join(".")));
}

export async function requestHasAdminSession(request: Request) {
  if (!validSessionSecret()) return false;
  return isValidAdminSessionToken(parseCookieValue(request.headers.get("cookie"), ADMIN_SESSION_COOKIE));
}

export function constantTimeTextEqual(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return difference === 0;
}

export function constantTimeBytesEqual(left: Uint8Array, right: Uint8Array) {
  const maxLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) difference |= (left[index] || 0) ^ (right[index] || 0);
  return difference === 0;
}

export function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function sha256Bytes(value: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

export function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
