import { randomBytes, scryptSync } from "node:crypto";

const password = process.argv[2] ?? "";
if (password.length < 16) {
  console.error("Password must contain at least 16 characters.");
  process.exit(1);
}

const salt = randomBytes(20);
const hash = scryptSync(password, salt, 32, { N:16_384, r:8, p:1, maxmem:64 * 1024 * 1024 });
const encode = (value) => value.toString("base64url");
const payload = Buffer.from(JSON.stringify({ n:16_384, r:8, p:1, salt:encode(salt), hash:encode(hash) })).toString("base64url");
console.log(`scrypt-v1-${payload}`);
