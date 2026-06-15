import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Same-origin image proxy for uploaded media (Vercel Blob). The blob URL arrives
 * base64url-encoded so the blocked CDN hostname never appears in the request;
 * we decode it, verify it points at the Blob host (so this can't be an open
 * proxy), fetch it server-side, and return the bytes from the site's own domain.
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("u");
  if (!raw) return new NextResponse("Missing url", { status: 400 });

  let urlStr: string;
  try {
    if (raw.startsWith("http")) {
      urlStr = raw; // legacy/plain form
    } else {
      const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
      const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
      urlStr = Buffer.from(padded, "base64").toString("utf8");
    }
  } catch {
    return new NextResponse("Bad url", { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(urlStr);
  } catch {
    return new NextResponse("Bad url", { status: 400 });
  }
  if (target.protocol !== "https:" || !/\.blob\.vercel-storage\.com$/.test(target.hostname)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const upstream = await fetch(target.toString());
    if (!upstream.ok) return new NextResponse("Upstream error", { status: 502 });
    const buf = await upstream.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Fetch failed", { status: 502 });
  }
}
