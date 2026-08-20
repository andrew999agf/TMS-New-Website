import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { exhibitSets, exhibitDocs } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { parseFileIds } from "@/lib/share/zip";
import { mergeExhibits } from "@/lib/exhibit-review/book";

export const runtime = "nodejs";
export const maxDuration = 300;

const SIDE_RANK: Record<string, number> = { plaintiff: 0, defendant: 1, joint: 2 };
const cleanName = (s: string) => s.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120);

/**
 * Download a set's exhibits as ONE print-optimized PDF book: each exhibit's
 * grayscale print copy is used where it exists (so the printer bills those pages
 * as black-and-white), falling back to the original file for any exhibit that
 * hasn't been prepared yet. Same filters as the ZIP route:
 *   ?ids=1,2,3 · ?side=plaintiff · ?from=1&to=20 · (nothing) = everything
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/exhibit-reviewer", session.role, session.permissions)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const setId = Number((await params).id);
  if (!Number.isFinite(setId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [set] = await db.select({ name: exhibitSets.name }).from(exhibitSets).where(eq(exhibitSets.id, setId));
  if (!set) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const ids = parseFileIds(url.searchParams.get("ids"));
  const side = url.searchParams.get("side");
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const from = fromRaw != null && fromRaw !== "" ? Number(fromRaw) : null;
  const to = toRaw != null && toRaw !== "" ? Number(toRaw) : null;

  const rows = await db
    .select({ id: exhibitDocs.id, side: exhibitDocs.side, number: exhibitDocs.number, label: exhibitDocs.label, title: exhibitDocs.title, url: exhibitDocs.url, printUrl: exhibitDocs.printUrl, sort: exhibitDocs.sort })
    .from(exhibitDocs)
    .where(eq(exhibitDocs.setId, setId))
    .orderBy(asc(exhibitDocs.sort), asc(exhibitDocs.id));

  const selected = rows
    .filter((r) => r.url)
    .filter((r) => (ids ? ids.has(r.id) : true))
    .filter((r) => (side && !ids ? r.side === side : true))
    .filter((r) => (!ids && from != null ? (r.number ?? Infinity) >= from : true))
    .filter((r) => (!ids && to != null ? (r.number ?? -Infinity) <= to : true))
    .sort((a, b) => (SIDE_RANK[a.side] - SIDE_RANK[b.side]) || (a.number ?? Infinity) - (b.number ?? Infinity) || a.sort - b.sort || a.id - b.id)
    // Prefer the grayscale print copy; fall back to the original file.
    .map((r) => ({ id: r.id, side: r.side, number: r.number, label: r.label, title: r.title, url: r.printUrl || r.url }));

  const scope = ids ? "selected" : side ? side : from != null || to != null ? "range" : "all";
  const fileName = `${cleanName(set.name) || "exhibits"} — print copy (${scope}).pdf`;
  const book = await mergeExhibits(selected, null, fileName);
  return book ?? NextResponse.json({ error: "No exhibits match that selection." }, { status: 404 });
}
