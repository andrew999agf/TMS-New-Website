import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { resolveSharedFile } from "@/lib/discovery/public";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * ONE page of a shared document, extracted on the fly as its own one-page
 * PDF. The stored file is never modified — this copies a single page out of
 * it per request, keeping whatever text layer that page has (so OCR'd pages
 * stay selectable/copyable, and an AI given the link can read them).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; key: string; n: string }> }) {
  const { token, key, n } = await params;
  const page = Math.floor(Number(n));
  if (!Number.isFinite(page) || page < 1) return new NextResponse("Not found", { status: 404 });
  const f = await resolveSharedFile(token, key).catch(() => null);
  if (!f) return new NextResponse("Not found", { status: 404 });
  const isPdf = (f.contentType ?? "").includes("pdf") || /\.pdf$/i.test(f.pathname ?? f.name);
  if (!isPdf) return new NextResponse("Not a PDF", { status: 404 });

  try {
    const upstream = await fetch(f.url, { signal: AbortSignal.timeout(45_000) });
    if (!upstream.ok) return new NextResponse("File unavailable.", { status: 502 });
    const len = Number(upstream.headers.get("content-length") || 0);
    if (len > 200 * 1024 * 1024) return new NextResponse("Document too large for single-page links — open the full document instead.", { status: 413 });
    const src = await PDFDocument.load(new Uint8Array(await upstream.arrayBuffer()), { ignoreEncryption: true });
    if (page > src.getPageCount()) return new NextResponse("Not found", { status: 404 });
    const out = await PDFDocument.create();
    const [copied] = await out.copyPages(src, [page - 1]);
    out.addPage(copied);
    const bytes = await out.save();

    const base = (f.name || "document").replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'").replace(/\.pdf$/i, "");
    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Disposition", `inline; filename="${base} - page ${page}.pdf"`);
    headers.set("Cache-Control", "private, max-age=300");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Robots-Tag", "noindex, nofollow");
    return new NextResponse(Buffer.from(bytes), { headers });
  } catch {
    return new NextResponse("Page unavailable.", { status: 502 });
  }
}
