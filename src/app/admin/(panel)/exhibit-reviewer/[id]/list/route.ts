import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { exhibitSets } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";

export const runtime = "nodejs";

/** Sign-in-checked inline stream of a set's "exhibit list" document, so it can be
 *  viewed in the reviewer just like an exhibit. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/exhibit-reviewer", session.role, session.permissions)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const setId = Number((await params).id);
  if (!Number.isFinite(setId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [set] = await db.select({ url: exhibitSets.listUrl, contentType: exhibitSets.listContentType, sizeBytes: exhibitSets.listSizeBytes, name: exhibitSets.listName }).from(exhibitSets).where(eq(exhibitSets.id, setId));
  if (!set?.url) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const range = req.headers.get("range");
  const upstream = await fetch(set.url, range ? { headers: { Range: range } } : undefined);
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: "File unavailable." }, { status: 502 });

  const base = (set.name || "exhibit-list").replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  const headers = new Headers();
  headers.set("Content-Type", set.contentType || "application/pdf");
  headers.set("Content-Disposition", `inline; filename="${base}"`);
  headers.set("Accept-Ranges", "bytes");
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  else if (set.sizeBytes && !contentRange) headers.set("Content-Length", String(set.sizeBytes));
  headers.set("Cache-Control", "private, max-age=600");
  headers.set("Referrer-Policy", "no-referrer");
  return new NextResponse(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
}
