import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { discoverySets, productionDocs } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { batesLabel } from "@/lib/production/build";
import { decodeIdRanges } from "@/lib/production/parts";
import { zipOrParts } from "@/lib/share/zip";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Yellow tab → "Download as individual PDFs": one ZIP holding each selected
 * staged copy as its own file, named by its Bates range. A very large set
 * comes as several ZIPs (zipOrParts).
 *
 *   ?ids=12-40,45   the staged copies (compact ranges)
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/discovery-reviewer", session.role, session.permissions)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const setId = Number((await params).id);
  if (!Number.isFinite(setId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ids = decodeIdRanges(new URL(req.url).searchParams.get("ids"));
  if (!ids.length) return NextResponse.json({ error: "Nothing selected." }, { status: 400 });

  const [set] = await db.select({ name: discoverySets.name }).from(discoverySets).where(eq(discoverySets.id, setId));
  const docs = (await db.select().from(productionDocs).where(and(eq(productionDocs.setId, setId), inArray(productionDocs.id, ids))))
    .filter((d) => !!d.url)
    .sort((a, b) => a.batesStart - b.batesStart || a.id - b.id);
  if (!docs.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const files = docs.map((d) => ({
    url: d.url as string,
    size: d.sizeBytes,
    name: `${d.batesPrefix && d.batesStart > 0
      ? `${batesLabel(d.batesPrefix, d.batesStart)}${d.batesEnd > d.batesStart ? `-${batesLabel(d.batesPrefix, d.batesEnd)}` : ""}`
      : (d.name || `document-${d.id}`).replace(/\.pdf$/i, "")}.pdf`,
  }));
  const zipName = `To be produced - ${(set?.name || "case").replace(/[\\/:*?"<>|]/g, "-")}.zip`;
  return zipOrParts(req, files, zipName);
}
