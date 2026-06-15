import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { canAccessPath } from "@/lib/admin-sections";

/**
 * Protect all /admin routes (except the public login & password-reset pages).
 * Verifies the session JWT at the edge, then enforces per-account section
 * access (full admins get everything; others get the Time Tracker plus any
 * sections toggled on for them).
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin/login") || pathname.startsWith("/admin/reset")) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const valid = token ? await verifySessionToken(token) : null;

  if (!valid) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (!canAccessPath(pathname, valid.role, valid.permissions)) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/time-tracker";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
