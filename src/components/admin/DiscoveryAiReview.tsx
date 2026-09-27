"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, ScanText, X } from "lucide-react";

/**
 * "Read & label": ONE button for the whole pipeline. It (1) pulls the text
 * out of every document in the case — streamed page by page, any size —
 * then (2) has the TEXT model write each document's label + notes and a
 * note for every readable page. Photos and scans with no text layer are
 * left alone (no vision run, no model switching — that gap gets filled
 * later). Explicit confirmation before any GPU is spent, per firm rule.
 *
 * Every indexing failure is listed BY NAME WITH ITS REASON, with a
 * copyable report — "couldn't be indexed" is never a dead end again.
 */

type Srv = { configured: boolean; state?: string };
type FailedDoc = { kind: string; id: number; name: string; sizeBytes: number | null; reason: string };
type IndexChunk = { total: number; indexed: number; remaining: number; failed: number; done: boolean; current?: string; failedDocs: FailedDoc[]; error?: string };
type LabelChunk = { total: number; labeled: number; remaining: number; errors: number; needsVision: number; done: boolean; stage?: string; error?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post<T>(url: string, body: unknown): Promise<{ ok: boolean; j: T }> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, j: (await r.json().catch(() => ({}))) as T };
  } catch {
    return { ok: false, j: {} as T };
  }
}

async function getSrv(): Promise<Srv | null> {
  try {
    const r = await fetch("/api/admin/ai-server");
    return r.ok ? ((await r.json()) as Srv) : null;
  } catch {
    return null;
  }
}

/** Wait until the AI endpoint answers (server on + model loaded). */
async function waitReady(maxTries = 90): Promise<boolean> {
  for (let i = 0; i < maxTries; i++) {
    const s = await getSrv();
    if (s?.state === "ready") return true;
    if (s?.state === "missing" || s?.state === "error") return false;
    await sleep(8000);
  }
  return false;
}

export function IndexAndLabel({ setId, docCount }: { setId: number; docCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"confirm" | "waking" | "indexing" | "labeling" | "done" | "error">("confirm");
  const [line, setLine] = useState("");
  const [pct, setPct] = useState<number | null>(null);
  const [failedDocs, setFailedDocs] = useState<FailedDoc[]>([]);
  const [leftForLater, setLeftForLater] = useState(0);
  const [labelErrors, setLabelErrors] = useState(0);
  const [copied, setCopied] = useState(false);
  const running = phase === "waking" || phase === "indexing" || phase === "labeling";

  async function start() {
    // Phase 0: server up (indexing is free, but labeling needs the model).
    const s = await getSrv();
    if (!s?.configured) { setLine("Server controls aren't configured (RUNPOD_API_KEY / RUNPOD_POD_ID)."); setPhase("error"); return; }
    if (s.state !== "ready") {
      setPhase("waking");
      setLine("Waking the AI server…");
      if (s.state === "stopped") {
        const { ok, j } = await post<{ error?: string }>("/api/admin/ai-server", { action: "start" });
        if (!ok) { setLine(j.error ?? "Couldn't start the server."); setPhase("error"); return; }
      }
      if (!(await waitReady())) { setLine("The server didn't come up — check the power strip in AI.fred."); setPhase("error"); return; }
    }

    // Phase 1: read every document's text (streamed, resumable, free).
    setPhase("indexing");
    setPct(null);
    let fails: FailedDoc[] = [];
    for (let i = 0; i < 300; i++) {
      const { ok, j } = await post<IndexChunk>("/api/admin/discovery/index-text", { setId, retryFailed: i === 0 });
      if (!ok) { setLine(j.error ?? "Text reading failed."); setPhase("error"); return; }
      setLine(`Reading text… ${j.indexed} of ${j.total} documents${j.current ? ` — ${j.current}` : ""}`);
      setPct(j.total ? Math.round((j.indexed / j.total) * 100) : null);
      fails = j.failedDocs ?? [];
      if (j.done) break;
    }
    setFailedDocs(fails);

    // Phase 2: label + page notes from text. No vision, no model switching.
    setPhase("labeling");
    setPct(null);
    let last: LabelChunk | null = null;
    for (let i = 0; i < 600; i++) {
      const { ok, j } = await post<LabelChunk>("/api/admin/discovery/review", { setId, retryErrors: i === 0 });
      if (!ok) { setLine(j.error ?? "Labeling failed."); setPhase("error"); return; }
      last = j;
      setLine(j.stage ?? `Labeling… ${j.labeled} of ${j.total} documents`);
      setPct(j.total ? Math.round((j.labeled / j.total) * 100) : null);
      router.refresh(); // labels and page notes appear as they land
      if (j.done) break;
    }
    setLeftForLater(last?.needsVision ?? 0);
    setLabelErrors(last?.errors ?? 0);
    setPhase("done");
    router.refresh();
  }

  const report = () =>
    [
      `INDEXING REPORT — case #${setId} — ${new Date().toISOString()}`,
      ...failedDocs.map((f) => `FAILED ${f.kind}:${f.id} "${f.name}"${f.sizeBytes ? ` (${Math.round(f.sizeBytes / 1048576)} MB)` : ""} — ${f.reason}`),
    ].join("\n");

  const est = Math.max(1, Math.round((docCount * 20) / 60));

  return (
    <>
      <button onClick={() => { setPhase("confirm"); setLine(""); setFailedDocs([]); setOpen(true); }}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-3 py-1.5 text-sm hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]"
        title="AI.fred reads every document's text and writes a label, notes, and a note for every readable page — its permanent memory of this case">
        <ScanText size={14} /> Read &amp; label
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !running && setOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <ScanText size={16} className="text-[var(--c-accent)]" />
              <span className="font-[family-name:var(--font-display)] text-base">Read &amp; label this case&apos;s documents</span>
              {!running && <button onClick={() => setOpen(false)} className="ml-auto rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={15} /></button>}
            </div>

            {phase === "confirm" && (
              <>
                <p className="mt-3 text-sm leading-relaxed text-[var(--c-ink-muted)]">
                  AI.fred pulls the text out of every document across all three tabs (any size — read page by page), then writes a <strong className="text-[var(--c-ink)]">label and notes for each document and a short note for every readable page</strong>. These become its standing memory of the case: it answers questions from them without re-reading the documents, and they follow each document from red to yellow to green. Photos and scans with no readable text are <strong className="text-[var(--c-ink)]">left alone for later</strong> — no model switching. Uses the paid AI server (wakes it if asleep): roughly <strong className="text-[var(--c-ink)]">{est} minute{est === 1 ? "" : "s"}</strong> of GPU time for the labeling. Everything is editable afterward, and none of it ever appears on a shared link or to opposing counsel.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setOpen(false)} className="btn btn-outline px-4 py-1.5 text-sm">Cancel</button>
                  <button onClick={() => void start()} className="btn btn-accent px-4 py-1.5 text-sm">Yes, read &amp; label</button>
                </div>
              </>
            )}

            {running && (
              <div className="mt-3 space-y-2">
                <p className="flex items-center gap-2 text-sm text-[var(--c-ink-muted)]">
                  <Loader2 size={14} className="animate-spin text-[var(--c-accent)]" /> {line || "Working…"}
                </p>
                {pct != null && (
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--c-bg)]">
                    <div className="h-full rounded-full bg-[var(--c-accent)] transition-all" style={{ width: `${pct}%` }} />
                  </div>
                )}
                <p className="text-[11px] text-[var(--c-ink-muted)]">Leave this open — it works in resumable steps, so nothing is lost if it stops. Labels and page notes appear as they land.</p>
              </div>
            )}

            {phase === "done" && (
              <>
                <p className="mt-3 text-sm leading-relaxed text-[var(--c-ink)]">
                  Done. {leftForLater > 0 && <span className="block pt-1 text-[var(--c-ink-muted)]">{leftForLater} photo/scan document{leftForLater === 1 ? "" : "s"} had no readable text — left for later, as planned.</span>}
                  {labelErrors > 0 && <span className="block pt-1 text-amber-700 dark:text-amber-300">{labelErrors} document{labelErrors === 1 ? "" : "s"} hit model errors — run this again to retry them.</span>}
                </p>
                {failedDocs.length > 0 && (
                  <div className="mt-3 rounded-md border border-red-300/60 bg-red-500/5 p-3">
                    <p className="text-xs font-semibold text-red-700 dark:text-red-300">Couldn&apos;t read {failedDocs.length} document{failedDocs.length === 1 ? "" : "s"}:</p>
                    <ul className="mt-1 space-y-1 text-xs text-[var(--c-ink-muted)]">
                      {failedDocs.map((f) => <li key={`${f.kind}:${f.id}`}><strong className="text-[var(--c-ink)]">{f.name}</strong> — {f.reason}</li>)}
                    </ul>
                    <button onClick={async () => { try { await navigator.clipboard.writeText(report()); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* no clipboard */ } }}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1 text-xs hover:border-[var(--c-accent)]">
                      <Copy size={12} /> {copied ? "Copied!" : "Copy report for the developer"}
                    </button>
                  </div>
                )}
                <div className="mt-4 flex justify-end">
                  <button onClick={() => setOpen(false)} className="btn btn-accent px-4 py-1.5 text-sm">Close</button>
                </div>
              </>
            )}

            {phase === "error" && (
              <>
                <p className="mt-3 text-sm leading-relaxed text-red-600">{line || "Something went wrong."}</p>
                <p className="mt-1 text-xs text-[var(--c-ink-muted)]">Progress is saved — running it again continues where it left off.</p>
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
