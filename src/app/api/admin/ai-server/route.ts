import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { runpodConfig, getPodStatus, getBalance, startPod, stopPod, aiEndpointReady } from "@/lib/ai/runpod";
import { AI_IDLE_KEY, AI_AUTOSLEEP_KEY, AI_LAST_USED_KEY, AI_IDLE_DEFAULT, getAiSetting, putAiSetting, monthEstimate } from "@/lib/ai/concierge";
import { getAiNotice } from "@/lib/ai/notice";
import { db } from "@/db";
import { aiServerLog } from "@/db/schema";
import { ensureDiscoveryTables } from "@/db/ensure";

export const runtime = "nodejs";
export const maxDuration = 60;

async function guard(): Promise<{ email: string } | NextResponse> {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/assistant", session.role, session.permissions)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  return session;
}

/** Live status + costs for the Assistant tab's power strip. */
export async function GET() {
  const session = await guard();
  if (session instanceof NextResponse) return session;
  const cfg = runpodConfig();
  const notice = await getAiNotice().catch(() => null);
  if (!cfg) return NextResponse.json({ configured: false, notice });
  try {
    await ensureDiscoveryTables();
    const [pod, balance, ready, idleMinutes, autoSleep, lastUsedAt] = await Promise.all([
      getPodStatus(cfg),
      getBalance(cfg),
      aiEndpointReady(),
      getAiSetting<number>(AI_IDLE_KEY, AI_IDLE_DEFAULT),
      getAiSetting<boolean>(AI_AUTOSLEEP_KEY, true),
      getAiSetting<string | null>(AI_LAST_USED_KEY, null),
    ]);
    const running = pod.desiredStatus === "RUNNING";
    const state = !pod.exists ? "missing" : running ? (ready ? "ready" : "starting") : "stopped";
    const monthUsd = await monthEstimate(running ? pod.costPerHr : null);
    return NextResponse.json({
      configured: true,
      state, // ready | starting | stopped | missing
      costPerHr: running ? pod.costPerHr : 0,
      podCostPerHr: pod.costPerHr,
      gpu: pod.gpu,
      uptimeSeconds: pod.uptimeSeconds,
      balance,
      monthUsd,
      idleMinutes,
      autoSleep,
      lastUsedAt,
      notice,
    });
  } catch (e) {
    return NextResponse.json({ configured: true, state: "error", error: (e as Error).message.slice(0, 200), notice });
  }
}

/** Power and settings actions: start | stop | config. */
export async function POST(req: Request) {
  const session = await guard();
  if (session instanceof NextResponse) return session;
  const cfg = runpodConfig();
  if (!cfg) return NextResponse.json({ error: "Server controls aren't configured — set RUNPOD_API_KEY and RUNPOD_POD_ID." }, { status: 503 });

  let body: { action?: string; idleMinutes?: number; autoSleep?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  try {
    await ensureDiscoveryTables();
    if (body.action === "start") {
      const pod = await startPod(cfg);
      // A fresh wake gets a grace period — the idle reaper measures from now.
      await putAiSetting(AI_LAST_USED_KEY, new Date().toISOString());
      if (db) await db.insert(aiServerLog).values({ event: "start", costPerHr: pod.costPerHr, byEmail: session.email });
      return NextResponse.json({ ok: true, state: "starting" });
    }
    if (body.action === "stop") {
      const pod = await getPodStatus(cfg);
      await stopPod(cfg);
      if (db) await db.insert(aiServerLog).values({ event: "stop", costPerHr: pod.costPerHr, byEmail: session.email });
      return NextResponse.json({ ok: true, state: "stopped" });
    }
    if (body.action === "config") {
      if (typeof body.idleMinutes === "number" && Number.isFinite(body.idleMinutes)) {
        await putAiSetting(AI_IDLE_KEY, Math.min(30, Math.max(2, Math.round(body.idleMinutes))));
      }
      if (typeof body.autoSleep === "boolean") await putAiSetting(AI_AUTOSLEEP_KEY, body.autoSleep);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: `Server control failed: ${(e as Error).message.slice(0, 200)}` }, { status: 502 });
  }
}
