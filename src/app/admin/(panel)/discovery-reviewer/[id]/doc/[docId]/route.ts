import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { discoveryDocs } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";

export const runtime = "nodejs";

/**
 * Sign-in-checked PDF proxy for the Discovery Reviewer, mirroring the Exhibit
 * Reviewer's. The page renderer fetches this same-origin URL (never the raw
 * Blob URL), so every read is checked against the current session and Range
 * requests let pdf.js stream big productions instead of downloading them whole.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/discovery-reviewer", session.role, session.permissions)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const { id, docId } = await params;
  const setId = Number(id);
  const did = Number(docId);
  if (!Number.isFinite(setId) || !Number.isFinite(did)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [doc] = await db.select().from(discoveryDocs).where(and(eq(discoveryDocs.id, did), eq(discoveryDocs.setId, setId)));
  if (!doc?.url) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const range = req.headers.get("range");
  const upstream = await fetch(doc.url, range ? { headers: { Range: range } } : undefined);
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: "File unavailable." }, { status: 502 });

  const headers = new Headers();
  headers.set("Content-Type", doc.contentType || "application/pdf");
  headers.set("Content-Disposition", `inline; filename="${(doc.name || "document").replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'")}"`);
  headers.set("Accept-Ranges", "bytes");
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  else if (doc.sizeBytes && !contentRange) headers.set("Content-Length", String(doc.sizeBytes));
  headers.set("Cache-Control", "private, max-age=600");
  headers.set("Referrer-Policy", "no-referrer");
  return new NextResponse(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
}
