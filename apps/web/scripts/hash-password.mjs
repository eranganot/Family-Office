// Usage: node scripts/hash-password.mjs "your-password"
// Prints an argon2id hash for the AUTH_PASSWORD_HASH env var.
import { hash } from "@node-rs/argon2";

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/hash-password.mjs <password>");
  process.exit(1);
}
console.log(await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 }));
