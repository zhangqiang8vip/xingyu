import { pbkdf2Sync, randomBytes } from "node:crypto";

const password = process.argv[2] ?? "";
if (password.length < 16) {
  console.error("Password must contain at least 16 characters.");
  process.exit(1);
}

const iterations = 210_000;
const salt = randomBytes(20);
const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256");
const encode = (value) => value.toString("base64url");
console.log(`pbkdf2-sha256$${iterations}$${encode(salt)}$${encode(hash)}`);
