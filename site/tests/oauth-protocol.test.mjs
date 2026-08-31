import assert from "node:assert/strict";
import test from "node:test";
import {
  refreshTokenDecision,
  requireScope,
  ScopeError,
  scopeFailure,
  scopeForAttachment,
  scopeForPostWrite,
} from "../worker/mcp/scope-policy.ts";
import { isAuthorizationCodeResponse, readAuthorizeParams } from "../worker/oauth/authorize-params.ts";
import { isKnownChatGptRedirect, shouldAcceptRedirect } from "../worker/oauth/redirect-policy.ts";
import { s256Challenge, verifyS256 } from "../worker/oauth/pkce.ts";

const draftAuth = { authType: "oauth", clientId: "grok-xingyu", subject: "xingyu-owner", scopes: ["xingyu.read", "xingyu.draft"] };

test("consent POST recovers authorize params without response_type", async () => {
  const payload = Buffer.from(JSON.stringify({
    client_id: "grok-xingyu",
    redirect_uri: "https://example.com/callback",
    resource: "https://zhangwansen.click/mcp",
    scope: "xingyu.read xingyu.draft offline_access",
    state: "abc",
    code_challenge: "challenge",
  })).toString("base64url");
  const request = new Request("https://zhangwansen.click/oauth/authorize", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      consent_token: `${payload}.sig`,
      decision: "allow",
    }),
  });
  const params = await readAuthorizeParams(request, new URL(request.url));
  assert.equal(params.get("response_type"), "code");
  assert.equal(params.get("client_id"), "grok-xingyu");
  assert.equal(params.get("redirect_uri"), "https://example.com/callback");
  assert.equal(params.get("code_challenge_method"), "S256");
  assert.equal(isAuthorizationCodeResponse(params.get("response_type") ?? ""), true);
  assert.equal(isAuthorizationCodeResponse("token"), false);
});

test("PKCE S256 verifier must match the challenge and reject mutations", async () => {
  const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
  const challenge = await s256Challenge(verifier);
  assert.equal(await verifyS256(verifier, challenge), true);
  assert.equal(await verifyS256(`${verifier}x`, challenge), false);
  assert.equal(await verifyS256("short", challenge), false);
});

test("draft scope cannot publish or rewrite a live article", () => {
  assert.equal(scopeForPostWrite("draft"), "xingyu.draft");
  assert.equal(scopeForPostWrite("published"), "xingyu.publish");
  assert.equal(scopeForAttachment(null), "xingyu.draft");
  assert.equal(scopeForAttachment({ status: "draft", spaceId: null }), "xingyu.draft");
  assert.equal(scopeForAttachment({ status: "published", spaceId: null }), "xingyu.publish");
  assert.equal(scopeForAttachment({ status: "published", spaceId: 3 }), "xingyu.draft");
  assert.throws(() => requireScope(draftAuth, "xingyu.publish"), ScopeError);
  const denied = scopeFailure(new ScopeError("xingyu.publish"));
  assert.equal(denied.structuredContent.error, "insufficient_scope");
  assert.equal(denied.structuredContent.required_scope, "xingyu.publish");
});

test("ChatGPT can register its own callback without using the Grok client", () => {
  const grokRegistered = ["https://grok.com/connectors-oauth-exchange-code/"];
  const gptKnown = "https://chatgpt.com/connector_platform_oauth_redirect";
  assert.equal(shouldAcceptRedirect("grok-xingyu", grokRegistered, gptKnown).ok, false);
  assert.equal(shouldAcceptRedirect("chatgpt-xingyu", [gptKnown], gptKnown).ok, true);
  assert.equal(shouldAcceptRedirect("chatgpt-xingyu", [gptKnown], "https://chatgpt.com/oauth/callback").ok, true);
  assert.equal(shouldAcceptRedirect("chatgpt-xingyu", [gptKnown], "https://chatgpt.com/connector/oauth/50egvq242CX3").ok, true);
  assert.equal(isKnownChatGptRedirect("https://chatgpt.com/connector/anything-else"), false);
  assert.equal(isKnownChatGptRedirect("https://chatgpt.com/oauth/anything-else"), false);
  assert.equal(isKnownChatGptRedirect("https://evil.com/oauth/callback"), false);
  assert.equal(shouldAcceptRedirect("chatgpt-xingyu", [gptKnown], "https://evil.com/oauth/callback").ok, false);
});

test("refresh token reuse is rejected and expired tokens cannot rotate", () => {
  const now = 1_700_000_000;
  const base = { clientId: "grok-xingyu", revokedAt: null, usedAt: null, expiresAt: now + 60, absoluteExpiresAt: now + 3600 };
  assert.equal(refreshTokenDecision(base, "grok-xingyu", now), "ok");
  assert.equal(refreshTokenDecision({ ...base, usedAt: now - 1 }, "grok-xingyu", now), "reuse");
  assert.equal(refreshTokenDecision({ ...base, expiresAt: now - 1 }, "grok-xingyu", now), "expired");
  assert.equal(refreshTokenDecision({ ...base, revokedAt: now - 1 }, "grok-xingyu", now), "expired");
  assert.equal(refreshTokenDecision(base, "other-client", now), "invalid");
  assert.equal(refreshTokenDecision(null, "grok-xingyu", now), "invalid");
});
