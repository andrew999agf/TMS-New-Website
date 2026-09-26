import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { runpodConfig, getPodStatus, getBalance, startPod, stopPod, aiServingModel } from "@/lib/ai/runpod";
import { AI_IDLE_KEY, AI_AUTOSLEEP_KEY, AI_LAST_USED_KEY, AI_IDLE_DEFAULT, getAiSetting, putAiSetting, monthEstimate } from "@/lib/ai/concierge";
import { getAiNotice, setAiNotice, clearAiNotice } from "@/lib/ai/notice";
import { visionEnv, getDesiredModel, setDesiredModel, activeModel } from "@/lib/ai/vision";
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
  let notice = await getAiNotice().catch(() => null);
  const active = await activeModel().catch(() => null);
  const vision = visionEnv();
  const modelInfo = {
    modelLabel: active?.label ?? null,
    desiredModel: active?.desired ?? "text",
    visionConfigured: !!vision,
    visionLabel: vision?.label ?? null,
  };
  if (!cfg) return NextResponse.json({ configured: false, notice, ...modelInfo });
  try {
    await ensureDiscoveryTables();
    const [pod, balance, serving, idleMinutes, autoSleep, lastUsedAt] = await Promise.all([
      getPodStatus(cfg),
      getBalance(cfg),
      aiServingModel(),
      getAiSetting<number>(AI_IDLE_KEY, AI_IDLE_DEFAULT),
      getAiSetting<boolean>(AI_AUTOSLEEP_KEY, true),
      getAiSetting<string | null>(AI_LAST_USED_KEY, null),
    ]);
    // A model swap self-completes here: once the endpoint is serving the
    // desired model, the swap notice comes down and chat reopens. The UI
    // polls this endpoint anyway, so no background job is needed.
    const swapDone = serving !== null && (serving === "" || !active || serving === active.model);
    if (notice?.kind === "swap" && swapDone) {
      await clearAiNotice().catch(() => {});
      notice = null;
    }
    const running = pod.desiredStatus === "RUNNING";
    const ready = serving !== null && swapDone;
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
      ...modelInfo,
    });
  } catch (e) {
    return NextResponse.json({ configured: true, state: "error", error: (e as Error).message.slice(0, 200), notice, ...modelInfo });
  }
}

/** Power and settings actions: start | stop | config. */
export async function POST(req: Request) {
  const session = await guard();
  if (session instanceof NextResponse) return session;
  const cfg = runpodConfig();
  if (!cfg) return NextResponse.json({ error: "Server controls aren't configured — set RUNPOD_API_KEY and RUNPOD_POD_ID." }, { status: 503 });

  let body: { action?: string; idleMinutes?: number; autoSleep?: boolean; target?: string };
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
    if (body.action === "swap") {
      // Flip the desired model and bounce the pod; its boot script asks
      // /api/ai/desired-model which one to load. The swap notice pauses chat
      // and self-clears (in GET above) once the right model is serving.
      const target = body.target === "vision" ? "vision" : "text";
      const vision = visionEnv();
      if (target === "vision" && !vision) {
        return NextResponse.json({ error: "No vision model is configured — set AI_MODEL_VISION." }, { status: 503 });
      }
      const already = await getDesiredModel();
      const pod = await getPodStatus(cfg);
      const running = pod.desiredStatus === "RUNNING";
      if (already === target && running) return NextResponse.json({ ok: true, state: "ready", desiredModel: target });
      await setDesiredModel(target);
      const label = target === "vision" ? vision!.label : (await activeModel())?.label ?? "text model";
      await setAiNotice(
        `Switching to ${label} — chat is paused while the server reloads (usually 3–5 minutes).`,
        { chatBlocked: true, minutes: 12, kind: "swap" },
      );
      // Swapping counts as use: don't let the idle reaper kill the pod mid-load.
      await putAiSetting(AI_LAST_USED_KEY, new Date().toISOString());
      try {
        if (running) {
          await stopPod(cfg);
          if (db) await db.insert(aiServerLog).values({ event: "stop", costPerHr: pod.costPerHr, byEmail: session.email });
        }
        const started = await startPod(cfg);
        if (db) await db.insert(aiServerLog).values({ event: "start", costPerHr: started.costPerHr, byEmail: session.email });
      } catch (e) {
        // Roll back so a failed restart doesn't leave chat blocked or the
        // desired model pointing at something that never loaded.
        await setDesiredModel(already).catch(() => {});
        await clearAiNotice().catch(() => {});
        throw e;
      }
      return NextResponse.json({ ok: true, state: "starting", desiredModel: target });
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
