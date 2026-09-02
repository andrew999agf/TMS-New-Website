import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { engagementLetters } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { buildEngagementLetter, letterFileName } from "@/lib/engagement/letter";
import type { EngagementOffice, EngagementSide } from "@/lib/engagement/config";

export const runtime = "nodejs";

const disposition = (fileName: string) =>
  `attachment; filename="${fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;

/** Download a saved engagement letter as a filled .docx. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/intake", session.role, session.permissions)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [letter] = await db.select().from(engagementLetters).where(eq(engagementLetters.id, id));
  if (!letter) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buf = await buildEngagementLetter({
    clientName: letter.clientName,
    businessName: letter.businessName,
    officerTitle: letter.officerTitle,
    andIndividually: letter.andIndividually,
    email: letter.email,
    street: letter.street,
    city: letter.city,
    state: letter.state,
    zip: letter.zip,
    county: letter.county,
    office: letter.office as EngagementOffice,
    side: letter.side as EngagementSide,
    generalDescription: letter.generalDescription,
    caseNumber: letter.caseNumber,
    caseStyling: letter.caseStyling,
    phase1Custom: letter.phase1Custom,
    phase2Custom: letter.phase2Custom,
    fees: letter.fees,
    openUntil: letter.openUntil,
  });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": disposition(letterFileName(letter)),
      "Cache-Control": "no-store",
    },
  });
}
