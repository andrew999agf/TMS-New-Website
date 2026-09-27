import { NextResponse } from "next/server";
import { gte, eq, and, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { runpodConfig, resolvedRunpodConfig, getPodStatus, getBalance, resolvedAiBaseUrl } from "@/lib/ai/runpod";
import { AI_IDLE_KEY, AI_AUTOSLEEP_KEY, AI_LAST_USED_KEY, AI_IDLE_DEFAULT, getAiSetting, monthEstimate } from "@/lib/ai/concierge";
import { getAiNotice } from "@/lib/ai/notice";
import { aiConfig } from "@/lib/ai/config";
import { visionEnv, getDesiredModel } from "@/lib/ai/vision";
import { db } from "@/db";
import { aiServerLog, assistantMessages } from "@/db/schema";
import { ensureDiscoveryTables } from "@/db/ensure";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The System Report: everything needed to diagnose "the AI won't come up"
 * in one copyable block — configuration as the server actually sees it,
 * live probes with RAW error text (never paraphrased), and the last 24
 * hours of server events. Built precisely so a screenshot or copy-paste
 * of this panel replaces a whole back-and-forth of questions.
 */
export async function GET() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/assistant", session.role, session.permissions)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  await ensureDiscoveryTables().catch(() => {});
  const lines: string[] = [];
  const push = (s: string) => lines.push(s);
  const now = new Date();
  push(`AI.FRED SYSTEM REPORT — ${now.toISOString()} (last 24h)`);
  push(`Code version: ${process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local"} · env: ${process.env.VERCEL_ENV ?? "dev"}`);
  push("");

  // ---- Configuration as the server sees it (no secrets) ----
  push("== CONFIGURATION ==");
  const cfg = aiConfig();
  const vision = visionEnv();
  const envPod = process.env.RUNPOD_POD_ID?.trim() || "(not set)";
  push(`AI_BASE_URL: ${process.env.AI_BASE_URL?.trim() || "(not set)"}`);
  push(`AI_MODEL: ${cfg?.model ?? "(not set)"} · label: ${cfg?.label ?? "-"}`);
  push(`AI_MODEL_VISION: ${vision ? `${vision.model} · label: ${vision.label}` : "(not set — vision off)"}`);
  push(`RUNPOD_API_KEY: ${process.env.RUNPOD_API_KEY ? "set" : "(not set)"}`);
  push(`RUNPOD_POD_ID (env): ${envPod}`);
  const override = await getAiSetting<{ podId?: string; replacedEnvPodId?: string } | null>("ai.podOverride", null);
  if (override?.podId) push(`Pod override (from auto-relocation): ${override.podId} — replaced ${override.replacedEnvPodId}; ${override.replacedEnvPodId === envPod ? "ACTIVE" : "ignored (env pod id changed by hand)"}`);
  const rcfg = await resolvedRunpodConfig();
  push(`Effective pod id: ${rcfg?.podId ?? "(none — controls off)"}`);
  const effBase = await resolvedAiBaseUrl();
  if (effBase && effBase !== (process.env.AI_BASE_URL?.trim()?.replace(/\/+$/, "") ?? "")) {
    push(`Effective AI endpoint (auto-follows relocation): ${effBase}`);
  }
  const baseHost = (() => { try { return new URL(effBase ?? "").host; } catch { return ""; } })();
  if (rcfg && baseHost && !baseHost.startsWith(`${rcfg.podId}-`)) {
    push(`!! MISMATCH: AI_BASE_URL points at "${baseHost}" but the pod id is "${rcfg.podId}" — chat and the power strip are talking to different servers.`);
  }
  push("");

  // ---- Settings ----
  push("== SETTINGS ==");
  const [desired, autoSleep, idleMin, lastUsed, notice] = await Promise.all([
    getDesiredModel(),
    getAiSetting<boolean>(AI_AUTOSLEEP_KEY, false),
    getAiSetting<number>(AI_IDLE_KEY, AI_IDLE_DEFAULT),
    getAiSetting<string | null>(AI_LAST_USED_KEY, null),
    getAiNotice().catch(() => null),
  ]);
  push(`Desired model: ${desired}`);
  push(`Auto-sleep: ${autoSleep ? `after ${idleMin} min idle` : "off (stays on until turned off)"}`);
  push(`Last marked in use: ${lastUsed ?? "(never)"}`);
  push(`Active notice: ${notice ? `[${notice.kind ?? "general"}] "${notice.message}" chatBlocked=${notice.chatBlocked} until=${notice.until}` : "(none)"}`);
  push("");

  // ---- Live probes, raw errors included ----
  push("== LIVE CHECKS (just now) ==");
  if (!rcfg) {
    push("RunPod controls: NOT CONFIGURED (need RUNPOD_API_KEY + RUNPOD_POD_ID)");
  } else {
    try {
      const pod = await getPodStatus(rcfg);
      push(pod.exists
        ? `Pod lookup: FOUND — status=${pod.desiredStatus} gpu="${pod.gpu}" uptime=${Math.round(pod.uptimeSeconds / 60)}min cost=$${pod.costPerHr}/hr`
        : `Pod lookup: NOT FOUND for id "${rcfg.podId}" — the id doesn't match any pod on this RunPod account (check for lookalike characters: 1 vs l, 0 vs o).`);
    } catch (e) {
      push(`Pod lookup: ERROR — ${(e as Error).message.slice(0, 300)}`);
    }
    const bal = await getBalance(rcfg);
    push(`RunPod balance: ${bal == null ? "unavailable" : `$${bal.toFixed(2)}`} ${bal != null ? "(API key works)" : ""}`);
  }
  if (cfg) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${effBase ?? cfg.baseUrl}/models`, { headers: { Authorization: `Bearer ${cfg.apiKey}` }, signal: AbortSignal.timeout(8000) });
      const ms = Date.now() - t0;
      if (res.ok) {
        const j = (await res.json().catch(() => null)) as { data?: { id?: string }[] } | null;
        push(`AI endpoint (${baseHost}): UP in ${ms}ms — serving model: ${j?.data?.[0]?.id ?? "(unknown)"}`);
      } else {
        push(`AI endpoint (${baseHost}): HTTP ${res.status} in ${ms}ms — ${(await res.text().catch(() => "")).slice(0, 200)}`);
      }
    } catch (e) {
      push(`AI endpoint (${baseHost}): UNREACHABLE after ${Date.now() - t0}ms — ${(e as Error).message.slice(0, 200)}`);
    }
  } else {
    push("AI endpoint: NOT CONFIGURED (AI_BASE_URL / AI_API_KEY / AI_MODEL)");
  }
  push("");

  // ---- 24-hour history ----
  push("== LAST 24 HOURS ==");
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  if (db) {
    try {
      const events = await db.select().from(aiServerLog).where(gte(aiServerLog.createdAt, since)).orderBy(aiServerLog.createdAt).limit(200);
      push(`Server events (${events.length}):`);
      for (const e of events) push(`  ${e.createdAt.toISOString()} ${e.event.toUpperCase().padEnd(8)} $${e.costPerHr}/hr by ${e.byEmail ?? "?"}`);
      if (!events.length) push("  (none — the site neither started nor stopped the server in this window)");
      const [msgs] = await db.select({ n: sql<number>`count(*)` }).from(assistantMessages).where(and(gte(assistantMessages.createdAt, since), eq(assistantMessages.role, "user")));
      push(`Chat messages sent: ${msgs?.n ?? 0}`);
      push(`Estimated GPU spend this month: $${(await monthEstimate(null)).toFixed(2)}`);
    } catch (e) {
      push(`History unavailable: ${(e as Error).message.slice(0, 150)}`);
    }
  } else {
    push("History unavailable: database not configured.");
  }
  push("");
  push("Legend: this report never contains API keys. Safe to screenshot or paste to your assistant/developer.");

  const cfgEnv = runpodConfig();
  return NextResponse.json({ text: lines.join("\n"), generatedAt: now.toISOString(), configured: !!cfgEnv });
}
