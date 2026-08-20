import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { exhibitDocs } from "@/db/schema";
import { parseFileIds } from "@/lib/share/zip";
import { zipExhibits } from "@/lib/exhibit-review/zipdocs";
import { resolveExhibitRecipient, isVerifiedAs } from "@/lib/exhibit-review/recipient";

export const runtime = "nodejs";

/** ZIP download for a restricted (named-recipient) share. Requires a valid
 *  recipient token and a verified one-time-code session. ?ids= selects. */
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
  const zip = zipExhibits(rows, ids, `${ctx.set.name || "exhibits"} exhibits${ids ? " (selected)" : ""}.zip`);
  if (!zip) return new NextResponse("No exhibits to download.", { status: 404 });
  return zip;
}
