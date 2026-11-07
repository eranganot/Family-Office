/**
 * WO-4 (2026-11-05): brute-force limit for the single-owner login.
 *
 * There was none: one email, one argon2 password, and nothing between an
 * attacker and unlimited guesses. In-memory on purpose - WealthOS runs one web
 * replica, and a restart only resets the counters (it does not unlock anything
 * that was safe before).
 *
 * Two keys: the client address (last X-Forwarded-For hop, the one Railway's
 * proxy wrote) and a global counter, so rotating addresses does not help either.
 */
export const WINDOW_MS = 15 * 60 * 1000;
export const MAX_PER_ADDRESS = 5;
export const MAX_GLOBAL = 20;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function bucket(key: string, now: number): Bucket {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    const fresh = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, fresh);
    return fresh;
  }
  return b;
}

export function clientAddress(forwardedFor: string | null | undefined, realIp?: string | null): string {
  const hops = (forwardedFor ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return hops[hops.length - 1] || (realIp ?? "").trim() || "unknown";
}

/** True when this address (or everyone) has used up the failures for the window. */
export function isLocked(address: string, now = Date.now()): boolean {
  return bucket(`ip:${address}`, now).count >= MAX_PER_ADDRESS || bucket("global", now).count >= MAX_GLOBAL;
}

export function recordFailure(address: string, now = Date.now()): void {
  bucket(`ip:${address}`, now).count += 1;
  bucket("global", now).count += 1;
}

export function recordSuccess(address: string): void {
  buckets.delete(`ip:${address}`);
}

/** Tests only. */
export function resetLoginLimits(): void {
  buckets.clear();
}
