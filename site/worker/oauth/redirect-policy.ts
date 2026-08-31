export const GROK_CLIENT_ID = "grok-xingyu";
export const CHATGPT_CLIENT_ID = "chatgpt-xingyu";

const CHATGPT_REDIRECT_HOSTS = new Set(["chatgpt.com", "www.chatgpt.com", "chat.openai.com"]);
const CHATGPT_CONNECTOR_CALLBACK = /^\/connector\/oauth\/[A-Za-z0-9_-]+$/;

export function isKnownChatGptRedirect(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) return false;
    if (!CHATGPT_REDIRECT_HOSTS.has(url.hostname)) return false;
    const path = url.pathname;
    return path === "/oauth/callback"
      || path === "/connector_platform_oauth_redirect"
      || CHATGPT_CONNECTOR_CALLBACK.test(path);
  } catch {
    return false;
  }
}

export function shouldAcceptRedirect(clientId: string, registered: string[], redirectUri: string) {
  if (registered.includes(redirectUri)) return { ok: true, register: false };
  if (registered.length === 0) return { ok: true, register: true };
  if (clientId === CHATGPT_CLIENT_ID && isKnownChatGptRedirect(redirectUri)) return { ok: true, register: true };
  return { ok: false, register: false };
}
