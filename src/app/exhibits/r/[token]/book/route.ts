import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { exhibitDocs } from "@/db/schema";
import { parseFileIds } from "@/lib/share/zip";
import { mergeExhibits } from "@/lib/exhibit-review/book";
import { resolveExhibitRecipient, isVerifiedAs } from "@/lib/exhibit-review/recipient";

export const runtime = "nodejs";
export const maxDuration = 300;

/** "Single PDF book" for a restricted (named-recipient) share — requires a valid
 *  token and a verified one-time-code session. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!db) return new NextResponse("Unavailable", { status: 503 });
  const { token } = await params;
  const ctx = await resolveExhibitRecipient(token);
  if (!ctx) return new NextResponse("This link is not available.", { status: 404 });
  if (!(await isVerifiedAs(ctx.rec.email))) return new NextResponse("Please verify your email to download.", { status: 401 });

  const rows = await db
    .select({ id: exhibitDocs.id, side: exhibitDocs.side, number: exhibitDocs.number, label: exhibitDocs.label, title: exhibitDocs.title, url: exhibitDocs.url })
    .from(exhibitDocs).where(eq(exhibitDocs.setId, ctx.set.id)).orderBy(asc(exhibitDocs.sort), asc(exhibitDocs.id));

  const ids = parseFileIds(new URL(req.url).searchParams.get("ids"));
  const book = await mergeExhibits(rows, ids, `${ctx.set.name || "exhibits"} — exhibit book${ids ? " (selected)" : ""}.pdf`);
  return book ?? new NextResponse("No exhibits to combine.", { status: 404 });
}
