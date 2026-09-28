import { NextResponse } from "next/server";
import { getLabelJobs, runLabelJobChunk } from "@/lib/ai/label-job";
import { ensureDiscoveryTables } from "@/db/ensure";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The Read & label heartbeat: every minute (vercel.json), advance any active
 * background labeling job by one chunk — whether or not anybody has the page
 * open. The user's one confirmation authorized the whole run (including
 * waking the server), so nothing here starts on its own: no job, no work.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await getLabelJobs();
  const ids = Object.values(jobs).map((j) => j.setId);
  if (!ids.length) return NextResponse.json({ ok: true, note: "no jobs" });

  await ensureDiscoveryTables().catch(() => {});
  // Oldest job first; one chunk per tick keeps each invocation inside its
  // time budget. Multiple cases just take turns, minute by minute.
  const [setId] = ids;
  const out = await runLabelJobChunk(setId, { wakeServer: true });
  return NextResponse.json({ ok: true, setId, ...( "result" in out ? { done: out.done, labeled: out.result.labeled, total: out.result.total } : { note: out.note }) });
}
