import { NextResponse } from "next/server";
import { resolveSharedFile } from "@/lib/discovery/public";

export const runtime = "nodejs";

/**
 * Inline stream for one shared discovery document. Access is the case's
 * unguessable share token AND sharing being switched on — turn sharing off
 * and every link stops resolving. The storage URL is never exposed; Range
 * requests are forwarded so the browser viewer can page a long PDF.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string; key: string }> }) {
  const { token, key } = await params;
  const f = await resolveSharedFile(token, key).catch(() => null);
  if (!f) return new NextResponse("Not found", { status: 404 });

  const range = req.headers.get("range");
  const upstream = await fetch(f.url, range ? { headers: { Range: range } } : undefined);
  if (!upstream.ok || !upstream.body) return new NextResponse("File unavailable.", { status: 502 });

  const base = (f.name || "document").replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  const headers = new Headers();
  headers.set("Content-Type", f.contentType || "application/pdf");
  headers.set("Content-Disposition", `inline; filename="${base}"`);
  headers.set("Accept-Ranges", "bytes");
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  headers.set("Cache-Control", "private, max-age=300");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return new NextResponse(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
}
