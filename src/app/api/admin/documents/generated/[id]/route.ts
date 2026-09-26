import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { db } from "@/db";
import { generatedDocs } from "@/db/schema";

export const runtime = "nodejs";

/** Admin-gated download of a generated document — the blob URL itself is
 *  never handed out, so the paper trail stays behind the firm's login. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/documents", session.role, session.permissions)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  const { id } = await params;
  const docId = Number(id);
  if (!Number.isFinite(docId) || !db) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [row] = await db.select().from(generatedDocs).where(eq(generatedDocs.id, docId));
  if (!row?.url) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const upstream = await fetch(row.url);
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: "File unavailable" }, { status: 502 });
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${row.name.replace(/[^\w\-. ]+/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
