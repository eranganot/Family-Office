import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, type Context } from "@wealthos/api";
import { SESSION_COOKIE, verifySessionToken } from "../../../../lib/session";

async function createContext(req: Request): Promise<Context> {
  const secret = process.env["AUTH_SECRET"];
  const cookie = req.headers.get("cookie") ?? "";
  const token = cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  const session = secret && token ? await verifySessionToken(token, secret) : null;
  return { session };
}

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(req),
  });

export { handler as GET, handler as POST };
