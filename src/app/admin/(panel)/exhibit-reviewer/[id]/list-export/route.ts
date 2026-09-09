import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { exhibitSets, exhibitDocs, exhibitWitnesses } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { isVideoFile } from "@/lib/exhibit-review/media";
import { exhibitListDocx, exhibitListCsv, exportFileBase, type ExportDoc } from "@/lib/exhibit-review/list-export";

export const runtime = "nodejs";

const disposition = (fileName: string) =>
  `attachment; filename="${fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;

/**
 * Download the exhibit list itself, formatted:
 *   ?fmt=docx (default)  court-filing-style Word document with the case caption
 *   ?fmt=csv             spreadsheet (Excel / paste into a Word table)
 *   ?side=plaintiff|defendant|joint|all (default all)
 * Omitted exhibits are off the list and excluded.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/exhibit-reviewer", session.role, session.permissions)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const setId = Number((await params).id);
  if (!Number.isFinite(setId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [set] = await db.select({ name: exhibitSets.name, causeNumber: exhibitSets.causeNumber, court: exhibitSets.court }).from(exhibitSets).where(eq(exhibitSets.id, setId));
  if (!set) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sp = new URL(req.url).searchParams;
  const fmt = sp.get("fmt") === "csv" ? "csv" : "docx";
  const sideParam = sp.get("side") ?? "all";
  const side = ["plaintiff", "defendant", "joint"].includes(sideParam) ? sideParam : "all";

  const [rows, witnessRows] = await Promise.all([
    db.select().from(exhibitDocs).where(and(eq(exhibitDocs.setId, setId), eq(exhibitDocs.omitted, false))).orderBy(asc(exhibitDocs.sort), asc(exhibitDocs.id)),
    db.select({ id: exhibitWitnesses.id, name: exhibitWitnesses.name }).from(exhibitWitnesses).where(eq(exhibitWitnesses.setId, setId)),
  ]);
  const wName = new Map(witnessRows.map((w) => [w.id, w.name]));
  const names = (v: unknown) => (Array.isArray(v) ? (v as number[]).map((id) => wName.get(id)).filter((n): n is string => Boolean(n)) : []);

  const docs: ExportDoc[] = rows
    .filter((r) => side === "all" || r.side === side)
    .map((r) => ({
      side: r.side, number: r.number, label: r.label, title: r.title, description: r.description,
      bates: r.bates, batesEnd: r.batesEnd, pageCount: r.pageCount,
      isVideo: isVideoFile(r.pathname ?? r.url, r.contentType),
      witnessNames: names(r.witnessIds), presentNames: names(r.presentIds),
      offerStatus: r.offerStatus, trialStatus: r.trialStatus,
    }));

  const base = exportFileBase(set, side);
  if (fmt === "csv") {
    return new NextResponse(exhibitListCsv(docs), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": disposition(`${base}.csv`), "Cache-Control": "private, no-store" },
    });
  }
  const buf = await exhibitListDocx(set, docs, side);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": disposition(`${base}.docx`),
      "Cache-Control": "private, no-store",
    },
  });
}
