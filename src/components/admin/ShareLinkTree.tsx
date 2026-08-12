"use client";

import { useState } from "react";
import { X, Download, FileSpreadsheet, FileText, AlertTriangle, Loader2, Lock, Link2 } from "lucide-react";
import { comparePaths } from "@/lib/share/sort";

type LT = { id: number; url: string; filename: string };
const baseName = (p: string) => p.split("/").pop() || p;

export function LinkTreeDialog({ folderId, folderName, files, publicToken, onClose }: {
  folderId: number; folderName: string; files: LT[];
  /** Set when the folder has per-file share links switched on. */
  publicToken: string | null;
  onClose: () => void;
}) {
  const [withPdf, setWithPdf] = useState(true);
  const [cap, setCap] = useState(750);
  const [building, setBuilding] = useState(false);
  // Firm-only by default: the links point at the signed-in proxy on our own
  // domain, so a stray copy of this file can't hand out the documents.
  const [mode, setMode] = useState<"firm" | "public">("firm");
  const usePublic = mode === "public" && !!publicToken;

  const linkFor = (fileId: number) =>
    usePublic
      ? `${window.location.origin}/share/f/${publicToken}/${fileId}`
      : `${window.location.origin}/admin/share-folders/${folderId}/file/${fileId}`;

  function downloadCsv() {
    const esc = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const lines = ["Document,Link"];
    // Same natural alphanumeric path order the folder tree shows on screen.
    const ordered = [...files].sort((a, b) => comparePaths(a.filename, b.filename));
    for (const f of ordered) lines.push([esc(baseName(f.filename)), esc(linkFor(f.id))].join(","));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(folderName || "documents").replace(/[\\/:*?"<>|]/g, "-")} - link tree.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function buildPdf() {
    setBuilding(true);
    // The build streams from the server; opening in a tab lets the browser save it.
    window.open(`/admin/share-folders/${folderId}/linktree?cap=${cap}&links=${usePublic ? "public" : "firm"}`, "_blank");
    setTimeout(() => setBuilding(false), 2500);
  }

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/45 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg overflow-hidden rounded-lg bg-[var(--c-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--c-border)] px-5 py-3">
          <h3 className="font-[family-name:var(--font-display)] text-lg">Download link tree</h3>
          <button onClick={onClose} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={18} /></button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto p-5">
          {/* Serious warning */}
          <div className="mb-4 flex items-start gap-2 rounded-md border-2 border-red-500/60 bg-red-500/10 px-3 py-2.5 text-sm text-red-700 dark:text-red-300">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <p><strong>Confidential — internal use only.</strong> These files contain <strong>direct links to case documents</strong>. Anyone who opens them can reach those documents. <strong>Do not share, forward, or upload them outside the firm.</strong></p>
          </div>

          <p className="mb-4 text-sm text-[var(--c-ink-muted)]">A link tree lists every document in <strong>{folderName}</strong> ({files.length} file{files.length === 1 ? "" : "s"}) with a clickable link to each — for building a memo or case summary that cites and links the record.</p>

          {/* Which kind of link gets written into the file. */}
          <div className="mb-3 rounded-md border border-[var(--c-border)] p-3">
            <p className="mb-2 text-sm font-medium">Links point to</p>
            <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-sm hover:bg-[var(--c-surface2)]">
              <input type="radio" checked={mode === "firm"} onChange={() => setMode("firm")} className="mt-1" />
              <span>
                <span className="inline-flex items-center gap-1.5 font-medium text-[var(--c-ink)]"><Lock size={13} className="text-emerald-600" /> Firm only — sign-in required</span>
                <span className="block text-xs text-[var(--c-ink-muted)]">Links open on texaslawsmith.com and only work for someone signed in to the admin panel. Safest, and the right choice for an internal memo.</span>
              </span>
            </label>
            <label className={`flex items-start gap-2 rounded px-1 py-1 text-sm ${publicToken ? "cursor-pointer hover:bg-[var(--c-surface2)]" : "opacity-50"}`}>
              <input type="radio" checked={mode === "public"} disabled={!publicToken} onChange={() => setMode("public")} className="mt-1" />
              <span>
                <span className="inline-flex items-center gap-1.5 font-medium text-[var(--c-ink)]"><Link2 size={13} className="text-amber-600" /> Shareable — no sign-in</span>
                <span className="block text-xs text-[var(--c-ink-muted)]">
                  {publicToken
                    ? "Also on texaslawsmith.com, but opens without signing in — use when the list has to go to co-counsel. Revoking the folder's file links kills these."
                    : "Turn on per-file links for this folder to use this."}
                </span>
              </span>
            </label>
          </div>

          {/* CSV */}
          <div className="mb-3 rounded-md border border-[var(--c-border)] p-3">
            <p className="mb-1 inline-flex items-center gap-1.5 text-sm font-medium"><FileSpreadsheet size={15} className="text-[var(--c-accent)]" /> Spreadsheet (CSV)</p>
            <p className="mb-2 text-xs text-[var(--c-ink-muted)]">One row per document: the file name and its link. Paste it into a memo, or hand it to an assistant or AI so citations can link straight to the source.</p>
            <button onClick={downloadCsv} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-3 py-1.5 text-sm hover:bg-[var(--c-surface2)]"><Download size={14} /> Download CSV</button>
          </div>

          {/* Combined PDF */}
          <div className="rounded-md border border-[var(--c-border)] p-3">
            <label className="flex items-start gap-2 text-sm font-medium">
              <input type="checkbox" checked={withPdf} onChange={(e) => setWithPdf(e.target.checked)} className="mt-0.5" />
              <span className="inline-flex items-center gap-1.5"><FileText size={15} className="text-[var(--c-accent)]" /> Also compile the documents into one combined PDF</span>
            </label>
            {withPdf && (
              <div className="mt-2 space-y-2 pl-6">
                <p className="text-xs text-[var(--c-ink-muted)]">Every page is stamped at the bottom with its <strong>file name</strong>, its <strong>page within that file</strong> (e.g. &ldquo;Exhibit A · p. 3 of 6&rdquo;), and a clickable link back to the document — so a reader (or AI) always knows what each page is and where it lives.</p>
                <label className="flex items-center gap-2 text-xs text-[var(--c-ink-muted)]">
                  Split into parts every
                  <select value={cap} onChange={(e) => setCap(Number(e.target.value))} className="rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1 text-sm">
                    <option value={500}>500 pages</option>
                    <option value={750}>750 pages</option>
                    <option value={1000}>1,000 pages</option>
                  </select>
                  <span>— you&rsquo;ll get a ZIP of parts if it&rsquo;s longer.</span>
                </label>
                <p className="text-[11px] text-[var(--c-ink-muted)]">PDFs are merged page-by-page; images become one page each; other file types get a placeholder page with the link. Large folders may take a moment.</p>
                <button onClick={buildPdf} disabled={building} className="inline-flex items-center gap-1.5 rounded-md bg-[#7a1f2b] px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50">
                  {building ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Build &amp; download combined PDF
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
