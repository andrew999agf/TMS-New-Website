"use client";

import { useState, type ReactNode } from "react";
import { Activity, Check, Copy, Loader2, X } from "lucide-react";
import { diagBrowserText } from "@/lib/client-diag";

/**
 * A "Diagnostics" button that opens one copyable text report: whatever the
 * server knows (passed in as `fetchServer`) followed by what this browser is
 * doing right now (registered providers, memory, caught errors). Nothing is
 * sent anywhere; the user copies the text and pastes it to support.
 */
export function DiagnosticsButton({ fetchServer, browserHeading, title, className, children }: {
  fetchServer: () => Promise<{ ok: true; text: string } | { ok: false; error: string }>;
  browserHeading: string;
  title?: string;
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  async function run() {
    setOpen(true);
    setBusy(true);
    setCopied(false);
    const browser = diagBrowserText(browserHeading);
    const server = await fetchServer().catch((e: Error) => ({ ok: false as const, error: e.message }));
    setText(`${server.ok ? server.text : `SERVER REPORT FAILED: ${server.error}`}\n\n${browser}`);
    setBusy(false);
  }

  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* select-all fallback below */ }
  }

  return (
    <>
      <button type="button" onClick={() => void run()} title={title ?? "Build a copyable diagnostics report — paste it to support when something looks wrong"}
        className={className ?? "inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]"}>
        <Activity size={13} /> {children ?? "Diagnostics"}
      </button>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg border border-[var(--c-accent)] bg-[var(--c-surface)] p-4" role="dialog" aria-label="Diagnostics">
            <div className="flex items-center gap-2">
              <h3 className="font-[family-name:var(--font-display)] text-lg">Diagnostics</h3>
              <span className="text-xs text-[var(--c-ink-muted)]">Copy this and paste it to support. No document contents, links or secrets are included.</span>
              <button onClick={() => void copy()} disabled={busy || !text} className="btn btn-accent ml-auto inline-flex items-center gap-1.5 text-xs py-1.5 px-3 disabled:opacity-50">
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy report"}
              </button>
              <button onClick={() => setOpen(false)} className="text-[var(--c-ink-muted)]" aria-label="Close"><X size={16} /></button>
            </div>
            {busy ? (
              <p className="mt-4 flex items-center gap-2 text-sm text-[var(--c-ink-muted)]"><Loader2 size={14} className="animate-spin" /> Gathering the report…</p>
            ) : (
              <textarea readOnly value={text} onFocus={(e) => e.currentTarget.select()} spellCheck={false}
                className="mt-3 min-h-[50vh] flex-1 resize-none rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-3 font-mono text-[11px] leading-relaxed outline-none" />
            )}
          </div>
        </div>
      )}
    </>
  );
}
