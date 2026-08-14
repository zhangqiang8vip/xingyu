import { env } from "cloudflare:workers";
import { sha256Bytes, constantTimeBytesEqual } from "../db/admin-session";
import { ALL_SCOPES, findAccessToken, hashSecret, mcpResourceFor, parseScopeList, touchAccessToken } from "../db/oauth";
import { unauthorizedChallenge } from "./oauth/metadata";
import { oauthLog } from "./oauth/errors";

export type McpAuth = {
  authType: "legacy" | "oauth";
  clientId: string;
  subject: string;
  scopes: string[];
  tokenId?: number;
};

export class ScopeError extends Error {
  constructor(readonly requiredScope: string) {
    super(`insufficient_scope:${requiredScope}`);
  }
}

export function requireScope(auth: McpAuth, scope: string) {
  if (!auth.scopes.includes(scope)) throw new ScopeError(scope);
}

export function scopeFailure(error: unknown) {
  if (!(error instanceof ScopeError)) return null;
  return {
    content: [{ type: "text" as const, text: JSON.stringify({
      ok: false,
      error: "insufficient_scope",
      required_scope: error.requiredScope,
    }, null, 2) }],
    structuredContent: { ok: false, error: "insufficient_scope", required_scope: error.requiredScope },
    isError: true,
  };
}

export async function authenticateMcp(request: Request): Promise<McpAuth | Response> {
  const origin = new URL(request.url).origin;
  const header = request.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    oauthLog("mcp.auth.failed", { reason: "missing_bearer" });
    return unauthorizedChallenge(origin);
  }
  const bearer = match[1];
  const expected = env.MCP_WRITE_TOKEN;
  if (expected && await bearerMatches(bearer, expected)) {
    return {
      authType: "legacy",
      clientId: "legacy-chatgpt",
      subject: "xingyu-owner",
      scopes: [...ALL_SCOPES],
    };
  }
  if (bearer.startsWith("xy_at_")) {
    const row = await findAccessToken(await hashSecret(bearer));
    const now = Math.floor(Date.now() / 1000);
    if (!row || row.revokedAt || row.expiresAt <= now) {
      oauthLog("mcp.auth.failed", { reason: "oauth_expired_or_revoked" });
      return unauthorizedChallenge(origin);
    }
    if (row.resource !== mcpResourceFor(origin)) {
      oauthLog("mcp.auth.failed", { reason: "resource_mismatch", client_id: row.clientId });
      return unauthorizedChallenge(origin);
    }
    return {
      authType: "oauth",
      clientId: row.clientId,
      subject: row.subject,
      scopes: parseScopeList(row.scope),
      tokenId: row.id,
    };
  }
  oauthLog("mcp.auth.failed", { reason: "invalid_token" });
  return unauthorizedChallenge(origin);
}

export async function rememberTokenUse(auth: McpAuth, ctx: ExecutionContext) {
  if (auth.tokenId) ctx.waitUntil(touchAccessToken(auth.tokenId));
}

async function bearerMatches(provided: string, expected: string) {
  const [left, right] = await Promise.all([sha256Bytes(provided), sha256Bytes(expected)]);
  return constantTimeBytesEqual(left, right);
}
