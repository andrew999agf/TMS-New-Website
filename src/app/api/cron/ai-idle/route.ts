import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { resolvedRunpodConfig, getPodStatus, stopPod, aiEndpointReady } from "@/lib/ai/runpod";
import { AI_IDLE_KEY, AI_AUTOSLEEP_KEY, AI_LAST_USED_KEY, AI_IDLE_DEFAULT, getAiSetting, putAiSetting, monthEstimate } from "@/lib/ai/concierge";
import { db } from "@/db";
import { aiServerLog } from "@/db/schema";
import { ensureDiscoveryTables } from "@/db/ensure";

/** How long a wake-up may take before a still-unresponsive server is treated
 *  as wedged and stopped anyway (so a crashed load can't bill forever). */
const LOAD_GRACE_MS = 30 * 60 * 1000;

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The idle reaper: runs every minute (vercel.json). If the AI GPU server is
 * running and nobody has asked the Assistant anything for longer than the
 * configured idle timeout, it puts the server to sleep so the meter stops.
 * The model stays on the pod's storage; the next wake is a button press.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cfg = await resolvedRunpodConfig();
  if (!cfg) return NextResponse.json({ ok: true, note: "not configured" });

  // Default is OFF: the server stays on until someone turns it off. Auto-sleep
  // only runs for users who explicitly picked an idle timeout.
  const autoSleep = await getAiSetting<boolean>(AI_AUTOSLEEP_KEY, false);
  if (!autoSleep) return NextResponse.json({ ok: true, note: "auto-sleep off" });

  let pod;
  try {
    pod = await getPodStatus(cfg);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message.slice(0, 200) });
  }
  if (pod.desiredStatus !== "RUNNING") return NextResponse.json({ ok: true, note: "already asleep" });

  const idleMinutes = await getAiSetting<number>(AI_IDLE_KEY, AI_IDLE_DEFAULT);
  const lastUsed = await getAiSetting<string | null>(AI_LAST_USED_KEY, null);
  if (!lastUsed) {
    // Running but never touched (started outside the concierge): start the
    // clock now so it gets one full idle window before sleeping.
    await putAiSetting(AI_LAST_USED_KEY, new Date().toISOString());
    return NextResponse.json({ ok: true, note: "idle clock started" });
  }

  const idleMs = Date.now() - new Date(lastUsed).getTime();
  if (idleMs < idleMinutes * 60000) {
    return NextResponse.json({ ok: true, note: `in use ${Math.round(idleMs / 1000)}s ago` });
  }

  // Still loading the model? That is NOT idle — nobody can chat while the
  // endpoint isn't answering, so the clock must not run against them. Keep
  // refreshing last-used so the idle window starts once it's actually ready.
  // A server that never comes up within the grace period is wedged: stop it
  // anyway so a crashed load can't bill forever.
  const ready = await aiEndpointReady();
  if (!ready) {
    // How long has this wake-up been going? Measured from the last logged
    // start. No start on record means it wasn't woken through the concierge —
    // no grace, the plain idle rule above already gave it its window.
    let loadingMs = Number.POSITIVE_INFINITY;
    if (db) {
      try {
        const [lastStart] = await db
          .select({ at: aiServerLog.createdAt })
          .from(aiServerLog)
          .where(eq(aiServerLog.event, "start"))
          .orderBy(desc(aiServerLog.createdAt))
          .limit(1);
        if (lastStart) loadingMs = Date.now() - lastStart.at.getTime();
      } catch {
        loadingMs = 0; // DB blip — don't kill a loading server over it
      }
    }
    if (loadingMs < LOAD_GRACE_MS) {
      await putAiSetting(AI_LAST_USED_KEY, new Date().toISOString());
      return NextResponse.json({ ok: true, note: "server still loading — not idle" });
    }
  }

  try {
    await ensureDiscoveryTables();
    await stopPod(cfg);
    if (db) await db.insert(aiServerLog).values({ event: "autostop", costPerHr: pod.costPerHr, byEmail: "idle-reaper" });
    const monthUsd = await monthEstimate(null);
    return NextResponse.json({ ok: true, stopped: true, idleMinutes, monthUsd });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message.slice(0, 200) });
  }
}
