import "server-only";
import { eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { aiServerLog, settings } from "@/db/schema";

/**
 * Shared state for the AI server's wake/sleep concierge: the idle-timeout
 * settings, the last-used timestamp the reaper measures against, and the
 * month-to-date cost reconstruction behind the meter.
 */

export const AI_IDLE_KEY = "ai.idleMinutes";
export const AI_AUTOSLEEP_KEY = "ai.autoSleep";
export const AI_LAST_USED_KEY = "ai.lastUsedAt";
export const AI_IDLE_DEFAULT = 5;

export async function getAiSetting<T>(key: string, fallback: T): Promise<T> {
  if (!db) return fallback;
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, key));
    return row ? (row.value as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function putAiSetting(key: string, value: unknown) {
  if (!db) return;
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

/** Mark the AI server as in use right now (called on every Assistant chat). */
export async function touchAiLastUsed() {
  try {
    await putAiSetting(AI_LAST_USED_KEY, new Date().toISOString());
  } catch {
    /* best-effort */
  }
}

/** Estimated GPU spend this calendar month, reconstructed from the start/stop
 *  log (an open session counts up to now). An estimate — RunPod's own billing
 *  page stays the authority. */
export async function monthEstimate(runningCostPerHr: number | null): Promise<number> {
  if (!db) return 0;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  try {
    const rows = await db
      .select()
      .from(aiServerLog)
      .where(gte(aiServerLog.createdAt, monthStart))
      .orderBy(aiServerLog.createdAt);
    let usd = 0;
    let openAt: Date | null = null;
    let openRate = 0;
    for (const r of rows) {
      if (r.event === "start") {
        openAt = r.createdAt;
        openRate = r.costPerHr;
      } else if (openAt) {
        usd += ((r.createdAt.getTime() - openAt.getTime()) / 3600000) * (openRate || r.costPerHr);
        openAt = null;
      }
    }
    if (openAt && runningCostPerHr != null) {
      usd += ((Date.now() - openAt.getTime()) / 3600000) * (openRate || runningCostPerHr);
    }
    return Math.round(usd * 100) / 100;
  } catch {
    return 0;
  }
}
