import { z } from "zod";

// Lazy, request-time env validation (never at build time).
const EnvSchema = z.object({
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 chars"),
  AUTH_EMAIL: z.string().email(),
  AUTH_PASSWORD_HASH: z.string().startsWith("$argon2"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;
export function getEnv(): Env {
  cached ??= EnvSchema.parse({
    AUTH_SECRET: process.env["AUTH_SECRET"],
    AUTH_EMAIL: process.env["AUTH_EMAIL"],
    AUTH_PASSWORD_HASH: process.env["AUTH_PASSWORD_HASH"],
  });
  return cached;
}
