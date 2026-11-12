import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { buildTmlLetter, tmlLetterFileName } from "@/lib/engagement/tml-letter";
import { tmlLetterPdf } from "@/lib/engagement/tml-pdf";
import { leadForContract, loadContract } from "@/lib/intake/contracts";

export const runtime = "nodejs";
export const maxDuration = 60;

const disposition = (kind: "attachment" | "inline", fileName: string) =>
  `${kind}; filename="${fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;

/** The lead's engagement letter, filled from what has been saved: ?format=docx (Word) or pdf. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/intake", session.role, session.permissions)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const lead = await leadForContract(Number((await params).id));
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const u = new URL(req.url);
  const format = u.searchParams.get("format") === "pdf" ? "pdf" : "docx";
  const { data } = await loadContract(lead);
  const { buffer } = await buildTmlLetter(data);
  if (format === "docx") {
    return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": disposition("attachment", tmlLetterFileName(data, "docx")), "Cache-Control": "no-store" } });
  }
  try {
    const pdf = await tmlLetterPdf(buffer);
    return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": disposition(u.searchParams.get("inline") === "1" ? "inline" : "attachment", tmlLetterFileName(data, "pdf")), "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[contract] PDF conversion failed:", err);
    return NextResponse.json({ error: "The PDF could not be made just now. The Word file still downloads; try the PDF again in a minute." }, { status: 500 });
  }
}
