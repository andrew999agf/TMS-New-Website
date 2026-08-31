import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { portalDocs, portalMatters } from "@/db/schema";
import { verifiedPortalCtx } from "@/lib/portal-access";

export const runtime = "nodejs";

/** Stream a Client Documents file to the verified portal member. Only the
 *  client tab is reachable — pleadings, discovery, and exhibits never are. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await params;
  const ctx = await verifiedPortalCtx(token);
  if (!ctx || !db) return new NextResponse("Not available", { status: 404 });
  const id = Number(docId);
  if (!Number.isFinite(id)) return new NextResponse("Not found", { status: 404 });
  const [doc] = await db.select().from(portalDocs).where(and(eq(portalDocs.id, id), eq(portalDocs.tab, "client")));
  if (!doc) return new NextResponse("Not found", { status: 404 });
  const [m] = await db.select({ groupId: portalMatters.groupId }).from(portalMatters).where(eq(portalMatters.id, doc.matterId));
  if (!m || m.groupId !== ctx.group.id) return new NextResponse("Not found", { status: 404 });

  const range = req.headers.get("range");
  const upstream = await fetch(doc.url, range ? { headers: { Range: range } } : undefined);
  if (!upstream.ok || !upstream.body) return new NextResponse("File unavailable.", { status: 502 });

  const headers = new Headers();
  headers.set("Content-Type", doc.contentType || "application/octet-stream");
  headers.set("Content-Disposition", `inline; filename="${doc.name.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'")}"`);
  headers.set("Accept-Ranges", "bytes");
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Referrer-Policy", "no-referrer");
  return new NextResponse(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
}
