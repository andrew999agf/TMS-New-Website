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
/** Chunks that "succeed" but move NOTHING (a model answering with unusable
 *  output) end the job too — otherwise it spins forever on a paid GPU. */
const MAX_STALLED_CHUNKS = Math.max(2, Number(process.env.LABEL_STALL_CHUNKS ?? "20"));
/** Nothing runs forever: a job gets at most this much wall-clock time… */
const MAX_JOB_AGE_MS = 8 * 3600 * 1000;
/** …and at most this long waiting for a server that won't come up. */
const MAX_WAIT_MS = 30 * 60 * 1000;
const RESUME_LINE = "Nothing is lost — press Read & label to pick up exactly where it left off.";

export type LabelJob = {
  setId: number;
  startedBy: string;
  startedAt: string;
  lastRunAt?: string;
  lockUntil?: number;
  consecutiveErrors?: number;
  /** Set while the job is stuck waiting for the AI server. */
  waitingSince?: string;
  /** Fingerprint of the last chunk's progress + how many chunks it froze. */
  progress?: string;
  stalled?: number;
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

/** The user's stop button: end the job NOW (the heartbeat stops waking the
 *  server for it), keep everything already written, say so in a notice. */
export async function stopLabelJob(setId: number, byEmail: string) {
  await clearLabelJob(setId);
  try {
    await setAiNotice(`Read & label stopped by ${byEmail}. Everything done so far is saved — press Read & label to resume any time.`, { chatBlocked: false, minutes: 10, kind: "review" });
  } catch { /* nicety */ }
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

  const giveUp = async (why: string) => {
    delete jobs[key];
    await saveJobs(jobs);
    try { await setAiNotice(`Read & label stopped: ${why} ${RESUME_LINE}`, { chatBlocked: false, minutes: 60, kind: "review" }); } catch { /* nicety */ }
    return { ran: false as const, note: "gave-up" as const };
  };

  if (Date.now() - new Date(job.startedAt).getTime() > MAX_JOB_AGE_MS) {
    return giveUp("it hit the 8-hour safety limit.");
  }
  if (job.lockUntil && job.lockUntil > Date.now()) return { ran: false, note: "locked" };

  // The model has to be up. The user's confirmation covered waking it, so
  // the background job may start a stopped server itself — but it will not
  // wait forever on a server that never comes up.
  if (!(await aiEndpointReady())) {
    if (job.waitingSince && Date.now() - new Date(job.waitingSince).getTime() > MAX_WAIT_MS) {
      return giveUp("the AI server didn't come up within 30 minutes.");
    }
    if (!job.waitingSince) {
      job.waitingSince = new Date().toISOString();
      await saveJobs(jobs);
    }
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
  if (job.waitingSince) { delete job.waitingSince; await saveJobs(jobs); }

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
          try { await setAiNotice(`Read & label stopped after repeated errors: ${result.error} ${RESUME_LINE}`, { chatBlocked: false, minutes: 60, kind: "review" }); } catch { /* nicety */ }
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
        const name = set?.name ?? `case #${setId}`;
        // A "finished" run where the model erred on documents and labeled
        // nothing new is a failure — say so instead of celebrating.
        if (result.errors > 0 && result.remaining > 0) {
          await setAiNotice(
            `Read & label stopped on "${name}" — ${result.labeled} of ${result.total} documents done, ${result.errors} hit model errors. Copy the System report at the bottom of AI.fred for the developer. ${RESUME_LINE}`,
            { chatBlocked: false, minutes: 60, kind: "review" },
          );
        } else {
          await setAiNotice(
            `AI.fred finished reading & labeling "${name}" — ${result.labeled} of ${result.total} documents done${result.needsVision ? ` (${result.needsVision} photo/scan left for later)` : ""}.`,
            { chatBlocked: false, minutes: 15, kind: "review" },
          );
        }
      } catch { /* nicety */ }
    } else if (cur) {
      cur.lockUntil = 0;
      cur.lastRunAt = new Date().toISOString();
      cur.consecutiveErrors = 0;
      // The stall watchdog: a chunk that reports success but moved no number
      // at all counts against the job. A model that answers with unusable
      // output otherwise loops on the same documents forever.
      const snapshot = `${result.total}|${result.remaining}|${result.pagesDone}|${result.pagesTotal}`;
      if (cur.progress === snapshot) {
        cur.stalled = (cur.stalled ?? 0) + 1;
        if (cur.stalled >= MAX_STALLED_CHUNKS) {
          delete fresh[key];
          await saveJobs(fresh);
          try {
            await setAiNotice(
              `Read & label stopped: ${MAX_STALLED_CHUNKS} rounds in a row made no progress — the AI is answering but not producing usable labels or notes. Copy the System report at the bottom of AI.fred for the developer. ${RESUME_LINE}`,
              { chatBlocked: false, minutes: 60, kind: "review" },
            );
          } catch { /* nicety */ }
          return { ran: false, note: "gave-up" };
        }
      } else {
        cur.progress = snapshot;
        cur.stalled = 0;
      }
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
