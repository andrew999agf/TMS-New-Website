"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, ExternalLink, ListOrdered, Loader2, Pencil, X } from "lucide-react";
import { saveProductionContents } from "@/app/admin/(panel)/discovery-reviewer/actions";

/**
 * "Contents & notes" for the client-production pipeline. TWO separate maps:
 *   - The red (received) tab's contents refers to SOURCE-FILE page numbers
 *     ("1-60 Photographs") and stays in the red tab — those numbers stop
 *     meaning anything once documents are Bates-stamped.
 *   - The yellow and green tabs share their OWN contents, organized by Bates
 *     number ("SMITH000131-SMITH000200 Payroll records"); clicking a line
 *     opens the staged/produced copy at that exact Bates page. Plain numeric
 *     ranges still work there and open the review-set PDF at that page.
 * The green tab can flip numeric labels to Bates numbers, computed from the
 * production's starting label, or spelled out per line with "@"
 * (e.g. "131-200 Payroll records @ SMITH000131-SMITH000200").
 * Anything that doesn't parse as a range just shows as a plain note line;
 * free-form notes live below the contents.
 */

export type TocEntry = {
  from: number; to: number; title: string; batesOverride: string | null; raw: string;
  /** Set when the line is written as a Bates range — the record-copy form. */
  bates: { prefix: string; from: number; to: number; text: string } | null;
};
export type TocLine = { entry: TocEntry | null; text: string };

const LINE_RE = /^\s*(?:pp?\.?\s*)?(\d+)\s*(?:-|–|—|to|through|thru)\s*(\d+)\s*[:.,]?\s*(.*)$/i;
// "SMITH000131-SMITH000200 Payroll records" (or a single label): a Bates
// prefix, 4+ digits, optionally a dash and a second label with the same
// prefix omitted or repeated, then the title.
const BATES_LINE_RE = /^\s*([A-Za-z][A-Za-z0-9_.-]*?)(\d{4,})(?:\s*(?:-|–|—)\s*(?:([A-Za-z][A-Za-z0-9_.-]*?))?(\d{4,}))?\s*[:.,]?\s+(.+)$/;

export function parseToc(toc: string): TocLine[] {
  return toc.split("\n").map((line) => {
    const text = line.trim();
    if (!text) return { entry: null, text: "" };
    const at = text.split(/\s@\s/);
    const m = LINE_RE.exec(at[0]);
    if (m) {
      const from = Number(m[1]);
      const to = Number(m[2]);
      if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to < from) return { entry: null, text };
      return { entry: { from, to, title: (m[3] || "").trim() || "Section", batesOverride: at[1]?.trim() || null, raw: text, bates: null }, text };
    }
    const bm = BATES_LINE_RE.exec(at[0]);
    if (bm && (!bm[3] || bm[3] === bm[1])) {
      const prefix = bm[1];
      const from = Number(bm[2]);
      const to = bm[4] ? Number(bm[4]) : from;
      if (Number.isFinite(from) && Number.isFinite(to) && to >= from) {
        const label = bm[4] ? `${prefix}${bm[2]}–${prefix}${bm[4]}` : `${prefix}${bm[2]}`;
        return { entry: { from, to, title: (bm[5] || "").trim() || "Section", batesOverride: null, raw: text, bates: { prefix, from, to, text: label } }, text };
      }
    }
    return { entry: null, text };
  });
}

const pad6 = (n: number) => String(n).padStart(6, "0");

export function ProductionContents({
  setId, mode, toc, notes, tocFile,
  fileChoices, onJump, linkFor, batesBase, batesLink, stagedDocs,
}: {
  setId: number;
  mode: "received" | "staged" | "produced";
  toc: string;
  notes: string;
  tocFile: string;
  /** Red tab only: the PDFs the page numbers could refer to (key + name). */
  fileChoices?: { key: string; name: string }[];
  /** Red tab: jump the in-app reader to a page of the designated file. */
  onJump?: (page: number) => void;
  /** Yellow/green: URL that shows this page range (opens in a new tab). */
  linkFor?: (entry: TocEntry) => string | null;
  /** Green: compute Bates labels from the production's first label. */
  batesBase?: { prefix: string; start: number } | null;
  /** Yellow/green: resolve a Bates number to the staged copy's URL at that page. */
  batesLink?: (prefix: string, n: number) => string | null;
  /** Yellow tab: the Bates-labeled staged documents, to prompt for coverage
   *  and prefill new contents lines. */
  stagedDocs?: { prefix: string; start: number; end: number; name: string }[];
}) {
  const router = useRouter();
  const lines = parseToc(toc);
  const entries = lines.filter((l) => l.entry).length;
  const hasContent = entries > 0 || !!notes.trim() || lines.some((l) => l.text);
  const [open, setOpen] = useState(hasContent);
  const [editing, setEditing] = useState(false);
  const [draftToc, setDraftToc] = useState(toc);
  const [draftNotes, setDraftNotes] = useState(notes);
  const [draftFile, setDraftFile] = useState(tocFile);
  const [busy, setBusy] = useState(false);
  const [showBates, setShowBates] = useState(mode === "produced");
  const canBates = mode === "produced" && (!!batesBase || lines.some((l) => l.entry?.batesOverride));

  // The yellow tab's nudge: Bates-labeled documents this contents doesn't
  // cover yet. Source page numbers died with the red tab — new record copies
  // deserve a line written against their Bates numbers.
  const batesEntries = lines.flatMap((l) => (l.entry?.bates ? [l.entry.bates] : []));
  const uncovered = mode === "staged" && stagedDocs
    ? stagedDocs.filter((d) => d.start > 0 && !batesEntries.some((b) => b.prefix === d.prefix && b.from <= d.end && d.start <= b.to))
    : [];
  const prefillLines = uncovered
    .map((d) => `${d.prefix}${pad6(d.start)}${d.end > d.start ? `-${d.prefix}${pad6(d.end)}` : ""} ${d.name}`)
    .join("\n");
  function startFromStaged() {
    setDraftToc(toc.trim() ? `${toc.replace(/\s+$/, "")}\n${prefillLines}` : prefillLines);
    setDraftNotes(notes); setDraftFile(tocFile); setEditing(true); setOpen(true);
  }

  async function save() {
    setBusy(true);
    const r = await saveProductionContents(setId, { toc: draftToc, notes: draftNotes, tocFile: draftFile, scope: mode === "received" ? "received" : "staged" });
    setBusy(false);
    if (r.ok) { setEditing(false); router.refresh(); }
  }

  const label = (e: TocEntry): string => {
    if (e.bates) return e.bates.text;
    if (mode === "produced" && showBates) {
      if (e.batesOverride) return e.batesOverride;
      if (batesBase) return `${batesBase.prefix}${pad6(batesBase.start + e.from - 1)}–${pad6(batesBase.start + e.to - 1)}`;
    }
    return e.from === e.to ? `p. ${e.from}` : `pp. ${e.from}–${e.to}`;
  };

  return (
    <div className="mx-4 mt-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--c-ink)]">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <ListOrdered size={14} className="text-[var(--c-accent)]" />
          Contents &amp; notes{entries > 0 && <span className="text-xs text-[var(--c-ink-muted)]">({entries} section{entries === 1 ? "" : "s"})</span>}
        </button>
        {!hasContent && !open && (
          <span className="text-xs text-[var(--c-ink-muted)]">
            {mode === "received" ? "— map the source file (page numbers refer to the red-tab PDF)" : "— this tab's own map, organized by Bates number"}
          </span>
        )}
        {canBates && open && (
          <span className="inline-flex overflow-hidden rounded-md border border-[var(--c-border)] text-xs">
            <button onClick={() => setShowBates(true)} className={`px-2 py-0.5 ${showBates ? "bg-[var(--c-accent)] text-[var(--c-on-accent)]" : "hover:bg-[var(--c-bg)]"}`}>Bates</button>
            <button onClick={() => setShowBates(false)} className={`px-2 py-0.5 ${!showBates ? "bg-[var(--c-accent)] text-[var(--c-on-accent)]" : "hover:bg-[var(--c-bg)]"}`}>Pages</button>
          </span>
        )}
        {open && !editing && (
          <button onClick={() => { setDraftToc(toc); setDraftNotes(notes); setDraftFile(tocFile); setEditing(true); }}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2 py-1 text-xs text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]">
            <Pencil size={11} /> Edit
          </button>
        )}
      </div>

      {/* The prompt Max asked for: new Bates-labeled documents arrived that
          this tab's contents doesn't cover — organize them by Bates number
          (the red tab's page numbers no longer apply here). */}
      {!editing && uncovered.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-[var(--c-ink)]">
          <span className="min-w-0 flex-1">
            <strong>{uncovered.length} Bates-labeled document{uncovered.length === 1 ? "" : "s"}</strong> {uncovered.length === 1 ? "isn't" : "aren't"} in this tab&apos;s contents yet.
            The red tab&apos;s contents uses source page numbers — this tab keeps its own map, organized by Bates number.
          </span>
          <button onClick={startFromStaged} className="btn btn-accent shrink-0 px-3 py-1 text-xs">
            Add {uncovered.length === 1 ? "it" : "them"} — one line per document
          </button>
        </div>
      )}

      {open && !editing && hasContent && (
        <div className="border-t border-[var(--c-border)] px-3 py-2.5">
          {lines.some((l) => l.text) && (
            <ul className="space-y-0.5">
              {lines.map((l, i) =>
                !l.text ? null : l.entry ? (
                  <li key={i}>
                    <button
                      onClick={() => {
                        const e = l.entry!;
                        if (e.bates && batesLink) {
                          const href = batesLink(e.bates.prefix, e.bates.from);
                          if (href) window.open(href, "_blank", "noopener");
                        } else if (mode === "received" && onJump) onJump(e.from);
                        else if (linkFor) { const href = linkFor(e); if (href) window.open(href, "_blank", "noopener"); }
                      }}
                      className="group flex w-full items-baseline gap-2.5 rounded px-1.5 py-0.5 text-left text-sm hover:bg-[var(--c-accent)]/10"
                      title={mode === "received" ? `Jump to page ${l.entry.from}` : `Open at page ${l.entry.from}`}
                    >
                      <span className="shrink-0 font-mono text-xs font-semibold text-[var(--c-accent)]">{label(l.entry)}</span>
                      <span className="min-w-0 break-words text-[var(--c-ink)]">{l.entry.title}</span>
                      {mode !== "received" && <ExternalLink size={11} className="ml-auto shrink-0 text-[var(--c-ink-muted)] opacity-0 group-hover:opacity-100" />}
                    </button>
                  </li>
                ) : (
                  <li key={i} className="px-1.5 py-0.5 text-sm text-[var(--c-ink-muted)]">{l.text}</li>
                ),
              )}
            </ul>
          )}
          {notes.trim() && (
            <p className={`whitespace-pre-wrap px-1.5 text-sm leading-relaxed text-[var(--c-ink-muted)] ${lines.some((l) => l.text) ? "mt-2 border-t border-dashed border-[var(--c-border)] pt-2" : ""}`}>
              {notes}
            </p>
          )}
        </div>
      )}
      {open && !editing && !hasContent && (
        <p className="border-t border-[var(--c-border)] px-4 py-3 text-sm text-[var(--c-ink-muted)]">
          {mode === "received"
            ? <>No contents yet. Click <strong>Edit</strong> and type one section per line — e.g. <span className="font-mono text-xs">1-60 Photographs</span> — and each becomes a clickable jump. Free notes go in the box below it.</>
            : <>No contents for this tab yet — it keeps its own map, organized by <strong>Bates number</strong> (the red tab&apos;s page numbers don&apos;t apply to the stamped copies). Click <strong>Edit</strong> and type one section per line — e.g. <span className="font-mono text-xs">SMITH000131-SMITH000200 Payroll records</span> — and each becomes a click-through to that Bates page.</>}
        </p>
      )}

      {open && editing && (
        <div className="space-y-3 border-t border-[var(--c-border)] px-3 py-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold">Table of contents — one section per line</span>
            <span className="mb-1.5 block text-[11px] text-[var(--c-ink-muted)]">
              {mode === "received"
                ? <>Format: <span className="font-mono">1-60 Photographs</span>. Lines that aren&apos;t a page range show as plain notes.</>
                : <>Format: <span className="font-mono">SMITH000131-SMITH000200 Payroll records</span> — clicking a line opens the staged copy at that Bates page. Plain page ranges (<span className="font-mono">1-60 Photographs</span>) still work and open the review PDF; other lines show as plain notes.</>}
            </span>
            <textarea value={draftToc} onChange={(e) => setDraftToc(e.target.value)} rows={Math.min(14, Math.max(5, draftToc.split("\n").length + 1))}
              placeholder={mode === "received" ? "1-60 Photographs\n61-130 Expense records\n131-200 Payroll records" : "SMITH000001-SMITH000060 Photographs\nSMITH000061-SMITH000130 Expense records\nSMITH000131-SMITH000200 Payroll records"}
              className="w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 font-mono text-xs outline-none focus:border-[var(--c-accent)]" />
          </label>
          {mode === "received" && (fileChoices?.length ?? 0) > 1 && (
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold">Page numbers refer to</span>
              <select value={draftFile} onChange={(e) => setDraftFile(e.target.value)} className="rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1.5 text-sm">
                <option value="">(first PDF in the list)</option>
                {fileChoices!.map((f) => <option key={f.key} value={f.key}>{f.name}</option>)}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-semibold">Notes</span>
            <textarea value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} rows={3}
              placeholder="Anything the team should know about this set…"
              className="w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 text-sm outline-none focus:border-[var(--c-accent)]" />
          </label>
          <div className="flex items-center gap-2">
            <button onClick={() => void save()} disabled={busy} className="btn btn-accent px-4 py-1.5 text-sm">{busy ? <Loader2 size={13} className="animate-spin" /> : "Save"}</button>
            <button onClick={() => setEditing(false)} disabled={busy} className="btn btn-outline inline-flex items-center gap-1 px-3 py-1.5 text-sm"><X size={12} /> Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
