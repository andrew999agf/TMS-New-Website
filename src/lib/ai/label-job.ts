import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { discoverySets } from "@/db/schema";
import { getAiSetting, putAiSetting } from "@/lib/ai/concierge";
import { resolvedRunpodConfig, getPodStatus, startPod, aiEndpointReady } from "@/lib/ai/runpod";
import { setAiNotice } from "@/lib/ai/notice";
import { reviewDiscoveryChunk, type SweepResult } from "@/lib/ai/discovery-review";

/**
 * Background Read & label jobs. The user confirms ONCE (the button — GPU
 * spend is never automatic); after that the job belongs to the SERVER: a
 * per-minute cron advances it chunk by chunk whether or not anyone has the
 * page open, and the dialog — when it is open — nudges it along faster.
 * A short lock keeps cron and dialog from double-running a chunk. Progress
 * lives on the document rows, so nothing is ever lost or repeated.
 */

const JOBS_KEY = "ai.labelJobs";
const LOCK_MS = 90_000;
const MAX_CONSECUTIVE_ERRORS = 30;
const MAX_JOB_AGE_MS = 24 * 3600 * 1000;

export type LabelJob = {
  setId: number;
  startedBy: string;
  startedAt: string;
  lastRunAt?: string;
  lockUntil?: number;
  consecutiveErrors?: number;
};

type JobMap = Record<string, LabelJob>;

export async function getLabelJobs(): Promise<JobMap> {
  return getAiSetting<JobMap>(JOBS_KEY, {});
}

export async function getLabelJob(setId: number): Promise<LabelJob | null> {
  return (await getLabelJobs())[String(setId)] ?? null;
}

async function saveJobs(jobs: JobMap) {
  await putAiSetting(JOBS_KEY, jobs);
}

/** Register (or refresh) the background job for a case. */
export async function startLabelJob(setId: number, email: string) {
  const jobs = await getLabelJobs();
  jobs[String(setId)] = { setId, startedBy: email, startedAt: new Date().toISOString(), consecutiveErrors: 0 };
  await saveJobs(jobs);
}

export async function clearLabelJob(setId: number) {
  const jobs = await getLabelJobs();
  delete jobs[String(setId)];
  await saveJobs(jobs);
}

export type JobChunkOutcome =
  | { ran: true; result: SweepResult; done: boolean }
  | { ran: false; note: "locked" | "waiting-for-server" | "waking-server" | "no-job" | "gave-up" };

/**
 * Advance one case's job by one chunk, if nothing else is mid-chunk and the
 * AI endpoint is up. Cron and the open dialog both call this; the lock makes
 * them take turns instead of doubling the work.
 */
export async function runLabelJobChunk(setId: number, opts: { wakeServer?: boolean; retryErrors?: boolean } = {}): Promise<JobChunkOutcome> {
  const jobs = await getLabelJobs();
  const key = String(setId);
  const job = jobs[key];
  if (!job) return { ran: false, note: "no-job" };

  if (Date.now() - new Date(job.startedAt).getTime() > MAX_JOB_AGE_MS) {
    delete jobs[key];
    await saveJobs(jobs);
    return { ran: false, note: "gave-up" };
  }
  if (job.lockUntil && job.lockUntil > Date.now()) return { ran: false, note: "locked" };

  // The model has to be up. The user's confirmation covered waking it, so
  // the background job may start a stopped server itself.
  if (!(await aiEndpointReady())) {
    if (opts.wakeServer) {
      const cfg = await resolvedRunpodConfig();
      if (cfg) {
        try {
          const pod = await getPodStatus(cfg);
          if (pod.exists && pod.desiredStatus === "EXITED") {
            await startPod(cfg);
            return { ran: false, note: "waking-server" };
          }
        } catch { /* next tick retries */ }
      }
    }
    return { ran: false, note: "waiting-for-server" };
  }

  job.lockUntil = Date.now() + LOCK_MS;
  await saveJobs(jobs);
  try {
    const result = await reviewDiscoveryChunk(setId, { retryErrors: !!opts.retryErrors });
    const fresh = await getLabelJobs(); // re-read: another writer may have run
    const cur = fresh[key];
    if ("error" in result) {
      if (cur) {
        cur.consecutiveErrors = (cur.consecutiveErrors ?? 0) + 1;
        cur.lockUntil = 0;
        cur.lastRunAt = new Date().toISOString();
        if (cur.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          delete fresh[key];
          try { await setAiNotice(`Read & label stopped: ${result.error}`, { chatBlocked: false, minutes: 30, kind: "review" }); } catch { /* nicety */ }
        }
        await saveJobs(fresh);
      }
      return { ran: false, note: cur && (cur.consecutiveErrors ?? 0) >= MAX_CONSECUTIVE_ERRORS ? "gave-up" : "locked" };
    }
    if (result.done) {
      delete fresh[key];
      await saveJobs(fresh);
      try {
        const [set] = db ? await db.select({ name: discoverySets.name }).from(discoverySets).where(eq(discoverySets.id, setId)) : [];
        await setAiNotice(
          `AI.fred finished reading & labeling "${set?.name ?? `case #${setId}`}" — ${result.labeled} of ${result.total} documents done${result.needsVision ? ` (${result.needsVision} photo/scan left for later)` : ""}.`,
          { chatBlocked: false, minutes: 15, kind: "review" },
        );
      } catch { /* nicety */ }
    } else if (cur) {
      cur.lockUntil = 0;
      cur.lastRunAt = new Date().toISOString();
      cur.consecutiveErrors = 0;
      await saveJobs(fresh);
    }
    return { ran: true, result, done: result.done };
  } catch (e) {
    const fresh = await getLabelJobs();
    if (fresh[key]) { fresh[key].lockUntil = 0; fresh[key].consecutiveErrors = (fresh[key].consecutiveErrors ?? 0) + 1; await saveJobs(fresh); }
    console.error(`[label-job] chunk for set ${setId} failed:`, e);
    return { ran: false, note: "locked" };
  }
}
