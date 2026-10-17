"use client";

import { useState } from "react";
import { Activity, Check, Copy, Loader2, X } from "lucide-react";
import { discoveryDiagnostics } from "@/app/admin/(panel)/discovery-reviewer/actions";
import { diagSnapshot } from "@/lib/client-diag";

/**
 * "Diagnostics" on the Discovery Reviewer's tab bar: one copyable text
 * report — what the database holds for each tab, the productions, recent
 * activity, plus what this browser is doing right now (documents shown, PDF
 * loads queued/failed, memory, any errors caught) — for pasting to support.
 */
export function DiscoveryDiagnostics({ setId, mode }: { setId: number; mode: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  async function run() {
    setOpen(true);
    setBusy(true);
    setCopied(false);
    const snap = diagSnapshot();
    const server = await discoveryDiagnostics(setId).catch((e: Error) => ({ ok: false as const, error: e.message }));
    const lines: string[] = [];
    lines.push(server.ok ? server.text : `SERVER REPORT FAILED: ${server.error}`);
    lines.push("");
    lines.push(`THIS BROWSER — tab open: ${mode}`);
    for (const [k, v] of Object.entries(snap.browser)) lines.push(`  ${k}: ${v ?? "n/a"}`);
    for (const [name, st] of Object.entries(snap.state)) {
      lines.push(`  ${name}:`);
      for (const [k, v] of Object.entries(st)) lines.push(`    ${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
    }
    lines.push(`  recent browser events (${snap.events.length}):`);
    for (const e of snap.events.slice(-40)) lines.push(`    ${e}`);
    if (!snap.events.length) lines.push("    (none)");
    setText(lines.join("\n"));
    setBusy(false);
  }

  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* select-all fallback below */ }
  }

  return (
    <>
      <button onClick={() => void run()} title="Build a copyable diagnostics report for this case — paste it to support when something looks wrong"
        className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]">
        <Activity size={13} /> Diagnostics
      </button>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg border border-[var(--c-accent)] bg-[var(--c-surface)] p-4" role="dialog" aria-label="Diagnostics">
            <div className="flex items-center gap-2">
              <h3 className="font-[family-name:var(--font-display)] text-lg">Diagnostics</h3>
              <span className="text-xs text-[var(--c-ink-muted)]">Copy this and paste it to support. No document contents or secrets are included.</span>
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
