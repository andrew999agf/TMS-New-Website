import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { exhibitDocs } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";

export const runtime = "nodejs";

/**
 * Sign-in-checked inline PDF proxy for the Exhibit Reviewer. The viewer embeds
 * this URL (never the raw Blob URL), so exhibits are served from the firm's own
 * domain, every fetch is checked against the current session, and the storage
 * URL is never exposed. Range is forwarded so a long PDF can seek and the
 * viewer's #page= jumps work.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/exhibit-reviewer", session.role, session.permissions)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const { id, docId } = await params;
  const setId = Number(id);
  const did = Number(docId);
  if (!Number.isFinite(setId) || !Number.isFinite(did)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [doc] = await db.select().from(exhibitDocs).where(and(eq(exhibitDocs.id, did), eq(exhibitDocs.setId, setId)));
  if (!doc || !doc.url) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const range = req.headers.get("range");
  const upstream = await fetch(doc.url, range ? { headers: { Range: range } } : undefined);
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: "File unavailable." }, { status: 502 });

  const base = (doc.label || doc.title || "exhibit").replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  const headers = new Headers();
  headers.set("Content-Type", doc.contentType || "application/pdf");
  // Inline so the browser's PDF viewer renders it inside the reviewer's iframe.
  headers.set("Content-Disposition", `inline; filename="${base}.pdf"`);
  headers.set("Accept-Ranges", "bytes");
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  else if (doc.sizeBytes && !contentRange) headers.set("Content-Length", String(doc.sizeBytes));
  // Private (this browser only, which already holds the session) and short-lived,
  // so jumping between pages/matches re-renders instantly instead of
  // re-downloading the PDF each time. Never shared or persisted server-side.
  headers.set("Cache-Control", "private, max-age=600");
  headers.set("Referrer-Policy", "no-referrer");
  return new NextResponse(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
}
