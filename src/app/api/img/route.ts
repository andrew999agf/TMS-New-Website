export const runtime = "edge";

/**
 * Same-origin image proxy. Uploaded media lives on Vercel Blob
 * (*.blob.vercel-storage.com); some restrictive networks/extensions block that
 * CDN domain — even when its name only appears in a query string — which makes
 * images vanish on those machines. The URL arrives base64url-encoded so the
 * blocked hostname is never present in the request; we decode, verify it points
 * at the Blob host (so this can't be an open proxy), then stream it back from
 * the site's own domain.
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("u");
  if (!raw) return new Response("Missing url", { status: 400 });

  let urlStr: string;
  if (raw.startsWith("http")) {
    urlStr = raw; // legacy/plain form
  } else {
    try {
      const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
      const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
      urlStr = atob(padded);
    } catch {
      return new Response("Bad url", { status: 400 });
    }
  }

  let target: URL;
  try {
    target = new URL(urlStr);
  } catch {
    return new Response("Bad url", { status: 400 });
  }
  if (target.protocol !== "https:" || !/\.blob\.vercel-storage\.com$/.test(target.hostname)) {
    return new Response("Forbidden", { status: 403 });
  }

  const upstream = await fetch(target.toString(), { cache: "force-cache" });
  if (!upstream.ok || !upstream.body) return new Response("Upstream error", { status: 502 });

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") ?? "application/octet-stream");
  headers.set("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
  return new Response(upstream.body, { status: 200, headers });
}
