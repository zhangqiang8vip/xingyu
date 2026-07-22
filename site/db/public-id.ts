const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeTime(value: number, length: number) {
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result = ALPHABET[value % 32] + result;
    value = Math.floor(value / 32);
  }
  return result;
}

/** A sortable, URL-safe 26 character public identifier. */
export function createPostPublicId(now = Date.now()) {
  const random = crypto.getRandomValues(new Uint8Array(16));
  const suffix = Array.from(random, (byte) => ALPHABET[byte & 31]).join("");
  return `${encodeTime(now, 10)}${suffix}`;
}
