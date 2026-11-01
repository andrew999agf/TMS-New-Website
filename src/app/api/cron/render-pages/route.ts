import { NextResponse } from "next/server";
import { ensureDiscoveryTables } from "@/db/ensure";
import { nextSetNeedingRender, renderPagesChunk } from "@/lib/documents/page-images";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Every minute: one rendering sweep on the case that has waited longest,
 *  so a big upload gets its page pictures even with nobody on the tab. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDiscoveryTables().catch(() => {});
  const setId = await nextSetNeedingRender();
  if (!setId) return NextResponse.json({ ok: true, note: "nothing to render" });
  const r = await renderPagesChunk(setId, 50_000);
  return NextResponse.json({ ok: true, setId, pagesLeft: r.pagesLeft, pagesTotal: r.pagesTotal, done: r.done, current: r.current ?? null });
}
