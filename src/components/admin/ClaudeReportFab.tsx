"use client";

import { useState } from "react";
import { Bot, Check, Copy, Download, Loader2, X } from "lucide-react";
import { buildClaudeTemplatesReport } from "@/app/admin/(panel)/documents/actions";

/**
 * Floating "Report for Claude" button on the Docs & Templates tab. Claude
 * can't see this tab's contents from a coding session — this generates a
 * plain-text inventory (every template, its folder, merge fields, and a text
 * head, plus the practice areas) that Max copies or downloads and hands to
 * Claude so it can wire templates up (e.g. engagement letters per practice
 * area) sight-unseen.
 */
export function ClaudeReportFab() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true); setError(null);
    const r = await buildClaudeTemplatesReport();
    setBusy(false);
    if (r.ok && r.report) setReport(r.report);
    else setError(r.error ?? "Couldn't build the report.");
  }

  function openPanel() {
    setOpen(true);
    if (!report && !busy) void generate();
  }

  async function copy() {
    try { await navigator.clipboard.writeText(report); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* no clipboard */ }
  }

  function download() {
    const blob = new Blob([report], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `claude-templates-report-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <button
        onClick={openPanel}
        title="Generate a report of everything in this tab to hand to Claude"
        className="fixed bottom-6 right-6 z-[60] inline-flex items-center gap-2 rounded-full border border-[var(--c-accent)] bg-[var(--c-surface)] px-4 py-2.5 text-sm font-medium text-[var(--c-accent)] shadow-lg hover:bg-[var(--c-accent)] hover:text-[var(--c-on-accent)]"
      >
        <Bot size={16} /> Report for Claude
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg border border-[var(--c-accent)] bg-[var(--c-surface)] p-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-[family-name:var(--font-ui)] font-semibold"><Bot size={17} className="text-[var(--c-accent)]" /> Report for Claude</h3>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={18} /></button>
            </div>
            <p className="mb-3 text-xs text-[var(--c-ink-muted)]">
              An inventory of every template in this tab (folders, merge fields, text) plus the practice areas — copy it or download it, then paste or attach it in a Claude session so it can wire the templates up without being able to see this screen.
            </p>
            {busy && <p className="flex items-center gap-2 text-sm text-[var(--c-ink-muted)]"><Loader2 size={14} className="animate-spin" /> Building the report…</p>}
            {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}
            {report && (
              <>
                <textarea readOnly value={report} className="min-h-0 flex-1 resize-none rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-3 font-mono text-[11px] leading-relaxed" style={{ minHeight: 280 }} />
                <div className="mt-3 flex gap-2">
                  <button onClick={copy} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4">
                    {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy report"}
                  </button>
                  <button onClick={download} className="btn btn-outline inline-flex items-center gap-1.5 text-sm py-2 px-4"><Download size={14} /> Download .txt</button>
                  <button onClick={() => void generate()} className="ml-auto text-sm text-[var(--c-accent)] hover:underline">Refresh</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
