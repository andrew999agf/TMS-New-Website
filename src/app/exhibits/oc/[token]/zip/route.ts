import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { exhibitDocs } from "@/db/schema";
import { parseFileIds } from "@/lib/share/zip";
import { zipExhibits } from "@/lib/exhibit-review/zipdocs";
import { ocSetForToken } from "@/lib/exhibit-review/public";

export const runtime = "nodejs";

/** ZIP for the opposing-counsel link. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!db) return new NextResponse("Unavailable", { status: 503 });
  const { token } = await params;
  const set = await ocSetForToken(token);
  if (!set) return new NextResponse("This link is not available.", { status: 404 });

  const rows = await db
    .select({ id: exhibitDocs.id, side: exhibitDocs.side, number: exhibitDocs.number, label: exhibitDocs.label, title: exhibitDocs.title, url: exhibitDocs.url })
    .from(exhibitDocs).where(and(eq(exhibitDocs.setId, set.id), eq(exhibitDocs.omitted, false))).orderBy(asc(exhibitDocs.sort), asc(exhibitDocs.id));

  const ids = parseFileIds(new URL(req.url).searchParams.get("ids"));
  const zip = zipExhibits(rows, ids, `${set.name || "exhibits"} exhibits${ids ? " (selected)" : ""}.zip`);
  return zip ?? new NextResponse("No exhibits to download.", { status: 404 });
}
