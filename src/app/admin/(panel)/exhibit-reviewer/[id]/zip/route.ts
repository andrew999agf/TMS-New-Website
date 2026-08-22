import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { exhibitSets, exhibitDocs } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { zipResponse, parseFileIds } from "@/lib/share/zip";

export const runtime = "nodejs";

const SIDE_RANK: Record<string, number> = { plaintiff: 0, defendant: 1, joint: 2 };
const cleanName = (s: string) => s.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120);

/**
 * Download a set's exhibits as one ZIP, filtered logically:
 *   ?ids=1,2,3        explicit exhibits
 *   ?side=plaintiff   just that side
 *   ?from=1&to=20     an exhibit-number range (inclusive), optionally with side
 *   (nothing)         everything
 * Files are named "003 - P-3 Title.pdf" — a zero-padded sequence keeps them in
 * exhibit order when the ZIP is unpacked.
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
  // Omitted exhibits are included unless explicitly excluded (?omitted=0), which
  // is what the reviewer sends when the "include omitted" toggle is off — so the
  // download mirrors exactly what the user is looking at.
  const includeOmitted = url.searchParams.get("omitted") !== "0";

  const rows = await db
    .select({ id: exhibitDocs.id, side: exhibitDocs.side, number: exhibitDocs.number, label: exhibitDocs.label, title: exhibitDocs.title, url: exhibitDocs.url, omitted: exhibitDocs.omitted, sort: exhibitDocs.sort })
    .from(exhibitDocs)
    .where(eq(exhibitDocs.setId, setId))
    .orderBy(asc(exhibitDocs.sort), asc(exhibitDocs.id));

  const selected = rows
    .filter((r) => r.url)
    .filter((r) => (includeOmitted || !r.omitted))
    .filter((r) => (ids ? ids.has(r.id) : true))
    .filter((r) => (side && !ids ? r.side === side : true))
    .filter((r) => (!ids && from != null ? (r.number ?? Infinity) >= from : true))
    .filter((r) => (!ids && to != null ? (r.number ?? -Infinity) <= to : true))
    .sort((a, b) => (SIDE_RANK[a.side] - SIDE_RANK[b.side]) || (a.number ?? Infinity) - (b.number ?? Infinity) || a.sort - b.sort || a.id - b.id);

  if (selected.length === 0) return NextResponse.json({ error: "No exhibits match that selection." }, { status: 404 });

  const files = selected.map((r, i) => {
    const seq = String(i + 1).padStart(3, "0");
    const base = cleanName([r.label, r.title].filter(Boolean).join(" ") || `Exhibit ${r.number ?? r.id}`);
    return { url: r.url as string, name: `${seq} - ${base}.pdf` };
  });

  const scope = ids ? "selected" : side ? side : from != null || to != null ? "range" : "all";
  const zipName = `${cleanName(set.name) || "exhibits"} exhibits (${scope}).zip`;
  return zipResponse(files, zipName);
}
