"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, Loader2, Search, X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  Pencil, Trash2, FileText, ExternalLink, Hash, ListOrdered, CornerDownLeft, AlertCircle,
} from "lucide-react";
import { upload } from "@vercel/blob/client";
import { parseExhibitName, suggestOrder, getScheme, SIDE_LABEL, type Side } from "@/lib/pretrial/exhibits";
import { filesFromDrop, countDropItems, fromInput, type PickedFile } from "@/lib/share/drop";
import {
  addExhibitDoc, updateExhibitDoc, deleteExhibitDoc, searchExhibitSet, getDocPages,
  type SetSearchHit,
} from "@/app/admin/(panel)/exhibit-reviewer/actions";

export type ReviewerDoc = {
  id: number; side: string; number: number | null; label: string; title: string; bates: string;
  hasFile: boolean; pageCount: number | null; sizeBytes: number | null; sort: number;
};

const SIDES: Side[] = ["plaintiff", "defendant", "joint"];
const input = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]";
const fmtSize = (b?: number | null) => (!b ? "" : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const defaultLabel = (side: Side, n: number | null) => (n == null ? "" : getScheme("dash").format(side, n));

/** A file dropped in, parsed and awaiting the user's confirmation before upload. */
type Staged = { key: string; file: File; side: Side; number: number | null; label: string; title: string; bates: string };

/**
 * Auto-numbering: give each staged exhibit its number from its position in the
 * (already number-sorted) list, counting separately per side and continuing from
 * whatever the set already has. This is what saves anyone from typing 200
 * numbers — the drop order is the order, so the numbers just fill themselves in.
 * Manual mode returns the list untouched so hand-entered numbers stand.
 */
function computeNumbers(items: Staged[], autoNumber: boolean, startAt: Record<Side, number>): Staged[] {
  if (!autoNumber) return items;
  const c: Record<Side, number> = { ...startAt };
  return items.map((s) => {
    const n = c[s.side]++;
    return { ...s, number: n, label: defaultLabel(s.side, n) };
  });
}

export function ExhibitReviewer({ setId, docs, blobReady }: { setId: number; docs: ReviewerDoc[]; blobReady: boolean }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = useCallback((fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      router.refresh();
    });
  }, [router]);

  // Which sides actually have exhibits — plaintiff & defendant always shown,
  // joint only when used.
  const sidesInUse = useMemo(() => {
    const present = new Set(docs.map((d) => d.side));
    return SIDES.filter((s) => s === "plaintiff" || s === "defendant" || present.has(s));
  }, [docs]);
  const [side, setSide] = useState<Side>("plaintiff");

  const ordered = useMemo(() => {
    const inSide = docs.filter((d) => d.side === side);
    return inSide.slice().sort((a, b) => {
      const an = a.number ?? Infinity, bn = b.number ?? Infinity;
      if (an !== bn) return an - bn;
      if (a.sort !== b.sort) return a.sort - b.sort;
      return a.id - b.id;
    });
  }, [docs, side]);

  const [currentId, setCurrentId] = useState<number | null>(null);
  // Keep a valid selection as the side/list changes.
  useEffect(() => {
    if (ordered.length === 0) { setCurrentId(null); return; }
    if (!ordered.some((d) => d.id === currentId)) setCurrentId(ordered[0].id);
  }, [ordered, currentId]);

  const current = ordered.find((d) => d.id === currentId) ?? null;
  const currentIndex = current ? ordered.findIndex((d) => d.id === current.id) : -1;

  const [viewerPage, setViewerPage] = useState(1);
  const openDoc = useCallback((id: number, page = 1) => { setCurrentId(id); setViewerPage(page); }, []);

  function step(delta: number) {
    if (currentIndex < 0) return;
    const next = ordered[currentIndex + delta];
    if (next) openDoc(next.id, 1);
  }

  /* ------------------------- go to number ------------------------- */
  const [gotoNum, setGotoNum] = useState("");
  function goToNumber() {
    const n = Number(gotoNum);
    if (!Number.isFinite(n)) return;
    const hit = ordered.find((d) => d.number === n);
    if (hit) { openDoc(hit.id, 1); setGotoNum(""); }
    else setError(`No exhibit numbered ${n} in ${SIDE_LABEL[side].toLowerCase()}.`);
  }

  /* ---------------------- cross-set search ------------------------ */
  const [setQuery, setSetQuery] = useState("");
  const [setHits, setSetHits] = useState<SetSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const q = setQuery.trim();
    if (q.length < 2) { setSetHits(null); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const hits = await searchExhibitSet(setId, q);
      setSetHits(hits);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [setQuery, setId]);

  function openHit(h: SetSearchHit) {
    setSide((h.side as Side) ?? "plaintiff");
    openDoc(h.docId, h.pages[0] ?? 1);
    setSetQuery("");
    setSetHits(null);
  }

  /* --------------------- in-document search ----------------------- */
  const [docPages, setDocPages] = useState<string[]>([]);
  const [docQuery, setDocQuery] = useState("");
  const [docMatches, setDocMatches] = useState<number[]>([]);
  const [matchPos, setMatchPos] = useState(0);
  // Load the current document's text when it changes.
  useEffect(() => {
    let alive = true;
    setDocPages([]); setDocQuery(""); setDocMatches([]); setMatchPos(0);
    if (current?.id) getDocPages(current.id).then((p) => { if (alive) setDocPages(p); });
    return () => { alive = false; };
  }, [current?.id]);
  useEffect(() => {
    const q = docQuery.trim().toLowerCase();
    if (q.length < 2 || docPages.length === 0) { setDocMatches([]); setMatchPos(0); return; }
    const pages: number[] = [];
    for (let i = 0; i < docPages.length; i++) if ((docPages[i] ?? "").toLowerCase().includes(q)) pages.push(i + 1);
    setDocMatches(pages);
    setMatchPos(0);
    if (pages.length) setViewerPage(pages[0]);
  }, [docQuery, docPages]);
  function stepMatch(delta: number) {
    if (!docMatches.length) return;
    const pos = (matchPos + delta + docMatches.length) % docMatches.length;
    setMatchPos(pos);
    setViewerPage(docMatches[pos]);
  }

  /* ------------------------- add / upload ------------------------- */
  const [staged, setStaged] = useState<Staged[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [autoNumber, setAutoNumber] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  // New drops continue the set's existing numbering per side, so adding a second
  // batch doesn't restart at 1.
  const startAt = useMemo<Record<Side, number>>(() => {
    const max: Record<Side, number> = { plaintiff: 0, defendant: 0, joint: 0 };
    for (const d of docs) {
      const s: Side = d.side === "defendant" ? "defendant" : d.side === "joint" ? "joint" : "plaintiff";
      if (typeof d.number === "number") max[s] = Math.max(max[s], d.number);
    }
    return { plaintiff: max.plaintiff + 1, defendant: max.defendant + 1, joint: max.joint + 1 };
  }, [docs]);

  // What the staged rows show and what actually gets uploaded — numbered when in
  // auto mode, left as typed in manual mode.
  const numberedStaged = useMemo(() => computeNumbers(staged, autoNumber, startAt), [staged, autoNumber, startAt]);

  function toggleAuto(next: boolean) {
    // Leaving auto mode bakes the current numbers in, so manual editing starts
    // from a filled-in sequence rather than blanks.
    if (!next) setStaged((prev) => computeNumbers(prev, true, startAt));
    setAutoNumber(next);
  }

  const stageFiles = useCallback((picked: PickedFile[]) => {
    const pdfs = picked.filter((p) => /\.pdf$/i.test(p.file.name) || p.file.type === "application/pdf");
    if (!pdfs.length) { setError("Drop PDF files — the reviewer reads exhibits as PDFs."); return; }
    const parsed = pdfs.map((p) => ({ picked: p, ...parseExhibitName(p.file.name) }));
    const sorted = suggestOrder(parsed);
    const items: Staged[] = sorted.map((p, i) => {
      const s = (p.side as Side | null) ?? side;
      return {
        key: `${p.picked.file.name}-${i}-${p.picked.file.size}`,
        file: p.picked.file,
        side: s,
        number: p.number,
        label: defaultLabel(s, p.number),
        title: p.title,
        bates: p.bates,
      };
    });
    setStaged((prev) => [...prev, ...items]);
  }, [side]);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const count = countDropItems(e.dataTransfer);
    try {
      const picked = await filesFromDrop(e.dataTransfer);
      if (picked.length === 0 && count > 0) setError("Couldn't read the dropped items. Try the “Choose files” button instead.");
      else stageFiles(picked);
    } catch { setError("Couldn't read the drop. Try the “Choose files” button."); }
  }, [stageFiles]);

  async function doUpload() {
    if (!staged.length || !blobReady) return;
    setError(null);
    const finalItems = computeNumbers(staged, autoNumber, startAt);
    setUploading({ done: 0, total: finalItems.length });
    let done = 0;
    for (const item of finalItems) {
      try {
        const blob = await upload(`exhibit-reviewer/${setId}/${item.file.name}`, item.file, {
          access: "public", handleUploadUrl: "/api/admin/trial-upload", clientPayload: String(setId),
        });
        await addExhibitDoc(setId, {
          side: item.side, number: item.number, label: item.label.trim(), title: item.title.trim(), bates: item.bates.trim(),
          file: { url: blob.url, pathname: blob.pathname, contentType: item.file.type || blob.contentType, size: item.file.size },
        });
      } catch (err) {
        setError(`Couldn't upload ${item.file.name}: ${(err as Error).message}`);
      }
      done++;
      setUploading({ done, total: staged.length });
    }
    setStaged([]);
    setUploading(null);
    router.refresh();
  }

  const patchStaged = (key: string, patch: Partial<Staged>) => setStaged((prev) => prev.map((s) => {
    if (s.key !== key) return s;
    const next = { ...s, ...patch };
    // Keep the label in step with side/number unless the user typed one.
    if ((patch.side !== undefined || patch.number !== undefined) && (s.label === defaultLabel(s.side, s.number) || !s.label)) {
      next.label = defaultLabel(next.side, next.number);
    }
    return next;
  }));

  const proxyBase = `/admin/exhibit-reviewer/${setId}/doc`;
  const viewerSrc = current ? `${proxyBase}/${current.id}#page=${viewerPage}&zoom=page-width&view=FitH` : "";

  return (
    <div className="space-y-4">
      {error && (
        <p className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">
          <AlertCircle size={15} className="mt-0.5 shrink-0" /> <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X size={14} /></button>
        </p>
      )}

      {/* Side tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--c-border)] pb-2">
        {sidesInUse.map((s) => {
          const n = docs.filter((d) => d.side === s).length;
          return (
            <button key={s} onClick={() => setSide(s)} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${side === s ? "bg-[var(--c-accent)] text-white" : "text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)] hover:text-[var(--c-ink)]"}`}>
              {SIDE_LABEL[s]} <span className={`rounded-full px-1.5 ${side === s ? "bg-white/20" : "bg-[var(--c-surface2)]"}`}>{n}</span>
            </button>
          );
        })}
      </div>

      {/* Toolbar: go-to-number, prev/next, cross-set search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-2 py-1">
          <Hash size={13} className="text-[var(--c-ink-muted)]" />
          <input value={gotoNum} onChange={(e) => setGotoNum(e.target.value.replace(/[^\d]/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") goToNumber(); }} placeholder="Go to #" inputMode="numeric" className="w-16 bg-transparent text-sm outline-none" />
          <button onClick={goToNumber} className="rounded p-0.5 text-[var(--c-accent)] hover:bg-[var(--c-surface2)]" title="Go"><CornerDownLeft size={14} /></button>
        </div>

        <div className="inline-flex items-center gap-1">
          <button onClick={() => step(-1)} disabled={currentIndex <= 0} className="rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)] disabled:opacity-40" title="Previous exhibit"><ChevronLeft size={16} /></button>
          <span className="min-w-[7.5rem] text-center text-xs text-[var(--c-ink-muted)]">
            {current ? `${current.label || current.title || "Exhibit"} · ${currentIndex + 1} of ${ordered.length}` : `${ordered.length} exhibits`}
          </span>
          <button onClick={() => step(1)} disabled={currentIndex < 0 || currentIndex >= ordered.length - 1} className="rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)] disabled:opacity-40" title="Next exhibit"><ChevronRight size={16} /></button>
        </div>

        <div className="relative ml-auto min-w-[220px] flex-1 sm:max-w-sm">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-ink-muted)]" />
          <input value={setQuery} onChange={(e) => setSetQuery(e.target.value)} placeholder="Search across all exhibits…" className={`${input} pl-8 pr-8`} />
          {setQuery && <button onClick={() => { setSetQuery(""); setSetHits(null); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={14} /></button>}
          {setHits !== null && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] shadow-lg">
              {searching && <div className="px-3 py-2 text-xs text-[var(--c-ink-muted)]"><Loader2 size={12} className="mr-1 inline animate-spin" /> Searching…</div>}
              {!searching && setHits.length === 0 && <div className="px-3 py-3 text-xs text-[var(--c-ink-muted)]">No exhibits match “{setQuery}”.</div>}
              {setHits.map((h) => (
                <button key={h.docId} onClick={() => openHit(h)} className="block w-full border-b border-[var(--c-border)] px-3 py-2 text-left last:border-0 hover:bg-[var(--c-surface2)]">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-[var(--c-accent)]">{h.label || h.title || "Exhibit"}</span>
                    <span className="rounded bg-[var(--c-surface2)] px-1.5 text-[10px] uppercase text-[var(--c-ink-muted)]">{h.side}</span>
                    {h.pages.length > 0 && <span className="text-[11px] text-[var(--c-ink-muted)]">p. {h.pages.slice(0, 6).join(", ")}{h.pages.length > 6 ? "…" : ""}</span>}
                  </div>
                  {h.title && <div className="truncate text-xs text-[var(--c-ink-muted)]">{h.title}</div>}
                  {h.snippet && <div className="mt-0.5 truncate text-[11px] italic text-[var(--c-ink-muted)]">…{h.snippet}…</div>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main: list + viewer */}
      <div className="grid gap-4 lg:grid-cols-[minmax(240px,320px)_1fr]">
        {/* Exhibit list */}
        <div className="space-y-2">
          <AddExhibits
            blobReady={blobReady} dragOver={dragOver} uploading={uploading} items={numberedStaged}
            autoNumber={autoNumber} onToggleAuto={toggleAuto}
            fileRef={fileRef}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onPick={(list) => stageFiles(fromInput(list))}
            onPatch={patchStaged}
            onRemove={(key) => setStaged((prev) => prev.filter((s) => s.key !== key))}
            onClear={() => setStaged([])}
            onUpload={doUpload}
          />

          {ordered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--c-border)] p-4 text-center text-xs text-[var(--c-ink-muted)]">
              No {SIDE_LABEL[side].toLowerCase()} yet. Drop exhibit PDFs above.
            </p>
          ) : (
            <ul className="space-y-1">
              {ordered.map((d, i) => (
                <ExhibitRow key={d.id} d={d} active={d.id === currentId} index={i}
                  onOpen={() => openDoc(d.id, 1)}
                  onSave={(patch) => run(() => updateExhibitDoc(d.id, patch))}
                  onDelete={() => { if (confirm(`Remove ${d.label || d.title || "this exhibit"}?`)) run(() => deleteExhibitDoc(d.id)); }}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Viewer */}
        <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]">
          {!current ? (
            <div className="flex h-[70vh] flex-col items-center justify-center gap-2 text-sm text-[var(--c-ink-muted)]">
              <FileText size={28} className="opacity-40" />
              {ordered.length ? "Select an exhibit to view it." : "Add exhibits to get started."}
            </div>
          ) : (
            <div className="flex h-[78vh] flex-col">
              {/* Viewer header + in-document search */}
              <div className="flex flex-wrap items-center gap-2 border-b border-[var(--c-border)] p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{current.label ? `${current.label} — ` : ""}{current.title || "Exhibit"}</div>
                  <div className="truncate text-[11px] text-[var(--c-ink-muted)]">
                    {current.bates ? `${current.bates} · ` : ""}{current.pageCount ? `${current.pageCount} page${current.pageCount === 1 ? "" : "s"}` : ""}{current.sizeBytes ? ` · ${fmtSize(current.sizeBytes)}` : ""}
                  </div>
                </div>

                <div className="relative inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1">
                  <Search size={13} className="text-[var(--c-ink-muted)]" />
                  <input
                    value={docQuery}
                    onChange={(e) => setDocQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") stepMatch(e.shiftKey ? -1 : 1); }}
                    placeholder="Find in this exhibit…"
                    className="w-40 bg-transparent text-sm outline-none"
                    disabled={docPages.length === 0}
                    title={docPages.length === 0 ? "This PDF has no searchable text layer (it may be scanned images)." : "Search this exhibit"}
                  />
                  {docQuery.trim().length >= 2 && (
                    <span className="whitespace-nowrap text-[11px] text-[var(--c-ink-muted)]">
                      {docMatches.length ? `${matchPos + 1}/${docMatches.length} pp` : "0"}
                    </span>
                  )}
                  <button onClick={() => stepMatch(-1)} disabled={!docMatches.length} className="rounded p-0.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)] disabled:opacity-30" title="Previous match"><ChevronUp size={14} /></button>
                  <button onClick={() => stepMatch(1)} disabled={!docMatches.length} className="rounded p-0.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)] disabled:opacity-30" title="Next match"><ChevronDown size={14} /></button>
                </div>

                <a href={`${proxyBase}/${current.id}`} target="_blank" rel="noopener noreferrer" className="rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Open in a new tab"><ExternalLink size={15} /></a>
              </div>

              {docPages.length === 0 && (
                <p className="border-b border-[var(--c-border)] bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                  This PDF has no text layer, so “find in exhibit” can’t search it. You can still use your browser’s find (Ctrl/⌘-F) inside the viewer.
                </p>
              )}

              {/* The PDF itself — native viewer gives scrolling, zoom, and its own
                  find. Keyed on page so #page jumps always take effect. */}
              <iframe
                key={`${current.id}:${viewerPage}`}
                src={viewerSrc}
                title={current.label || current.title || "Exhibit"}
                className="min-h-0 flex-1 w-full rounded-b-lg bg-white"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------- add / staged panel --------------------------- */
/** Per-side numbering summary, e.g. "P-1–P-120 · D-1–D-80". */
function rangeSummary(items: Staged[]): string {
  const parts: string[] = [];
  for (const s of SIDES) {
    const nums = items.filter((i) => i.side === s && i.number != null).map((i) => i.number as number);
    if (!nums.length) continue;
    const lo = Math.min(...nums), hi = Math.max(...nums);
    parts.push(lo === hi ? defaultLabel(s, lo) : `${defaultLabel(s, lo)}–${defaultLabel(s, hi)}`);
  }
  return parts.join("  ·  ");
}

function AddExhibits({ blobReady, dragOver, uploading, items, autoNumber, onToggleAuto, fileRef, onDragOver, onDragLeave, onDrop, onPick, onPatch, onRemove, onClear, onUpload }: {
  blobReady: boolean; dragOver: boolean; uploading: { done: number; total: number } | null; items: Staged[];
  autoNumber: boolean; onToggleAuto: (next: boolean) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onDragOver: (e: React.DragEvent) => void; onDragLeave: () => void; onDrop: (e: React.DragEvent) => void;
  onPick: (list: FileList | null) => void; onPatch: (key: string, patch: Partial<Staged>) => void;
  onRemove: (key: string) => void; onClear: () => void; onUpload: () => void;
}) {
  return (
    <div>
      <div
        onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
        className={`rounded-lg border-2 border-dashed p-3 text-center transition-colors ${dragOver ? "border-[var(--c-accent)] bg-[var(--c-accent)]/5" : "border-[var(--c-border)]"}`}
      >
        <Upload size={18} className="mx-auto mb-1 text-[var(--c-ink-muted)]" />
        <p className="text-xs text-[var(--c-ink-muted)]">Drop exhibit PDFs here, or</p>
        <button onClick={() => fileRef.current?.click()} className="mt-1 text-xs font-semibold text-[var(--c-accent)] hover:underline">Choose files</button>
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(e) => { onPick(e.target.files); if (fileRef.current) fileRef.current.value = ""; }} />
        {!blobReady && <p className="mt-1 text-[11px] text-amber-600">Connect a Blob store to upload files.</p>}
      </div>

      {items.length > 0 && (
        <div className="mt-2 rounded-lg border border-[var(--c-accent)]/40 bg-[var(--c-surface)] p-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold"><ListOrdered size={13} className="text-[var(--c-accent)]" /> {items.length} to add</span>
            <button onClick={onClear} disabled={!!uploading} className="text-[11px] text-[var(--c-ink-muted)] hover:text-red-600">Clear</button>
          </div>

          {/* The whole point: numbers are filled in from the order, so nobody
              types them. Confirm, or switch to numbering them by hand. */}
          <label className="mb-2 flex cursor-pointer items-start gap-2 rounded-md bg-[var(--c-surface2)] p-2 text-[11px]">
            <input type="checkbox" checked={autoNumber} onChange={(e) => onToggleAuto(e.target.checked)} className="mt-0.5 accent-[var(--c-accent)]" />
            <span>
              <span className="font-semibold text-[var(--c-ink)]">Number them in this order</span>
              {autoNumber
                ? <span className="text-[var(--c-ink-muted)]"> — they’ll be <span className="font-medium text-[var(--c-ink)]">{rangeSummary(items) || "numbered automatically"}</span>. Uncheck to set numbers by hand.</span>
                : <span className="text-[var(--c-ink-muted)]"> — off; edit each number below.</span>}
            </span>
          </label>

          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {items.map((s) => (
              <li key={s.key} className="rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-2">
                <div className="mb-1 flex items-center gap-1.5">
                  <select value={s.side} onChange={(e) => onPatch(s.key, { side: e.target.value as Side })} className="rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1 py-0.5 text-[11px]" title="Side">
                    <option value="plaintiff">P</option>
                    <option value="defendant">D</option>
                    <option value="joint">J</option>
                  </select>
                  {autoNumber ? (
                    <span className="inline-flex h-[22px] min-w-[3rem] items-center justify-center rounded bg-[var(--c-accent)]/10 px-1.5 text-[11px] font-bold text-[var(--c-accent)]" title="Auto-numbered from the order">{s.label || "—"}</span>
                  ) : (
                    <>
                      <input value={s.number ?? ""} onChange={(e) => onPatch(s.key, { number: e.target.value === "" ? null : Number(e.target.value.replace(/[^\d]/g, "")) })} placeholder="#" inputMode="numeric" className="w-10 rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1 py-0.5 text-[11px]" />
                      <input value={s.label} onChange={(e) => onPatch(s.key, { label: e.target.value })} placeholder="P-1" className="w-16 rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1 py-0.5 text-[11px]" />
                    </>
                  )}
                  <button onClick={() => onRemove(s.key)} disabled={!!uploading} className="ml-auto text-[var(--c-ink-muted)] hover:text-red-600"><X size={13} /></button>
                </div>
                <input value={s.title} onChange={(e) => onPatch(s.key, { title: e.target.value })} placeholder="Title" className="w-full rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1.5 py-0.5 text-[11px]" />
                <div className="mt-0.5 truncate text-[10px] text-[var(--c-ink-muted)]" title={s.file.name}>{s.file.name}</div>
              </li>
            ))}
          </ul>
          <button onClick={onUpload} disabled={!blobReady || !!uploading} className="btn btn-accent mt-2 inline-flex w-full items-center justify-center gap-1.5 text-xs py-2 disabled:opacity-50">
            {uploading ? <><Loader2 size={13} className="animate-spin" /> Uploading {uploading.done}/{uploading.total}…</> : <><Upload size={13} /> Add {items.length} exhibit{items.length === 1 ? "" : "s"}</>}
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ list row ------------------------------ */
function ExhibitRow({ d, active, index, onOpen, onSave, onDelete }: {
  d: ReviewerDoc; active: boolean; index: number;
  onOpen: () => void; onSave: (patch: { side?: string; number?: number | null; label?: string; title?: string; bates?: string }) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ side: d.side, number: d.number, label: d.label, title: d.title, bates: d.bates });
  useEffect(() => { setF({ side: d.side, number: d.number, label: d.label, title: d.title, bates: d.bates }); }, [d]);

  if (editing) {
    return (
      <li className="rounded-md border border-[var(--c-accent)] bg-[var(--c-surface)] p-2 text-xs">
        <div className="mb-1.5 flex items-center gap-1.5">
          <select value={f.side} onChange={(e) => setF({ ...f, side: e.target.value })} className="rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1 py-0.5">
            <option value="plaintiff">P</option><option value="defendant">D</option><option value="joint">J</option>
          </select>
          <input value={f.number ?? ""} onChange={(e) => setF({ ...f, number: e.target.value === "" ? null : Number(e.target.value.replace(/[^\d]/g, "")) })} placeholder="#" inputMode="numeric" className="w-10 rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1 py-0.5" />
          <input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="P-1" className="w-16 rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1 py-0.5" />
        </div>
        <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Title" className="mb-1.5 w-full rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1.5 py-0.5" />
        <input value={f.bates} onChange={(e) => setF({ ...f, bates: e.target.value })} placeholder="Bates (optional)" className="mb-1.5 w-full rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1.5 py-0.5" />
        <div className="flex justify-end gap-1.5">
          <button onClick={() => setEditing(false)} className="rounded px-2 py-1 text-[var(--c-ink-muted)]">Cancel</button>
          <button onClick={() => { onSave({ ...f }); setEditing(false); }} className="btn btn-accent px-2.5 py-1 text-[11px]">Save</button>
        </div>
      </li>
    );
  }

  return (
    <li className={`group flex items-center gap-2 rounded-md border p-2 transition-colors ${active ? "border-[var(--c-accent)] bg-[var(--c-accent)]/5" : "border-[var(--c-border)] bg-[var(--c-surface)] hover:border-[var(--c-accent)]/40"}`}>
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className={`inline-flex h-6 min-w-[2.25rem] shrink-0 items-center justify-center rounded px-1 text-[11px] font-bold ${active ? "bg-[var(--c-accent)] text-white" : "bg-[var(--c-surface2)] text-[var(--c-ink)]"}`}>
          {d.label || (d.number ?? index + 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-[var(--c-ink)]">{d.title || "Untitled exhibit"}</span>
          {(d.bates || d.pageCount) && <span className="block truncate text-[10px] text-[var(--c-ink-muted)]">{d.bates}{d.bates && d.pageCount ? " · " : ""}{d.pageCount ? `${d.pageCount} pp` : ""}</span>}
        </span>
      </button>
      <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
        <button onClick={() => setEditing(true)} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Edit"><Pencil size={12} /></button>
        <button onClick={onDelete} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600" title="Remove"><Trash2 size={12} /></button>
      </span>
    </li>
  );
}
