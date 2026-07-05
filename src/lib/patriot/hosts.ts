import { headers } from "next/headers";

/**
 * Hostnames that serve the dedicated Patriot Series experience (clean URLs:
 * "/" is the broadcast, "/admin" the operator console). Keep this list in
 * sync with PATRIOT_HOSTS in src/middleware.ts (kept separate because the
 * edge middleware can't import next/headers).
 */
export const PATRIOT_HOSTS = new Set([
  "patriotseriestexas.com",
  "www.patriotseriestexas.com",
]);

export function isPatriotHostname(host: string | null | undefined): boolean {
  return PATRIOT_HOSTS.has((host ?? "").split(":")[0].toLowerCase());
}

/**
 * The correct link to the Patriot operator console (Switchboard) for the host
 * serving the current request. On the Patriot domain the middleware rewrites
 * "/admin" onto the Patriot admin; anywhere else (firm domain, vercel.app
 * previews) "/admin" is the FIRM portal, so the full path must be used.
 */
export async function patriotAdminPath(): Promise<string> {
  const host = (await headers()).get("host");
  return isPatriotHostname(host) ? "/admin" : "/patriot-series-250/admin";
}

/** True when the current request is served on a Patriot Series hostname. */
export async function isPatriotRequest(): Promise<boolean> {
  return isPatriotHostname((await headers()).get("host"));
}

/**
 * Host-aware href for a public Patriot page. On the Patriot domain the clean
 * path ("/news/slug") works via the middleware rewrites; on the firm domain
 * and vercel.app previews only the real "/patriot-series-250/…" paths exist.
 */
export async function patriotPublicPath(path: string): Promise<string> {
  if (await isPatriotRequest()) return path;
  return path === "/" ? "/patriot-series-250" : `/patriot-series-250${path}`;
}
