import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { replyToDocx } from "@/lib/ai/reply-docx";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Turn an AI.fred reply into a downloadable Word document. Admin-gated;
 *  the content comes straight back to the caller as a .docx attachment. */
export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/assistant", session.role, session.permissions)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  let body: { content?: string; title?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const content = typeof body.content === "string" ? body.content.slice(0, 200000) : "";
  if (!content.trim()) return NextResponse.json({ error: "Nothing to export." }, { status: 400 });
  const title = (typeof body.title === "string" && body.title.trim() ? body.title.trim() : "AI.fred draft").slice(0, 120);
  const buf = await replyToDocx(content, title);
  const filename = `${title.replace(/[^\w\- ]+/g, "").replace(/\s+/g, " ").trim() || "AIfred draft"} ${new Date().toISOString().slice(0, 10)}.docx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
