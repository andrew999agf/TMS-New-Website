import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { engagementLetters } from "@/db/schema";
import { ensureDiscoveryTables } from "@/db/ensure";
import { letterPdf } from "@/lib/engagement/signed";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The client's copy of the letter — always a PDF (never an editable Word
 * file), with the signature page appended once signed. Gated by the same
 * unguessable e-sign token as the page. Opens inline for the embedded
 * viewer; ?dl=1 downloads.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const { token } = await params;
  if (!token || token.length < 16) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await ensureDiscoveryTables();
  const [letter] = await db.select().from(engagementLetters).where(eq(engagementLetters.signToken, token));
  if (!letter) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let pdf: Awaited<ReturnType<typeof letterPdf>>;
  try {
    pdf = await letterPdf(letter);
  } catch (err) {
    console.error("[engage] letter PDF render failed:", err);
    return NextResponse.json({ error: "The letter can't be displayed right now — please call the office." }, { status: 503 });
  }
  if (!pdf) return NextResponse.json({ error: "Letter unavailable — please call the office." }, { status: 409 });

  const dl = new URL(req.url).searchParams.get("dl") === "1";
  const fn = pdf.fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  return new NextResponse(new Uint8Array(pdf.buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${dl ? "attachment" : "inline"}; filename="${fn}"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
