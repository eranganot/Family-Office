import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { SESSION_COOKIE, verifySessionToken } from "./lib/session";

const intl = createMiddleware(routing);

function localeOf(pathname: string): string {
  const seg = pathname.split("/")[1];
  return seg === "en" ? "en" : "he";
}

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isLogin = /^\/(he|en)\/login\/?$/.test(pathname) || pathname === "/login";

  const secret = process.env["AUTH_SECRET"];
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = secret && token ? await verifySessionToken(token, secret) : null;

  if (!session && !isLogin) {
    return NextResponse.redirect(new URL(`/${localeOf(pathname)}/login`, req.url));
  }
  if (session && isLogin) {
    return NextResponse.redirect(new URL(`/${localeOf(pathname)}`, req.url));
  }
  return intl(req);
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
