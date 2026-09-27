"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, X } from "lucide-react";

/**
 * "Have AI.fred review this set": the confirm-then-sweep flow. Explicit
 * confirmation before any GPU is spent (firm rule), then chunked calls to
 * /api/admin/discovery/review until every document is labeled. If documents
 * need the vision model (photos, scanned PDFs), the dialog asks once and the
 * whole plan — swap to vision, label, swap back — runs on that single yes.
 */

type Srv = { configured: boolean; state?: string; desiredModel?: "text" | "vision"; visionConfigured?: boolean; visionLabel?: string | null };
type Chunk = { total: number; labeled: number; remaining: number; errors: number; needsVision: number; done: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getSrv(): Promise<Srv | null> {
  try {
    const r = await fetch("/api/admin/ai-server");
    return r.ok ? ((await r.json()) as Srv) : null;
  } catch {
    return null;
  }
}

async function post(url: string, body: unknown): Promise<{ ok: boolean; j: Record<string, unknown> }> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, j: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return { ok: false, j: {} };
  }
}

/** Wait until the AI endpoint is ready (server on + desired model serving). */
async function waitReady(maxTries = 90): Promise<boolean> {
  for (let i = 0; i < maxTries; i++) {
    const s = await getSrv();
    if (s?.state === "ready") return true;
    if (s?.state === "missing" || s?.state === "error") return false;
    await sleep(8000);
  }
  return false;
}

export function DiscoveryAiReview({ setId, docCount }: { setId: number; docCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [srv, setSrv] = useState<Srv | null>(null);
  const [phase, setPhase] = useState<"confirm" | "waking" | "sweeping" | "swapping" | "done" | "error">("confirm");
  const [progress, setProgress] = useState<Chunk | null>(null);
  const [note, setNote] = useState("");
  const running = phase === "waking" || phase === "sweeping" || phase === "swapping";

  async function openDialog() {
    setPhase("confirm");
    setProgress(null);
    setNote("");
    setOpen(true);
    setSrv(await getSrv());
  }

  async function sweepLoop(retryErrors = false): Promise<Chunk | null> {
    setPhase("sweeping");
    for (let i = 0; i < 400; i++) {
      const { ok, j } = await post("/api/admin/discovery/review", { setId, retryErrors: retryErrors && i === 0 });
      if (!ok) { setNote(String(j.error ?? "The review call failed.")); setPhase("error"); return null; }
      const c = j as unknown as Chunk;
      setProgress(c);
      router.refresh(); // labels appear as they land
      if (c.done) return c;
    }
    setNote("Stopped after an unusually long run — reopen to continue where it left off.");
    setPhase("error");
    return null;
  }

  async function swapTo(target: "vision" | "text"): Promise<boolean> {
    setPhase("swapping");
    setNote(target === "vision" ? "Switching to the vision model…" : "Switching back to the everyday text model…");
    const { ok, j } = await post("/api/admin/ai-server", { action: "swap", target });
    if (!ok) { setNote(String(j.error ?? "Couldn't switch models.")); setPhase("error"); return false; }
    const ready = await waitReady();
    if (!ready) { setNote("The server didn't come back up — check the power strip in AI.fred."); setPhase("error"); return false; }
    return true;
  }

  async function start() {
    const s = srv ?? (await getSrv());
    if (!s?.configured) { setNote("Server controls aren't configured (RUNPOD_API_KEY / RUNPOD_POD_ID)."); setPhase("error"); return; }

    // 1) Server on (wake if asleep — that's part of what was just confirmed).
    if (s.state !== "ready") {
      setPhase("waking");
      setNote("Waking the AI server…");
      if (s.state === "stopped") {
        const { ok, j } = await post("/api/admin/ai-server", { action: "start" });
        if (!ok) { setNote(String(j.error ?? "Couldn't start the server.")); setPhase("error"); return; }
      }
      const ready = await waitReady();
      if (!ready) { setNote("The server didn't come up — check the power strip in AI.fred."); setPhase("error"); return; }
    }

    // 2) First pass with whatever model is loaded (text documents label fine).
    let result = await sweepLoop(true); // also retries any errored docs from a previous run
    if (!result) return;
    let swapped = false;

    // 3) Photos/scans left over? One swap covers them all, then swap back.
    if (result.needsVision > 0) {
      const cur = await getSrv();
      if (!cur?.visionConfigured) {
        setNote(`${result.needsVision} photo/scan document(s) need the vision model, which isn't configured yet — the rest are labeled.`);
        setPhase("done");
        return;
      }
      if (!(await swapTo("vision"))) return;
      swapped = true;
      result = await sweepLoop();
      if (!result) return;
    }

    // 4) Leave the server the way daily work wants it.
    if (swapped) {
      if (!(await swapTo("text"))) return;
    }
    setNote(result.errors > 0 ? `${result.errors} document(s) hit errors — reopen this dialog to retry them.` : "");
    setPhase("done");
    router.refresh();
  }

  const est = Math.max(1, Math.round((docCount * 25) / 60));

  return (
    <>
      <button
        onClick={() => void openDialog()}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-3 py-1.5 text-sm hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]"
        title="AI.fred reads every document in this set and writes a label and description into the case record"
      >
        <Sparkles size={14} /> AI review
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !running && setOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-[var(--c-accent)]" />
              <span className="font-[family-name:var(--font-display)] text-base">AI review of this set</span>
              {!running && <button onClick={() => setOpen(false)} className="ml-auto rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={15} /></button>}
            </div>

            {phase === "confirm" && (
              <>
                <p className="mt-3 text-sm leading-relaxed text-[var(--c-ink-muted)]">
                  AI.fred will read all <strong className="text-[var(--c-ink)]">{docCount}</strong> document{docCount === 1 ? "" : "s"} and write a label + description for each into the case record — photos and scans included{srv?.visionConfigured ? " (it switches to the vision model for those and back when finished)" : ""}. This uses the paid AI server: roughly <strong className="text-[var(--c-ink)]">{est} minute{est === 1 ? "" : "s"}</strong> of GPU time
                  {srv?.state !== "ready" ? ", plus the usual wake-up" : ""}. Chat stays usable while it runs.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setOpen(false)} className="btn btn-outline px-4 py-1.5 text-sm">Cancel</button>
                  <button onClick={() => void start()} className="btn btn-accent px-4 py-1.5 text-sm">Yes, review the set</button>
                </div>
              </>
            )}

            {running && (
              <div className="mt-3 space-y-2">
                <p className="flex items-center gap-2 text-sm text-[var(--c-ink-muted)]">
                  <Loader2 size={14} className="animate-spin text-[var(--c-accent)]" />
                  {phase === "sweeping" && progress ? `Labeling… ${progress.labeled} of ${progress.total} documents` : note || "Working…"}
                </p>
                {progress && progress.total > 0 && (
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--c-bg)]">
                    <div className="h-full rounded-full bg-[var(--c-accent)] transition-all" style={{ width: `${Math.round((progress.labeled / progress.total) * 100)}%` }} />
                  </div>
                )}
                <p className="text-[11px] text-[var(--c-ink-muted)]">Leave this open — it runs the review in steps. Labels appear on the documents as they land.</p>
              </div>
            )}

            {phase === "done" && (
              <>
                <p className="mt-3 text-sm leading-relaxed text-[var(--c-ink)]">
                  Done — {progress ? `${progress.labeled} of ${progress.total}` : "all"} documents labeled.
                  {note && <span className="block pt-1 text-amber-700 dark:text-amber-300">{note}</span>}
                </p>
                <div className="mt-4 flex justify-end">
                  <button onClick={() => setOpen(false)} className="btn btn-accent px-4 py-1.5 text-sm">Close</button>
                </div>
              </>
            )}

            {phase === "error" && (
              <>
                <p className="mt-3 text-sm leading-relaxed text-red-600">{note || "Something went wrong."}</p>
                <p className="mt-1 text-xs text-[var(--c-ink-muted)]">Progress is saved — reopening the dialog continues where it left off.</p>
                <div className="mt-4 flex justify-end">
                  <button onClick={() => setOpen(false)} className="btn btn-outline px-4 py-1.5 text-sm">Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
