import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { engagementLetters } from "@/db/schema";
import { ensureDiscoveryTables } from "@/db/ensure";
import { buildEngagementLetter, letterFileName } from "@/lib/engagement/letter";
import type { EngagementOffice, EngagementSide } from "@/lib/engagement/config";

export const runtime = "nodejs";

/** The client's copy of the letter, gated by the same unguessable e-sign
 *  token as the page — no login, exactly like the firm's share links. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const { token } = await params;
  if (!token || token.length < 16) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await ensureDiscoveryTables();
  const [letter] = await db.select().from(engagementLetters).where(eq(engagementLetters.signToken, token));
  if (!letter) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buf = await buildEngagementLetter({
    clientName: letter.clientName, businessName: letter.businessName, officerTitle: letter.officerTitle,
    andIndividually: letter.andIndividually, email: letter.email, street: letter.street, city: letter.city,
    state: letter.state, zip: letter.zip, county: letter.county,
    office: letter.office as EngagementOffice, side: letter.side as EngagementSide,
    generalDescription: letter.generalDescription, caseNumber: letter.caseNumber, caseStyling: letter.caseStyling,
    phase1Custom: letter.phase1Custom, phase2Custom: letter.phase2Custom,
    phase1: letter.phase1, phase2: letter.phase2, fees: letter.fees, openUntil: letter.openUntil,
  });

  const fileName = letterFileName(letter);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'")}"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
