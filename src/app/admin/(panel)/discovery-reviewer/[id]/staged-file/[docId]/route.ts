import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { productionDocs } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";

export const runtime = "nodejs";

/**
 * Sign-in-checked proxy for a staged/produced Bates copy, so the yellow tab's
 * grid and reader can render its pages same-origin — the same review surface
 * the red tab has, pointed at the exact copy that would go out the door.
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

  const [doc] = await db.select().from(productionDocs).where(and(eq(productionDocs.id, did), eq(productionDocs.setId, setId)));
  if (!doc?.url) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const range = req.headers.get("range");
  const upstream = await fetch(doc.url, range ? { headers: { Range: range } } : undefined);
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: "File unavailable." }, { status: 502 });

  const base = (doc.name || "document").replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  const headers = new Headers();
  headers.set("Content-Type", doc.contentType || "application/pdf");
  headers.set("Content-Disposition", `inline; filename="${base}.pdf"`);
  headers.set("Accept-Ranges", "bytes");
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  // The copy can be regenerated in place (a late redaction), so don't cache.
  headers.set("Cache-Control", "private, no-store");
  headers.set("Referrer-Policy", "no-referrer");
  return new NextResponse(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
}
