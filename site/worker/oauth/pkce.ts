export function normalizeBase64Url(value: string) {
  return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function s256Challenge(verifier: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  let binary = "";
  digest.forEach((byte) => { binary += String.fromCharCode(byte); });
  return normalizeBase64Url(btoa(binary));
}

export async function verifyS256(verifier: string, challenge: string) {
  if (!verifier || verifier.length < 43 || verifier.length > 128) return false;
  if (!/^[A-Za-z0-9._~-]+$/.test(verifier)) return false;
  const expected = await s256Challenge(verifier);
  if (expected.length !== challenge.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ challenge.charCodeAt(index);
  }
  return difference === 0;
}
