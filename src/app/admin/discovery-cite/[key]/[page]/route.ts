import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { db } from "@/db";
import { discoveryDocs, shareFiles, productionDocs } from "@/db/schema";

export const runtime = "nodejs";

/**
 * Resolves AI.fred's citation links ([[cite:prod:2:12|HOLO_000478]] in chat)
 * to the actual stored file, opened AT the cited page (#page=N in the
 * browser's PDF viewer). Staff-only: same gate as the Discovery Reviewer.
 * Produced/staged copies open with their Bates stamps visible — the cite IS
 * the record copy. 404s stay quiet (a stale cite after a doc was removed).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string; page: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/discovery-reviewer", session.role, session.permissions)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const { key, page } = await ctx.params;
  const m = /^(doc|share|prod):(\d{1,10})$/.exec(decodeURIComponent(key));
  const n = Math.floor(Number(page));
  if (!m) return NextResponse.json({ error: "Bad citation key" }, { status: 404 });
  const id = Number(m[2]);

  let url: string | null = null;
  if (m[1] === "doc") {
    const [d] = await db.select({ url: discoveryDocs.url }).from(discoveryDocs).where(eq(discoveryDocs.id, id));
    url = d?.url ?? null;
  } else if (m[1] === "share") {
    const [f] = await db.select({ url: shareFiles.url }).from(shareFiles).where(eq(shareFiles.id, id));
    url = f?.url ?? null;
  } else {
    const [p] = await db.select({ url: productionDocs.url }).from(productionDocs).where(eq(productionDocs.id, id));
    url = p?.url ?? null;
  }
  if (!url) return NextResponse.json({ error: "The cited document is no longer on file." }, { status: 404 });
  return NextResponse.redirect(`${url}${Number.isFinite(n) && n > 0 ? `#page=${n}` : ""}`, 302);
}
