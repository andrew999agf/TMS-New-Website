import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { shareFolders } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { normalizeMeta } from "@/lib/share/types";
import { answerWordDoc, renderAnswerPdf, type AnswerDoc } from "@/lib/share/answer-doc";

export const runtime = "nodejs";

/** Download a recipient's task answer as a Word doc (?format=doc) or PDF (?format=pdf). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; todoId: string }> }) {
  await requireAdmin();
  const { id, todoId } = await params;
  const fid = Number(id);
  if (!db || !Number.isFinite(fid)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [folder] = await db.select().from(shareFolders).where(eq(shareFolders.id, fid));
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const todo = (normalizeMeta(folder.meta).todos ?? []).find((t) => t.id === todoId);
  if (!todo) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const data: AnswerDoc = { folder: folder.name, caseNumber: folder.caseNumber, question: todo.text, answerHtml: todo.answer ?? "", answeredAt: todo.answerAt };
  const format = new URL(req.url).searchParams.get("format") === "pdf" ? "pdf" : "doc";
  const safeName = folder.name.replace(/[^\w.-]+/g, "_").slice(0, 60) || "answer";

  if (format === "pdf") {
    const pdf = await renderAnswerPdf(data);
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${safeName}-answer.pdf"` },
    });
  }
  const html = answerWordDoc(data);
  return new NextResponse(html, {
    headers: { "Content-Type": "application/msword", "Content-Disposition": `attachment; filename="${safeName}-answer.doc"` },
  });
}
