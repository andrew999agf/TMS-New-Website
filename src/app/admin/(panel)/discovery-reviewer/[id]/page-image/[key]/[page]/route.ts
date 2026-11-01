import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { discoveryDocs, discoverySets, shareFiles, shareFolders } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { pageImageFor } from "@/lib/documents/page-images";

export const runtime = "nodejs";

/**
 * Sign-in-checked picture of one page of a red-tab document:
 *   /admin/discovery-reviewer/<set>/page-image/<doc-123 | share-45>/<page>?s=t|r
 * Pictures never change once made, so the browser may keep them a week.
 */
const belongs = new Map<string, number>(); // "<set>:<key>" → checked at (ms)
const BELONGS_TTL = 10 * 60_000;

export async function GET(req: Request, { params }: { params: Promise<{ id: string; key: string; page: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/discovery-reviewer", session.role, session.permissions)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const { id, key, page } = await params;
  const setId = Number(id), pageNo = Number(page);
  const m = /^(doc|share)-(\d+)$/.exec(key);
  if (!Number.isFinite(setId) || !m || !Number.isInteger(pageNo) || pageNo < 1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const docKey = `${m[1]}:${m[2]}`;
  const ck = `${setId}:${docKey}`;
  const at = belongs.get(ck);
  if (!at || Date.now() - at > BELONGS_TTL) {
    let ok = false;
    if (m[1] === "doc") {
      const [d] = await db.select({ id: discoveryDocs.id }).from(discoveryDocs).where(and(eq(discoveryDocs.id, Number(m[2])), eq(discoveryDocs.setId, setId)));
      ok = !!d;
    } else {
      const [set] = await db.select({ matter: discoverySets.matter }).from(discoverySets).where(eq(discoverySets.id, setId));
      const [f] = set?.matter ? await db.select({ folderId: shareFiles.folderId }).from(shareFiles).where(eq(shareFiles.id, Number(m[2]))) : [];
      const [folder] = f ? await db.select({ id: shareFolders.id }).from(shareFolders).where(and(eq(shareFolders.id, f.folderId), eq(shareFolders.matter, set!.matter), eq(shareFolders.type, "client"))) : [];
      ok = !!folder;
    }
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    belongs.set(ck, Date.now());
    if (belongs.size > 5000) belongs.clear();
  }
  const img = await pageImageFor(docKey, pageNo);
  if (!img) return NextResponse.json({ error: "Not rendered yet" }, { status: 404 });
  const size = new URL(req.url).searchParams.get("s") === "r" ? "r" : "t";
  const upstream = await fetch(size === "r" ? img.readUrl : img.thumbUrl);
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: "Picture unavailable." }, { status: 502 });
  const headers = new Headers();
  headers.set("Content-Type", "image/jpeg");
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  headers.set("Cache-Control", "private, max-age=604800, immutable");
  headers.set("Referrer-Policy", "no-referrer");
  return new NextResponse(upstream.body, { status: 200, headers });
}
