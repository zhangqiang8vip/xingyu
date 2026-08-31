export function sanitizeConnectionLabel(value: string | null | undefined) {
  return (value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
}

export function newAccountSubject(label: string | null, loginHint: string | null = null) {
  const name = sanitizeConnectionLabel(label) || sanitizeConnectionLabel(loginHint);
  const id = randomId();
  return name ? `named:${encodeLabel(name)}:${id}` : `xy_acc_${id}`;
}

export function sessionLabel(subject: string, grantedAt: string | null) {
  if (subject === "xingyu-owner") return "星屿管理员（早期授权）";
  if (subject.startsWith("hint:")) return subject.slice(5);
  if (subject.startsWith("named:")) {
    const encoded = subject.split(":")[1] ?? "";
    const name = decodeLabel(encoded);
    if (name) return name;
  }
  const when = grantedAt ? formatCompactTime(grantedAt) : "";
  return when ? `授权会话 · ${when}` : "授权会话";
}

export function formatCompactTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function randomId() {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(6)));
}

function encodeLabel(value: string) {
  return toBase64Url(new TextEncoder().encode(value));
}

function decodeLabel(value: string) {
  try {
    return new TextDecoder().decode(fromBase64Url(value));
  } catch {
    return "";
  }
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}
