// Edge-safe session tokens (jose only — no node-native imports here).
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "wealthos_session";
const SESSION_DAYS = 30;

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(email: string, secret: string): Promise<string> {
  return new SignJWT({ sub: email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key(secret));
}

export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<{ email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret));
    return payload.sub ? { email: payload.sub } : null;
  } catch {
    return null;
  }
}
