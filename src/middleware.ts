import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { canAccessPath } from "@/lib/admin-sections";

/**
 * Hostnames that serve the dedicated Patriot Series experience instead of the
 * law-firm site. On these hosts the live broadcast lives at the root ("/") and
 * the operator console lives at "/admin" — both of which are quietly rewritten
 * onto the existing pages under /patriot-series-250.
 *
 * This stays completely DORMANT for the firm's own domain: the Patriot routing
 * below only runs when the incoming request's host is one of these. Until the
 * patriotseriestexas.com domain is actually pointed at this deployment, none of
 * this code path is ever reached, so the firm site is unaffected.
 */
const PATRIOT_HOSTS = new Set([
  "patriotseriestexas.com",
  "www.patriotseriestexas.com",
]);

function hostOf(req: NextRequest): string {
  // Strip any :port and lowercase so localhost testing + real hosts both work.
  return (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
}

/**
 * Traffic director for the Patriot Series domain. Maps the clean public URLs
 * onto the pages that already exist:
 *   /         → /patriot-series-250          (live watch page)
 *   /admin    → /patriot-series-250/control  (operator console)
 * The shared login / reset pages pass straight through so the operator can sign
 * in with their existing admin account.
 */
function patriotRouting(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  if (pathname === "/") {
    return NextResponse.rewrite(new URL("/patriot-series-250", req.url));
  }
  if (pathname === "/admin" || pathname === "/admin/") {
    return NextResponse.rewrite(new URL("/patriot-series-250/control", req.url));
  }
  // Shared auth pages (operator signs in here) — let them render as-is.
  if (pathname.startsWith("/admin/login") || pathname.startsWith("/admin/reset")) {
    return NextResponse.next();
  }
  // Public content pages → their /patriot-series-250/* equivalents.
  const PUBLIC_PAGES: Record<string, string> = {
    "/teams": "/patriot-series-250/teams",
    "/past-tournaments": "/patriot-series-250/past-tournaments",
    "/stadium": "/patriot-series-250/stadium",
  };
  const dest = PUBLIC_PAGES[pathname];
  if (dest) return NextResponse.rewrite(new URL(dest, req.url));

  // The real Patriot pages and everything else just pass through.
  return NextResponse.next();
}

/**
 * Protect all /admin routes (except the public login & password-reset pages).
 * Verifies the session JWT at the edge, then enforces per-account section
 * access (full admins get everything; others get the Time Tracker plus any
 * sections toggled on for them).
 */
export async function middleware(req: NextRequest) {
  // Patriot Series domain: serve the broadcast at "/" and the console at
  // "/admin". Runs only for the Patriot hostnames; firm traffic skips it.
  if (PATRIOT_HOSTS.has(hostOf(req))) {
    return patriotRouting(req);
  }

  const { pathname } = req.nextUrl;

  // Firm site: middleware now also matches "/", so anything outside /admin is a
  // no-op pass-through (keeps the homepage etc. untouched).
  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

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
  // "/" is matched so the Patriot host can serve the watch page at the root;
  // for the firm host it's a cheap pass-through. "/admin/:path*" keeps the
  // firm's admin guard (and powers the Patriot "/admin" → console rewrite).
  matcher: ["/", "/admin/:path*", "/teams", "/past-tournaments", "/stadium"],
};
