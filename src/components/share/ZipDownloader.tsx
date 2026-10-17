"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Download, Loader2, X } from "lucide-react";
import { downloadZip, zipDiagState, DIALOG_CLOSED, type ZipInput, type ZipProgress } from "@/lib/share/zip-client";
import { diagBrowserText, diagHook, diagRegister } from "@/lib/client-diag";

type Start = { files: ZipInput[]; zipName: string; /** Fire-and-forget: tell the server a bulk download started (for the firm's log). */ log?: () => void };

const fmt = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * One hook per page: `start()` from any button; `panel` shows the progress
 * card (file-by-file, resumable, a plain Cancel). A finished archive is
 * complete by construction — the card says so, or says what went wrong.
 */
export function useZipDownloader() {
  const [state, setState] = useState<{ p: ZipProgress | null; error: string | null; done: { files: number; archives: number; bytes: number } | null; busy: boolean; zipName: string; closed?: boolean } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastRef = useRef<Start | null>(null);
  const [copied, setCopied] = useState(false);
  // What this page's downloads did, for the Diagnostics report / Copy details.
  useEffect(() => { diagHook(); return diagRegister("zip downloads", zipDiagState); }, []);

  const start = useCallback(async (s: Start) => {
    if (!s.files.length) return;
    lastRef.current = s;
    const ac = new AbortController();
    abortRef.current = ac;
    setState({ p: null, error: null, done: null, busy: true, zipName: s.zipName });
    try { s.log?.(); } catch { /* logging is best-effort */ }
    // Keep the screen awake for the duration (a sleeping laptop drops transfers).
    type WakeLock = { release: () => Promise<void> };
    let lock: WakeLock | null = null;
    try { lock = (await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } }).wakeLock?.request("screen")) ?? null; } catch { lock = null; }
    try {
      const r = await downloadZip({ files: s.files, zipName: s.zipName, signal: ac.signal, onProgress: (p) => setState((st) => (st ? { ...st, p } : st)) });
      setState({ p: null, error: null, done: r, busy: false, zipName: s.zipName });
    } catch (err) {
      const m = String((err as Error)?.message ?? err);
      if (m === "cancelled" || ac.signal.aborted) { setState(null); return; }
      if (m === DIALOG_CLOSED) { setState({ p: null, error: null, done: null, busy: false, zipName: s.zipName, closed: true }); return; }
      setState({ p: null, error: m, done: null, busy: false, zipName: s.zipName });
    } finally {
      try { await lock?.release(); } catch { /* ignore */ }
    }
  }, []);

  const cancel = () => { abortRef.current?.abort(); };
  const retry = () => { if (lastRef.current) void start(lastRef.current); };
  const copyDetails = async () => {
    const text = `ZIP DOWNLOAD — couldn't finish\n${diagBrowserText("THIS BROWSER")}`;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { window.prompt("Copy these details:", text); }
  };

  const panel = state ? (
    <div className="fixed bottom-4 right-4 z-[90] w-[min(94vw,420px)] rounded-lg border border-[var(--c-accent)] bg-[var(--c-surface)] p-4 text-sm shadow-2xl" role="status" aria-live="polite" data-testid="zip-panel">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{state.zipName}</p>
          {state.busy && state.p && (
            <>
              <p className="mt-1 text-xs text-[var(--c-ink-muted)]">
                {state.p.phase === "finishing" ? "Finishing the archive…" : <>File {state.p.fileIndex + 1} of {state.p.fileCount}{state.p.archives > 1 ? ` · archive ${state.p.archive} of ${state.p.archives}` : ""} · {fmt(state.p.bytesDone)}{state.p.bytesTotal ? ` of ${fmt(state.p.bytesTotal)}` : ""}</>}
              </p>
              {state.p.fileName && <p className="truncate text-xs text-[var(--c-ink-muted)]" title={state.p.fileName}>{state.p.fileName}</p>}
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--c-border)]"><div className="h-full rounded-full bg-[var(--c-accent)] transition-[width] duration-300" style={{ width: `${state.p.bytesTotal ? Math.min(100, Math.round((state.p.bytesDone / state.p.bytesTotal) * 100)) : 10}%` }} /></div>
              <p className="mt-1 text-[11px] text-[var(--c-ink-muted)]">Keep this page open. If a transfer hiccups it picks up where it left off; the ZIP is only saved once every file is complete.</p>
            </>
          )}
          {state.busy && !state.p && <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--c-ink-muted)]"><Loader2 size={12} className="animate-spin" /> Starting… (your browser may ask where to save)</p>}
          {state.done && (
            <p className="mt-1 flex items-start gap-1.5 text-xs text-emerald-700 dark:text-emerald-300"><Check size={14} className="mt-0.5 shrink-0" /> Saved — {state.done.files} file{state.done.files === 1 ? "" : "s"}, {fmt(state.done.bytes)}{state.done.archives > 1 ? `, in ${state.done.archives} archives` : ""}. Every file was received in full.</p>
          )}
          {state.closed && (
            <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">The save dialog was closed before anything downloaded. <button onClick={retry} className="underline">Click here</button> to try again and choose where to save.</p>
          )}
          {state.error && (
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">Couldn&apos;t finish the download ({state.error}). Nothing partial was saved. <button onClick={retry} className="underline">Try again</button> · <button onClick={() => void copyDetails()} className="underline" title="Copies a short technical note (file names, sizes, what the server answered) to paste into a message to the firm — no links or document contents">{copied ? "Copied" : "Copy details"}</button></p>
          )}
        </div>
        {state.busy ? (
          <button onClick={cancel} className="shrink-0 rounded border border-[var(--c-border)] px-2 py-1 text-xs hover:border-red-500 hover:text-red-600">Cancel</button>
        ) : (
          <button onClick={() => setState(null)} className="shrink-0 text-[var(--c-ink-muted)]" aria-label="Close"><X size={16} /></button>
        )}
      </div>
    </div>
  ) : null;

  return { start, panel, busy: !!state?.busy };
}

/** A plain button wired to the downloader. */
export function ZipButton({ onStart, label, className, disabled, title }: { onStart: () => void; label: string; className: string; disabled?: boolean; title?: string }) {
  return (
    <button type="button" onClick={onStart} disabled={disabled} className={className} title={title}>
      <Download size={14} /> {label}
    </button>
  );
}
