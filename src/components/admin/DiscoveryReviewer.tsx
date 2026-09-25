"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { upload } from "@vercel/blob/client";
import {
  ChevronLeft, ChevronRight, Grid3x3, BookOpen, Loader2, Plus, Trash2, X, Check, ExternalLink, UploadCloud, ZoomIn, ZoomOut,
} from "lucide-react";
import {
  addDiscoveryDoc, deleteDiscoveryDoc, setDiscoveryDocPageCount, saveDesignation, createLinkedExhibitSet, deleteDesignation,
  type PageRef,
} from "@/app/admin/(panel)/discovery-reviewer/actions";
import type { PDFDocumentProxy } from "pdfjs-dist";

type DocMeta = { id: number; name: string; pageCount: number | null; sizeBytes: number | null };
type Mark = { id: number; party: "P" | "D"; number: number; label: string; title: string; pages: PageRef[]; exhibitSetId: number | null };

const key = (docId: number, page: number) => `${docId}:${page}`;

/* ------------------------- shared pdf.js loading ------------------------- */

type PdfLib = typeof import("pdfjs-dist");
let pdfLibPromise: Promise<PdfLib> | null = null;
function loadPdfjs(): Promise<PdfLib> {
  if (!pdfLibPromise) {
    // The legacy build: the standard v6 build relies on brand-new JS engine
    // APIs (e.g. Map.getOrInsertComputed) that many otherwise-current browsers
    // don't ship yet; the legacy build is compiled for wide support.
    pdfLibPromise = (import("pdfjs-dist/legacy/build/pdf.mjs") as Promise<PdfLib>).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
      return lib;
    });
  }
  return pdfLibPromise;
}

export function DiscoveryReviewer({
  setId, docs, marks, usedNumbers, caseName, matter,
}: {
  setId: number;
  docs: DocMeta[];
  marks: Mark[];
  usedNumbers: { plaintiff: number[]; defendant: number[] };
  caseName: string;
  matter: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<"grid" | "reader">("grid");
  // Grid density: pages per row. 6 by default; 1 (huge) to 10 (overview).
  const [cols, setCols] = useState(6);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("discovery-grid-cols"));
      if (saved >= 1 && saved <= 10) setCols(saved);
    } catch { /* private browsing */ }
  }, []);
  const changeCols = (delta: number) => setCols((c) => {
    const next = Math.min(10, Math.max(1, c + delta));
    try { localStorage.setItem("discovery-grid-cols", String(next)); } catch { /* ignore */ }
    return next;
  });
  const [readerIdx, setReaderIdx] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchorRef = useRef<number | null>(null);
  const [party, setParty] = useState<"P" | "D">("P");
  const [numberInput, setNumberInput] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ text: string; href?: string } | null>(null);
  const [promptCreate, setPromptCreate] = useState<{ name: string } | null>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number; current: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  /** Resolved page counts (server value, corrected client-side for big files). */
  const [pageCounts, setPageCounts] = useState<Record<number, number>>(() =>
    Object.fromEntries(docs.filter((d) => d.pageCount).map((d) => [d.id, d.pageCount!])),
  );

  // Shared per-document pdf.js proxies, loaded on demand and reused by every
  // thumbnail and the reader.
  const proxies = useRef(new Map<number, Promise<PDFDocumentProxy>>());
  const getDoc = useCallback((docId: number) => {
    let p = proxies.current.get(docId);
    if (!p) {
      p = loadPdfjs().then(async (lib) => {
        const doc = await lib.getDocument({
          url: `/admin/discovery-reviewer/${setId}/doc/${docId}`,
          // Codec + font assets staged into /public/pdfjs by next.config.ts.
          // wasmUrl is what decodes scanned-image formats (JBIG2, JPEG2000);
          // without it those pages would DISPLAY blank (the file itself is
          // never touched — this is view-time decoding only).
          wasmUrl: "/pdfjs/wasm/",
          iccUrl: "/pdfjs/iccs/",
          cMapUrl: "/pdfjs/cmaps/",
          standardFontDataUrl: "/pdfjs/standard_fonts/",
        }).promise;
        setPageCounts((prev) => {
          if (prev[docId] === doc.numPages) return prev;
          void setDiscoveryDocPageCount(docId, doc.numPages);
          return { ...prev, [docId]: doc.numPages };
        });
        return doc;
      });
      proxies.current.set(docId, p);
    }
    return p;
  }, [setId]);

  // Resolve counts for files the server-side extractor skipped (too large).
  useEffect(() => {
    for (const d of docs) if (!d.pageCount && !pageCounts[d.id]) void getDoc(d.id).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs.map((d) => d.id).join(",")]);

  /** Every page of every document, in reading order — the shift-range space. */
  const flat = useMemo(() => {
    const out: { docId: number; page: number; docName: string }[] = [];
    for (const d of docs) {
      const n = pageCounts[d.id] ?? 0;
      for (let p = 1; p <= n; p++) out.push({ docId: d.id, page: p, docName: d.name });
    }
    return out;
  }, [docs, pageCounts]);
  const flatIndex = useMemo(() => new Map(flat.map((f, i) => [key(f.docId, f.page), i])), [flat]);

  /** docId:page → designations on that page, for the P/D half-bubbles. */
  const badges = useMemo(() => {
    const m = new Map<string, { party: "P" | "D"; label: string }[]>();
    for (const mark of marks) {
      for (const p of mark.pages) {
        const k = key(p.docId, p.page);
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push({ party: mark.party, label: mark.label });
      }
    }
    return m;
  }, [marks]);

  /* ------------------------------ selection ------------------------------ */

  const toggle = useCallback((idx: number, shiftKey: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const anchor = anchorRef.current;
      if (shiftKey && anchor != null) {
        const [a, b] = anchor <= idx ? [anchor, idx] : [idx, anchor];
        for (let i = a; i <= b; i++) next.add(key(flat[i].docId, flat[i].page));
      } else {
        const k = key(flat[idx].docId, flat[idx].page);
        if (next.has(k)) next.delete(k);
        else next.add(k);
        anchorRef.current = idx;
      }
      if (!shiftKey) anchorRef.current = idx;
      return next;
    });
  }, [flat]);

  const clearSelection = () => { setSelected(new Set()); anchorRef.current = null; };

  const nextNumber = useCallback((p: "P" | "D") => {
    const used = p === "P" ? usedNumbers.plaintiff : usedNumbers.defendant;
    const markNums = marks.filter((m) => m.party === p).map((m) => m.number);
    return Math.max(0, ...used, ...markNums) + 1;
  }, [usedNumbers, marks]);

  const effectiveNumber = numberInput.trim() ? Math.max(1, Math.floor(Number(numberInput)) || 1) : nextNumber(party);
  const labelPreview = `${party}-${effectiveNumber}`;

  /* -------------------------------- saving ------------------------------- */

  const doSave = useCallback(async () => {
    const pages: PageRef[] = flat
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => selected.has(key(f.docId, f.page)))
      .sort((a, b) => a.i - b.i)
      .map(({ f }) => ({ docId: f.docId, page: f.page }));
    if (pages.length === 0) return;
    setSaving(true);
    setError(null);
    const r = await saveDesignation(setId, {
      party,
      number: numberInput.trim() ? effectiveNumber : undefined,
      title: title.trim() || undefined,
      pages,
    });
    setSaving(false);
    if (r.ok) {
      clearSelection();
      setTitle("");
      setNumberInput("");
      setBanner({ text: `Saved as ${r.label} in "${r.exhibitSetName}" (${pages.length} page${pages.length === 1 ? "" : "s"}).`, href: `/admin/exhibit-reviewer/${r.exhibitSetId}` });
      router.refresh();
    } else if ("code" in r && r.code === "no-exhibit-set") {
      setPromptCreate({ name: caseName });
    } else {
      setError(r.error ?? "Couldn't save the exhibit.");
    }
  }, [flat, selected, setId, party, numberInput, effectiveNumber, title, caseName, router]);

  async function confirmCreateExhibitSet(name: string) {
    setSaving(true);
    const r = await createLinkedExhibitSet(setId, name);
    setSaving(false);
    if (r.ok) {
      setPromptCreate(null);
      await doSave();
      router.refresh();
    } else {
      setError(r.error ?? "Couldn't create the exhibit set.");
      setPromptCreate(null);
    }
  }

  /* -------------------------------- upload ------------------------------- */

  async function uploadFiles(files: File[]) {
    const pdfs = files.filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (pdfs.length === 0) { setError("Drop PDF files (the Bates-stamped productions)."); return; }
    setError(null);
    setUploading({ done: 0, total: pdfs.length, current: pdfs[0].name });
    for (let i = 0; i < pdfs.length; i++) {
      const file = pdfs[i];
      setUploading({ done: i, total: pdfs.length, current: file.name });
      try {
        const blob = await upload(`discovery/${setId}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`, file, {
          access: "public", handleUploadUrl: "/api/admin/trial-upload", clientPayload: String(setId), multipart: true,
          contentType: "application/pdf",
        });
        const r = await addDiscoveryDoc(setId, { name: file.name, file: { url: blob.url, pathname: blob.pathname, contentType: "application/pdf", size: file.size } });
        if (!r.ok) setError(r.error ?? `Couldn't save "${file.name}".`);
      } catch (err) {
        setError(`Upload failed for "${file.name}": ${(err as Error).message}`);
      }
    }
    setUploading(null);
    router.refresh();
  }

  /* ------------------------------- keyboard ------------------------------ */

  useEffect(() => {
    if (view !== "reader") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") setReaderIdx((i) => Math.min(flat.length - 1, i + 1));
      if (e.key === "ArrowLeft") setReaderIdx((i) => Math.max(0, i - 1));
      if (e.key === "x" || e.key === "X") toggle(readerIdx, e.shiftKey);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, flat.length, readerIdx, toggle]);

  const totalPages = flat.length;
  const countsPending = docs.some((d) => !pageCounts[d.id]);

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); void uploadFiles(Array.from(e.dataTransfer.files)); }}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center border-4 border-dashed border-[var(--c-accent)] bg-[var(--c-accent)]/10">
          <p className="rounded-md bg-[var(--c-surface)] px-4 py-2 text-sm font-semibold">Drop the production PDFs to add them</p>
        </div>
      )}

      {/* ---- toolbar: view toggle, upload, selection bar ---- */}
      <div className="sticky top-0 z-30 border-b border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-md border border-[var(--c-border)]">
            <button onClick={() => setView("grid")} className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm ${view === "grid" ? "bg-[var(--c-accent)] text-[var(--c-on-accent)]" : "hover:bg-[var(--c-bg)]"}`}><Grid3x3 size={14} /> Grid</button>
            <button onClick={() => setView("reader")} disabled={totalPages === 0} className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm disabled:opacity-40 ${view === "reader" ? "bg-[var(--c-accent)] text-[var(--c-on-accent)]" : "hover:bg-[var(--c-bg)]"}`}><BookOpen size={14} /> Reader</button>
          </div>

          {view === "grid" && (
            <div className="inline-flex items-center overflow-hidden rounded-md border border-[var(--c-border)]" title="Zoom the page grid">
              <button onClick={() => changeCols(1)} disabled={cols >= 10} aria-label="Zoom out (more pages per row)"
                className="px-2.5 py-1.5 hover:bg-[var(--c-bg)] disabled:opacity-40"><ZoomOut size={15} /></button>
              <span className="min-w-[3.5rem] border-x border-[var(--c-border)] px-2 py-1.5 text-center text-xs text-[var(--c-ink-muted)]">{cols}/row</span>
              <button onClick={() => changeCols(-1)} disabled={cols <= 1} aria-label="Zoom in (fewer pages per row)"
                className="px-2.5 py-1.5 hover:bg-[var(--c-bg)] disabled:opacity-40"><ZoomIn size={15} /></button>
            </div>
          )}

          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--c-border)] px-3 py-1.5 text-sm hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
            {uploading ? `Uploading ${uploading.done + 1}/${uploading.total}…` : "Add discovery PDFs"}
            <input type="file" accept="application/pdf,.pdf" multiple className="hidden" disabled={!!uploading}
              onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ""; void uploadFiles(files); }} />
          </label>

          <span className="text-xs text-[var(--c-ink-muted)]">
            {docs.length} doc{docs.length === 1 ? "" : "s"} · {totalPages} page{totalPages === 1 ? "" : "s"}{countsPending ? " (counting…)" : ""}
          </span>

          {/* selection → save as exhibit */}
          <div className={`ml-auto flex flex-wrap items-center gap-2 rounded-md px-2 py-1 ${selected.size > 0 ? "bg-[var(--c-accent)]/10 ring-1 ring-[var(--c-accent)]/40" : ""}`}>
            <span className={`text-sm font-medium ${selected.size > 0 ? "" : "text-[var(--c-ink-muted)]"}`}>
              {selected.size > 0 ? `${selected.size} page${selected.size === 1 ? "" : "s"} selected` : "Check pages (Shift-click selects a range)"}
            </span>
            {selected.size > 0 && (
              <>
                <div className="inline-flex overflow-hidden rounded-md border border-[var(--c-border)]" title="Whose exhibit is this?">
                  <button onClick={() => setParty("P")} className={`px-2.5 py-1 text-xs font-bold ${party === "P" ? "bg-emerald-600 text-white" : "hover:bg-[var(--c-bg)]"}`}>P — ours</button>
                  <button onClick={() => setParty("D")} className={`px-2.5 py-1 text-xs font-bold ${party === "D" ? "bg-red-600 text-white" : "hover:bg-[var(--c-bg)]"}`}>D — theirs</button>
                </div>
                <input value={numberInput} onChange={(e) => setNumberInput(e.target.value.replace(/[^0-9]/g, ""))} placeholder={String(nextNumber(party))}
                  className="w-14 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1 text-center text-sm outline-none focus:border-[var(--c-accent)]" title="Exhibit number" />
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)"
                  className="w-40 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1 text-sm outline-none focus:border-[var(--c-accent)]" />
                <button onClick={() => void doSave()} disabled={saving}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-semibold text-white shadow disabled:opacity-60 ${party === "P" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save as Exhibit {labelPreview}
                </button>
                <button onClick={clearSelection} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]" title="Clear selection"><X size={15} /></button>
              </>
            )}
          </div>
        </div>

        {banner && (
          <div className="mt-2 flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            <Check size={15} /> {banner.text}
            {banner.href && <Link href={banner.href} className="inline-flex items-center gap-1 font-semibold underline">Open in Exhibit Reviewer <ExternalLink size={13} /></Link>}
            <button onClick={() => setBanner(null)} className="ml-auto"><X size={14} /></button>
          </div>
        )}
        {error && (
          <div className="mt-2 flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">
            {error}
            <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
          </div>
        )}
      </div>

      {/* ---- body ---- */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {docs.length === 0 ? (
          <div className="mx-auto mt-10 max-w-md rounded-lg border-2 border-dashed border-[var(--c-border)] p-10 text-center text-sm text-[var(--c-ink-muted)]">
            <UploadCloud className="mx-auto mb-3 text-[var(--c-ink-muted)]" size={28} />
            Drop the other side&apos;s production PDFs anywhere on this page (or use <strong>Add discovery PDFs</strong> above). Then check pages and save them as exhibits.
          </div>
        ) : view === "grid" ? (
          <GridView
            docs={docs} setIdForLinks={setId} cols={cols} pageCounts={pageCounts} flatIndex={flatIndex} selected={selected} badges={badges}
            getDoc={getDoc} onToggle={toggle}
            onOpen={(idx) => { setReaderIdx(idx); setView("reader"); }}
            onDeleteDoc={(d) => {
              const used = marks.some((m) => m.pages.some((p) => p.docId === d.id));
              if (confirm(`Remove "${d.name}" from this case?${used ? " Its saved exhibits stay in the Exhibit Reviewer, but the page badges for it will disappear." : ""}`)) {
                void deleteDiscoveryDoc(d.id).then(() => router.refresh());
              }
            }}
          />
        ) : (
          flat[readerIdx] && (
            <ReaderView
              flat={flat} idx={readerIdx} setIdx={setReaderIdx} selected={selected} badges={badges}
              getDoc={getDoc} onToggle={toggle}
            />
          )
        )}

        {/* ---- designations ledger ---- */}
        {marks.length > 0 && (
          <div className="mx-auto mt-8 max-w-3xl">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--c-accent)]">Exhibits designated from this discovery</h3>
            <div className="divide-y divide-[var(--c-border)] rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]">
              {marks.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className={`inline-flex min-w-[3rem] justify-center rounded-full px-2 py-0.5 text-xs font-bold text-white ${m.party === "P" ? "bg-emerald-600" : "bg-red-600"}`}>{m.label}</span>
                  <span className="min-w-0 flex-1 truncate">{m.title || `${m.pages.length} page${m.pages.length === 1 ? "" : "s"}`}</span>
                  <span className="text-xs text-[var(--c-ink-muted)]">{m.pages.length} pg</span>
                  {m.exhibitSetId && (
                    <Link href={`/admin/exhibit-reviewer/${m.exhibitSetId}`} className="text-[var(--c-accent)]" title="Open in Exhibit Reviewer"><ExternalLink size={14} /></Link>
                  )}
                  <button onClick={() => { if (confirm(`Remove designation ${m.label}? The assembled exhibit is removed from the Exhibit Reviewer too.`)) void deleteDesignation(m.id).then(() => router.refresh()); }}
                    className="text-[var(--c-ink-muted)] hover:text-red-600" title="Remove designation"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ---- "create the linked exhibit set" prompt ---- */}
      {promptCreate && (
        <CreateExhibitSetDialog
          matter={matter}
          initialName={promptCreate.name}
          busy={saving}
          onCancel={() => setPromptCreate(null)}
          onConfirm={(name) => void confirmCreateExhibitSet(name)}
        />
      )}
    </div>
  );
}

/* -------------------------------- grid --------------------------------- */

function GridView({ docs, cols, pageCounts, flatIndex, selected, badges, getDoc, onToggle, onOpen, onDeleteDoc, setIdForLinks }: {
  docs: DocMeta[];
  cols: number;
  setIdForLinks: number;
  pageCounts: Record<number, number>;
  flatIndex: Map<string, number>;
  selected: Set<string>;
  badges: Map<string, { party: "P" | "D"; label: string }[]>;
  getDoc: (docId: number) => Promise<PDFDocumentProxy>;
  onToggle: (idx: number, shift: boolean) => void;
  onOpen: (idx: number) => void;
  onDeleteDoc: (d: DocMeta) => void;
}) {
  return (
    <div className="space-y-6">
      {docs.map((d) => {
        const n = pageCounts[d.id] ?? 0;
        return (
          <section key={d.id}>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold">{d.name}</h3>
              <span className="text-xs text-[var(--c-ink-muted)]">{n ? `${n} page${n === 1 ? "" : "s"}` : "counting pages…"}</span>
              <a href={`/admin/discovery-reviewer/${setIdForLinks}/doc/${d.id}`} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[var(--c-accent)] hover:underline" title="Open the untouched original PDF in a new tab">
                <ExternalLink size={12} /> original
              </a>
              <button onClick={() => onDeleteDoc(d)} className="ml-auto rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600" title="Remove this document"><Trash2 size={14} /></button>
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {Array.from({ length: n }, (_, i) => i + 1).map((page) => {
                const k = key(d.id, page);
                const idx = flatIndex.get(k)!;
                return (
                  <PageCell key={k} docId={d.id} page={page} idx={idx} checked={selected.has(k)} badges={badges.get(k)}
                    renderW={cols >= 8 ? 220 : cols >= 6 ? 300 : cols >= 4 ? 460 : cols >= 2 ? 720 : 1200}
                    getDoc={getDoc} onToggle={onToggle} onOpen={onOpen} />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function PageCell({ docId, page, idx, checked, badges, renderW, getDoc, onToggle, onOpen }: {
  docId: number; page: number; idx: number; checked: boolean;
  badges?: { party: "P" | "D"; label: string }[];
  /** Canvas render width, bucketed by grid density so zooming in re-renders sharper. */
  renderW: number;
  getDoc: (docId: number) => Promise<PDFDocumentProxy>;
  onToggle: (idx: number, shift: boolean) => void;
  onOpen: (idx: number) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const [inView, setInView] = useState(false);
  const renderedW = useRef(0);
  const seqRef = useRef(0);
  const taskRef = useRef<{ cancel: () => void } | null>(null);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setInView(true);
        io.disconnect();
      }
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || renderedW.current === renderW) return;
    const seq = ++seqRef.current;
    void (async () => {
      try {
        const doc = await getDoc(docId);
        const pdfPage = await doc.getPage(page);
        if (seq !== seqRef.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({ scale: renderW / base.width });
        // A canvas can only host one pdf.js render at a time; cancel any
        // in-flight pass (e.g. the user zoomed twice quickly).
        taskRef.current?.cancel();
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const task = pdfPage.render({ canvas, viewport });
        taskRef.current = task;
        await task.promise;
        if (seq !== seqRef.current) return;
        renderedW.current = renderW;
        setState("done");
      } catch (err) {
        if (seq === seqRef.current) {
          console.error("[discovery] thumbnail render failed:", err);
          setState("error");
        }
      }
    })();
  }, [inView, renderW, docId, page, getDoc]);

  return (
    <div ref={holder}
      className={`group relative aspect-[8.5/11] cursor-pointer overflow-hidden rounded-md border bg-white shadow-sm ${checked ? "border-[var(--c-accent)] ring-2 ring-[var(--c-accent)]" : "border-[var(--c-border)]"}`}
      onClick={(e) => onToggle(idx, e.shiftKey)}
      onDoubleClick={() => onOpen(idx)}
      title="Click to check · Shift-click to check a range · Double-click to read"
    >
      <canvas ref={canvasRef} className="h-full w-full object-contain" />
      {state === "idle" && <div className="absolute inset-0 flex items-center justify-center bg-[var(--c-bg)]"><Loader2 size={16} className="animate-spin text-[var(--c-ink-muted)]" /></div>}
      {state === "error" && <div className="absolute inset-0 flex items-center justify-center bg-[var(--c-bg)] text-xs text-[var(--c-ink-muted)]">page {page}</div>}

      {/* checkbox */}
      <span className={`absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded border bg-white shadow ${checked ? "border-[var(--c-accent)] bg-[var(--c-accent)] text-white" : "border-[var(--c-border)] text-transparent group-hover:border-[var(--c-accent)]"}`}>
        <Check size={13} strokeWidth={3} className={checked ? "text-white" : ""} />
      </span>

      {/* designation half-bubbles, hugging the right edge */}
      {badges && badges.length > 0 && (
        <div className="absolute right-0 top-1.5 flex flex-col items-end gap-1">
          {badges.slice(0, 4).map((b, i) => (
            <span key={i} className={`rounded-l-full py-0.5 pl-2 pr-1 text-[10px] font-bold leading-none text-white shadow ${b.party === "P" ? "bg-emerald-600" : "bg-red-600"}`}>
              {b.label}
            </span>
          ))}
        </div>
      )}

      <span className="absolute bottom-1 right-1.5 rounded bg-black/55 px-1 text-[10px] leading-4 text-white">{page}</span>
    </div>
  );
}

/* ------------------------------- reader --------------------------------- */

function ReaderView({ flat, idx, setIdx, selected, badges, getDoc, onToggle }: {
  flat: { docId: number; page: number; docName: string }[];
  idx: number;
  setIdx: (updater: (i: number) => number) => void;
  selected: Set<string>;
  badges: Map<string, { party: "P" | "D"; label: string }[]>;
  getDoc: (docId: number) => Promise<PDFDocumentProxy>;
  onToggle: (idx: number, shift: boolean) => void;
}) {
  const cur = flat[idx];
  const k = key(cur.docId, cur.page);
  const checked = selected.has(k);
  const pageBadges = badges.get(k);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendering, setRendering] = useState(true);
  const renderSeq = useRef(0);
  const readerTaskRef = useRef<{ cancel: () => void } | null>(null);

  useEffect(() => {
    const seq = ++renderSeq.current;
    setRendering(true);
    void (async () => {
      try {
        const doc = await getDoc(cur.docId);
        const pdfPage = await doc.getPage(cur.page);
        if (seq !== renderSeq.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const cssW = Math.min(940, Math.max(480, (canvas.parentElement?.clientWidth ?? 800) - 16));
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const viewport = pdfPage.getViewport({ scale: (cssW / base.width) * dpr });
        readerTaskRef.current?.cancel();
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.width = `${cssW}px`;
        const task = pdfPage.render({ canvas, viewport });
        readerTaskRef.current = task;
        await task.promise;
      } catch {
        /* leave the previous frame */
      } finally {
        if (seq === renderSeq.current) setRendering(false);
      }
    })();
  }, [cur.docId, cur.page, getDoc]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-3 flex flex-wrap items-center justify-center gap-3">
        <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} className="rounded-md border border-[var(--c-border)] p-1.5 disabled:opacity-40 hover:border-[var(--c-accent)]"><ChevronLeft size={16} /></button>
        <span className="text-sm">
          Page <strong>{idx + 1}</strong> of {flat.length}
          <span className="ml-2 text-xs text-[var(--c-ink-muted)]">{cur.docName} · p. {cur.page}</span>
        </span>
        <button onClick={() => setIdx((i) => Math.min(flat.length - 1, i + 1))} disabled={idx >= flat.length - 1} className="rounded-md border border-[var(--c-border)] p-1.5 disabled:opacity-40 hover:border-[var(--c-accent)]"><ChevronRight size={16} /></button>

        <button onClick={(e) => onToggle(idx, e.shiftKey)}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium ${checked ? "border-[var(--c-accent)] bg-[var(--c-accent)] text-[var(--c-on-accent)]" : "border-[var(--c-border)] hover:border-[var(--c-accent)]"}`}
          title="Check this page (Shift-click checks the range from your last check; keyboard: X, Shift+X)">
          <Check size={14} /> {checked ? "Checked" : "Check page"}
        </button>

        {pageBadges && pageBadges.length > 0 && (
          <span className="inline-flex items-center gap-1">
            {pageBadges.map((b, i) => (
              <span key={i} className={`rounded-full px-2 py-0.5 text-[11px] font-bold text-white ${b.party === "P" ? "bg-emerald-600" : "bg-red-600"}`}>{b.label}</span>
            ))}
          </span>
        )}
      </div>

      <div className={`relative mx-auto w-fit overflow-hidden rounded-md border bg-white shadow ${checked ? "ring-2 ring-[var(--c-accent)] border-[var(--c-accent)]" : "border-[var(--c-border)]"}`}>
        <canvas ref={canvasRef} />
        {rendering && <div className="absolute inset-0 flex items-center justify-center bg-white/60"><Loader2 size={20} className="animate-spin text-[var(--c-ink-muted)]" /></div>}
        {pageBadges && pageBadges.length > 0 && (
          <div className="absolute right-0 top-3 flex flex-col items-end gap-1">
            {pageBadges.map((b, i) => (
              <span key={i} className={`rounded-l-full py-1 pl-2.5 pr-1.5 text-xs font-bold leading-none text-white shadow ${b.party === "P" ? "bg-emerald-600" : "bg-red-600"}`}>{b.label}</span>
            ))}
          </div>
        )}
      </div>
      <p className="mt-2 text-center text-xs text-[var(--c-ink-muted)]">← → to turn pages · X checks a page · Shift extends the range</p>
    </div>
  );
}

/* --------------------- create-linked-exhibit-set dialog ------------------ */

function CreateExhibitSetDialog({ matter, initialName, busy, onCancel, onConfirm }: {
  matter: string; initialName: string; busy: boolean;
  onCancel: () => void; onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className="w-full max-w-md rounded-lg border border-[var(--c-accent)] bg-[var(--c-surface)] p-5">
        <h3 className="font-[family-name:var(--font-display)] text-lg">No exhibit set for this case yet</h3>
        <p className="mt-2 text-sm text-[var(--c-ink-muted)]">
          Matter <strong>{matter}</strong> has no exhibit set in the Exhibit Reviewer. Create it now and this exhibit will be filed there.
        </p>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-xs font-semibold">Exhibit set name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
            className="w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]" />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} disabled={busy} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
          <button onClick={() => onConfirm(name)} disabled={busy || !name.trim()} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create &amp; save exhibit
          </button>
        </div>
      </div>
    </div>
  );
}
