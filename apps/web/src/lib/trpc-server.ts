// Server-side tRPC caller: server components call procedures in-process (no HTTP hop).
import { appRouter, type Context } from "@wealthos/api";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "./session";

export async function serverCaller() {
  const secret = process.env["AUTH_SECRET"];
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const session = secret && token ? await verifySessionToken(token, secret) : null;
  const ctx: Context = { session };
  return appRouter.createCaller(ctx);
}
