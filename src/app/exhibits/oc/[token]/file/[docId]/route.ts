import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { exhibitDocs } from "@/db/schema";
import { ocSetForToken } from "@/lib/exhibit-review/public";

export const runtime = "nodejs";

/** Public inline PDF stream for the opposing-counsel link. Serves the exhibit
 *  file itself (they need the exhibits) but nothing about it. Works only while
 *  the opposing-counsel link is enabled. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string; docId: string }> }) {
  if (!db) return new NextResponse("Unavailable", { status: 503 });
  const { token, docId } = await params;
  const did = Number(docId);
  if (!token || !Number.isFinite(did)) return new NextResponse("Not found", { status: 404 });

  const set = await ocSetForToken(token);
  if (!set) return new NextResponse("This link is not available.", { status: 404 });

  const [doc] = await db.select().from(exhibitDocs).where(and(eq(exhibitDocs.id, did), eq(exhibitDocs.setId, set.id), eq(exhibitDocs.omitted, false)));
  if (!doc || !doc.url) return new NextResponse("Not found", { status: 404 });

  const range = req.headers.get("range");
  const upstream = await fetch(doc.url, range ? { headers: { Range: range } } : undefined);
  if (!upstream.ok || !upstream.body) return new NextResponse("File unavailable.", { status: 502 });

  const base = (doc.label || doc.title || "exhibit").replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  const ext = ((doc.pathname ?? doc.url ?? "").match(/\.([a-z0-9]{2,5})(\?.*)?$/i)?.[1] ?? "pdf").toLowerCase();
  const headers = new Headers();
  headers.set("Content-Type", doc.contentType || "application/pdf");
  headers.set("Content-Disposition", `inline; filename="${base}.${ext}"`);
  headers.set("Accept-Ranges", "bytes");
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  headers.set("Cache-Control", "private, max-age=300");
  headers.set("Referrer-Policy", "no-referrer");
  return new NextResponse(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
}
