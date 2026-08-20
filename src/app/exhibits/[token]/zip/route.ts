import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { exhibitSets, exhibitDocs } from "@/db/schema";
import { parseFileIds } from "@/lib/share/zip";
import { zipExhibits } from "@/lib/exhibit-review/zipdocs";

export const runtime = "nodejs";

/** Public ZIP download for a shared set. Works only while sharing is on.
 *  ?ids=1,2,3 downloads a selection; no ids downloads everything. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!db) return new NextResponse("Unavailable", { status: 503 });
  const { token } = await params;
  const [set] = await db.select({ id: exhibitSets.id, name: exhibitSets.name }).from(exhibitSets).where(and(eq(exhibitSets.publicToken, token), eq(exhibitSets.isPublic, true)));
  if (!set) return new NextResponse("This link is not available.", { status: 404 });

  const rows = await db
    .select({ id: exhibitDocs.id, side: exhibitDocs.side, number: exhibitDocs.number, label: exhibitDocs.label, title: exhibitDocs.title, url: exhibitDocs.url })
    .from(exhibitDocs).where(eq(exhibitDocs.setId, set.id)).orderBy(asc(exhibitDocs.sort), asc(exhibitDocs.id));

  const ids = parseFileIds(new URL(req.url).searchParams.get("ids"));
  const zip = zipExhibits(rows, ids, `${set.name || "exhibits"} exhibits${ids ? " (selected)" : ""}.zip`);
  if (!zip) return new NextResponse("No exhibits to download.", { status: 404 });
  return zip;
}
