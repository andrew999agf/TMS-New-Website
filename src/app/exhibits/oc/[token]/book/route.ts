import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { exhibitDocs } from "@/db/schema";
import { parseFileIds } from "@/lib/share/zip";
import { mergeExhibits } from "@/lib/exhibit-review/book";
import { ocSetForToken } from "@/lib/exhibit-review/public";

export const runtime = "nodejs";
export const maxDuration = 300;

/** "Single PDF book" for the opposing-counsel link. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!db) return new NextResponse("Unavailable", { status: 503 });
  const { token } = await params;
  const set = await ocSetForToken(token);
  if (!set) return new NextResponse("This link is not available.", { status: 404 });

  const rows = await db
    .select({ id: exhibitDocs.id, side: exhibitDocs.side, number: exhibitDocs.number, label: exhibitDocs.label, title: exhibitDocs.title, url: exhibitDocs.url })
    .from(exhibitDocs).where(eq(exhibitDocs.setId, set.id)).orderBy(asc(exhibitDocs.sort), asc(exhibitDocs.id));

  const ids = parseFileIds(new URL(req.url).searchParams.get("ids"));
  const book = await mergeExhibits(rows, ids, `${set.name || "exhibits"} — exhibit book${ids ? " (selected)" : ""}.pdf`);
  return book ?? new NextResponse("No exhibits to combine.", { status: 404 });
}
