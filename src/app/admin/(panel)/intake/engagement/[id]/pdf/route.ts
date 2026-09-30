import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { engagementLetters } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { letterPdf } from "@/lib/engagement/signed";

export const runtime = "nodejs";
export const maxDuration = 60;

/** The letter as the client-facing PDF — including the signature page once
 *  signed. Opens inline so it reads like a document, not a download. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/intake", session.role, session.permissions)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [letter] = await db.select().from(engagementLetters).where(eq(engagementLetters.id, id));
  if (!letter) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pdf = await letterPdf(letter);
  if (!pdf) return NextResponse.json({ error: "The attached edited copy is a Word file — re-attach it as a PDF." }, { status: 409 });

  const dl = new URL(req.url).searchParams.get("dl") === "1";
  const fn = pdf.fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  return new NextResponse(new Uint8Array(pdf.buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${dl ? "attachment" : "inline"}; filename="${fn}"`,
      "Cache-Control": "no-store",
    },
  });
}
