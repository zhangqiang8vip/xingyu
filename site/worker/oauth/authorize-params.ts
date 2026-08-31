function decodeBase64UrlJson(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)))) as Record<string, string>;
}

function decodeConsentPayload(token: string) {
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  try {
    return decodeBase64UrlJson(token.slice(0, dot));
  } catch {
    return null;
  }
}

export function isAuthorizationCodeResponse(value: string) {
  const types = value.split(/[\s+]+/).filter(Boolean);
  return types.length === 1 && types[0] === "code";
}

export async function readAuthorizeParams(request: Request, url: URL) {
  const params = new URLSearchParams(url.searchParams);
  if (request.method === "POST") {
    const form = new URLSearchParams(await request.text());
    for (const [key, value] of form) params.set(key, value);
    const fromToken = decodeConsentPayload(form.get("consent_token") ?? "");
    if (fromToken) {
      if (!params.get("response_type")) params.set("response_type", "code");
      if (!params.get("code_challenge_method")) params.set("code_challenge_method", "S256");
      for (const key of ["client_id", "redirect_uri", "resource", "scope", "state", "code_challenge"] as const) {
        if (!params.get(key) && fromToken[key]) params.set(key, fromToken[key]!);
      }
    }
  }
  return params;
}
