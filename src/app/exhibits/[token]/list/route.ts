import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { exhibitSets } from "@/db/schema";

export const runtime = "nodejs";

/**
 * The set's uploaded "exhibit list" document, streamed inline for the
 * anyone-with-the-link share view. Same access rule as the exhibit files:
 * the unguessable public token plus sharing switched on. The opposing-counsel
 * link has NO equivalent route — that view stays bare-bones by design.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!db) return new NextResponse("Unavailable", { status: 503 });
  const { token } = await params;
  if (!token) return new NextResponse("Not found", { status: 404 });

  const [set] = await db
    .select({ listUrl: exhibitSets.listUrl, listPathname: exhibitSets.listPathname, listContentType: exhibitSets.listContentType, listName: exhibitSets.listName })
    .from(exhibitSets)
    .where(and(eq(exhibitSets.publicToken, token), eq(exhibitSets.isPublic, true)));
  if (!set?.listUrl) return new NextResponse("Not found", { status: 404 });

  const range = req.headers.get("range");
  const upstream = await fetch(set.listUrl, range ? { headers: { Range: range } } : undefined);
  if (!upstream.ok || !upstream.body) return new NextResponse("File unavailable.", { status: 502 });

  const base = (set.listName || "exhibit list").replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'").replace(/\.[a-z0-9]{2,5}$/i, "");
  const ext = ((set.listPathname ?? set.listUrl).match(/\.([a-z0-9]{2,5})(\?.*)?$/i)?.[1] ?? "pdf").toLowerCase();
  const headers = new Headers();
  headers.set("Content-Type", set.listContentType || "application/pdf");
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
