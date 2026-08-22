import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { exhibitDocs } from "@/db/schema";
import { resolveExhibitRecipient, isVerifiedAs } from "@/lib/exhibit-review/recipient";

export const runtime = "nodejs";

/**
 * Inline PDF stream for a restricted (named-recipient) share. Access requires a
 * valid recipient token AND that the visitor has verified their one-time code
 * (the portal cookie matches the recipient's email). A forwarded link alone
 * can't fetch the bytes. The storage URL is never exposed.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string; docId: string }> }) {
  if (!db) return new NextResponse("Unavailable", { status: 503 });
  const { token, docId } = await params;
  const did = Number(docId);
  if (!token || !Number.isFinite(did)) return new NextResponse("Not found", { status: 404 });

  const ctx = await resolveExhibitRecipient(token);
  if (!ctx) return new NextResponse("This link is not available.", { status: 404 });
  if (!(await isVerifiedAs(ctx.rec.email))) return new NextResponse("Please verify your email to view this.", { status: 401 });

  const [doc] = await db.select().from(exhibitDocs).where(and(eq(exhibitDocs.id, did), eq(exhibitDocs.setId, ctx.set.id), eq(exhibitDocs.omitted, false)));
  if (!doc || !doc.url) return new NextResponse("Not found", { status: 404 });

  const range = req.headers.get("range");
  const upstream = await fetch(doc.url, range ? { headers: { Range: range } } : undefined);
  if (!upstream.ok || !upstream.body) return new NextResponse("File unavailable.", { status: 502 });

  const base = (doc.label || doc.title || "exhibit").replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  const headers = new Headers();
  headers.set("Content-Type", doc.contentType || "application/pdf");
  headers.set("Content-Disposition", `inline; filename="${base}.pdf"`);
  headers.set("Accept-Ranges", "bytes");
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Referrer-Policy", "no-referrer");
  return new NextResponse(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
}
