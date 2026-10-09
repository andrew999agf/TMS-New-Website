import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { productionDocs } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { mergeProductionPdf, batesLabel } from "@/lib/production/build";
import { decodeIdRanges, planProductionParts, MERGE_MAX_DOCS } from "@/lib/production/parts";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Yellow tab → "Download as one PDF": the selected staged copies merged in
 * Bates order. Past MERGE_MAX_DOCS documents (or the size one call can
 * merge) the download is planned as PDF 1 of N, 2 of N… — the page shows
 * the same plan (same planner, same inputs) and links each part here with
 * ?part=n.
 *
 *   ?ids=12-40,45   the staged copies (compact ranges)
 *   ?part=2         which PDF of the plan (default 1)
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/discovery-reviewer", session.role, session.permissions)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const setId = Number((await params).id);
  if (!Number.isFinite(setId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const sp = new URL(req.url).searchParams;
  const ids = decodeIdRanges(sp.get("ids"));
  if (!ids.length) return NextResponse.json({ error: "Nothing selected." }, { status: 400 });

  const docs = (await db.select().from(productionDocs).where(and(eq(productionDocs.setId, setId), inArray(productionDocs.id, ids))))
    .filter((d) => !!d.url)
    .sort((a, b) => a.batesStart - b.batesStart || a.id - b.id);
  if (!docs.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parts = planProductionParts(docs, undefined, MERGE_MAX_DOCS);
  const want = Math.max(1, Math.floor(Number(sp.get("part")) || 1));
  const part = parts[want - 1];
  if (!part) return NextResponse.json({ error: "No such part." }, { status: 404 });
  const chosen = part.docIds.map((id) => docs.find((d) => d.id === id)!).filter(Boolean);

  const buffers: Uint8Array[] = [];
  for (const d of chosen) {
    const res = await fetch(d.url as string);
    if (!res.ok) return NextResponse.json({ error: `Couldn't fetch ${batesLabel(d.batesPrefix, d.batesStart)}.` }, { status: 502 });
    buffers.push(new Uint8Array(await res.arrayBuffer()));
  }
  const merged = await mergeProductionPdf(buffers);

  const labeled = chosen.filter((d) => d.batesPrefix && d.batesStart > 0);
  const stem = labeled.length
    ? `${batesLabel(labeled[0].batesPrefix, Math.min(...labeled.map((d) => d.batesStart)))}-${batesLabel(labeled[0].batesPrefix, Math.max(...labeled.map((d) => d.batesEnd)))}`
    : "To be produced";
  const name = `${stem}${parts.length > 1 ? ` (PDF ${want} of ${parts.length})` : ""}.pdf`.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  return new NextResponse(Buffer.from(merged), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Content-Length": String(merged.byteLength),
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
