import { NextResponse } from "next/server";
import { db } from "@wealthos/api";

export const dynamic = "force-dynamic";

/**
 * WO-5 (2026-11-05): reports the build (RAILWAY_GIT_COMMIT_SHA) so production
 * can be compared with main, and pings the database so "up" means "can serve".
 * No data, no counts: this route is public (the middleware skips /api).
 */
export async function GET() {
  const commit = (process.env["RAILWAY_GIT_COMMIT_SHA"] ?? "").slice(0, 7) || null;
  const t0 = Date.now();
  let dbOk = false;
  try {
    await db.$queryRawUnsafe("SELECT 1");
    dbOk = true;
  } catch {
    dbOk = false;
  }
  return NextResponse.json(
    { ok: dbOk, service: "wealthos-web", commit, db: { ok: dbOk, ms: Date.now() - t0 }, time: new Date().toISOString() },
    { status: dbOk ? 200 : 503 },
  );
}
