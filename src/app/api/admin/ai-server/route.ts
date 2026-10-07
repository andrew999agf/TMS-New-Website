import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { resolvedRunpodConfig, getPodStatus, getBalance, startPod, stopPod, aiServingModel, relocatePod, isNoGpuError, isNoFundsError, rememberBlueprint, findLostPods, adoptPod, rebuildSource, rebuildPod } from "@/lib/ai/runpod";
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
  const cfg = await resolvedRunpodConfig();
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
      getAiSetting<boolean>(AI_AUTOSLEEP_KEY, false), // default: on until turned off
      getAiSetting<string | null>(AI_LAST_USED_KEY, null),
    ]);
    // A model swap self-completes here: once the endpoint is serving the
    // desired model, the swap notice comes down and chat reopens. The UI
    // polls this endpoint anyway, so no background job is needed.
    const swapDone = serving !== null && (serving === "" || !active || serving === active.model);
    if ((notice?.kind === "swap" || notice?.kind === "relocate") && swapDone) {
      await clearAiNotice().catch(() => {});
      notice = null;
    }
    const running = pod.desiredStatus === "RUNNING";
    const ready = serving !== null && swapDone;
    const state = !pod.exists ? "missing" : running ? (ready ? "ready" : "starting") : "stopped";
    const monthUsd = await monthEstimate(running ? pod.costPerHr : null);
    // Keep the rebuild blueprint current while the pod exists; when it's
    // gone (RunPod removes pods once an account runs dry), say what can be
    // done about it: adopt a pod still on the account, or rebuild one.
    let lost: { candidates: Awaited<ReturnType<typeof findLostPods>>; rebuild: string | null } | undefined;
    if (pod.exists) await rememberBlueprint(cfg, pod.spec);
    else {
      const [candidates, src] = await Promise.all([findLostPods(cfg).catch(() => []), rebuildSource(cfg).catch(() => null)]);
      lost = { candidates, rebuild: src?.label ?? null };
    }
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
      ...(lost ? { lost } : {}),
      ...modelInfo,
    });
  } catch (e) {
    const msg = (e as Error).message;
    const error = isNoFundsError(msg) ? `RunPod says the account can't be billed right now (${msg.slice(0, 120).replace(/\.+$/, "")}). Check the credit balance on runpod.io.` : msg.slice(0, 200);
    return NextResponse.json({ configured: true, state: "error", error, notice, ...modelInfo });
  }
}

/** Power and settings actions: start | stop | config. */
export async function POST(req: Request) {
  const session = await guard();
  if (session instanceof NextResponse) return session;
  const cfg = await resolvedRunpodConfig();
  if (!cfg) return NextResponse.json({ error: "Server controls aren't configured — set RUNPOD_API_KEY and RUNPOD_POD_ID." }, { status: 503 });

  let body: { action?: string; idleMinutes?: number; autoSleep?: boolean; target?: string; podId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  try {
    await ensureDiscoveryTables();
    if (body.action === "start") {
      let pod;
      let relocated = false;
      try {
        pod = await startPod(cfg);
      } catch (e) {
        const msg = (e as Error).message;
        if (isNoFundsError(msg)) {
          return NextResponse.json({ error: `RunPod wouldn't start the server: ${msg.slice(0, 160).replace(/\.+$/, "")}. Add credit at runpod.io, wait a minute, then press Turn on again.` }, { status: 402 });
        }
        // The stuck-host case: the pod's machine rented out its GPU while we
        // slept. Self-heal by recreating the pod on a machine with a free
        // card (same building, same storage volume) instead of failing.
        if (!isNoGpuError(msg)) throw e;
        const newId = await relocatePod(cfg);
        relocated = true;
        pod = await getPodStatus({ ...cfg, podId: newId });
        await setAiNotice("The AI server's old machine was full, so it moved to a fresh one — starting up now.", { chatBlocked: false, minutes: 15, kind: "relocate" });
      }
      // A fresh wake gets a grace period — the idle reaper measures from now.
      await putAiSetting(AI_LAST_USED_KEY, new Date().toISOString());
      if (db) await db.insert(aiServerLog).values({ event: "start", costPerHr: pod.costPerHr, byEmail: session.email });
      return NextResponse.json({ ok: true, state: "starting", ...(relocated ? { relocated: true } : {}) });
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
        let started;
        try {
          started = await startPod(cfg);
        } catch (e) {
          if (!isNoGpuError((e as Error).message)) throw e;
          const newId = await relocatePod(cfg); // the replacement boots straight into the desired model
          started = await getPodStatus({ ...cfg, podId: newId });
        }
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
    if (body.action === "adopt") {
      // Free: point the controls at a pod that's still on the account.
      const id = String(body.podId ?? "").trim();
      if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) return NextResponse.json({ error: "Pick a server to use." }, { status: 400 });
      const candidates = await findLostPods(cfg);
      if (!candidates.some((c) => c.id === id)) return NextResponse.json({ error: "That server isn't on the RunPod account." }, { status: 400 });
      await adoptPod(id);
      const pod = await getPodStatus({ ...cfg, podId: id });
      await rememberBlueprint({ ...cfg, podId: id }, pod.spec);
      return NextResponse.json({ ok: true, state: pod.desiredStatus === "RUNNING" ? "starting" : "stopped" });
    }
    if (body.action === "rebuild") {
      // Paid: a new pod on the firm's storage volume. The UI asks first.
      const { id, source } = await rebuildPod(cfg);
      const pod = await getPodStatus({ ...cfg, podId: id });
      await putAiSetting(AI_LAST_USED_KEY, new Date().toISOString());
      if (db) await db.insert(aiServerLog).values({ event: "start", costPerHr: pod.costPerHr, byEmail: session.email });
      await setAiNotice(`The AI server was rebuilt from the ${source} — starting up now (first boot can take 5–10 minutes).`, { chatBlocked: false, minutes: 15, kind: "relocate" });
      return NextResponse.json({ ok: true, state: "starting", podId: id });
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
    const msg = (e as Error).message;
    if (isNoFundsError(msg)) return NextResponse.json({ error: `RunPod can't bill the account right now: ${msg.slice(0, 160).replace(/\.+$/, "")}. Check the credit balance on runpod.io.` }, { status: 402 });
    return NextResponse.json({ error: `Server control failed: ${msg.slice(0, 200)}` }, { status: 502 });
  }
}
