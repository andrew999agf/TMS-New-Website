export const runtime = "edge";

/**
 * Same-origin image proxy. Uploaded media lives on Vercel Blob
 * (*.public.blob.vercel-storage.com); some restrictive networks/extensions
 * block that CDN domain while allowing the site itself, which makes images
 * vanish on those machines. Serving them through this route on the site's own
 * domain fixes that. Restricted to the Blob host so it can't be used as an
 * open proxy.
 */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get("u");
  if (!u) return new Response("Missing url", { status: 400 });

  let target: URL;
  try {
    target = new URL(u);
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
