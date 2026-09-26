import { NextResponse } from "next/server";
import { runpodConfig, getPodStatus, stopPod } from "@/lib/ai/runpod";
import { AI_IDLE_KEY, AI_AUTOSLEEP_KEY, AI_LAST_USED_KEY, AI_IDLE_DEFAULT, getAiSetting, putAiSetting, monthEstimate } from "@/lib/ai/concierge";
import { db } from "@/db";
import { aiServerLog } from "@/db/schema";
import { ensureDiscoveryTables } from "@/db/ensure";

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

  const cfg = runpodConfig();
  if (!cfg) return NextResponse.json({ ok: true, note: "not configured" });

  const autoSleep = await getAiSetting<boolean>(AI_AUTOSLEEP_KEY, true);
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
