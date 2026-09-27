"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UploadCloud,
  BookOpen, Check, ChevronLeft, ChevronRight, Copy, Eraser, ExternalLink, FileText, Grid3x3, Highlighter, Loader2, MousePointer2, Pencil, Send, Square, Stamp, StickyNote, Trash2, Wrench, X, ZoomIn, ZoomOut,
} from "lucide-react";
import { upload } from "@vercel/blob/client";
import { loadPdfjs } from "./DiscoveryReviewer";
import { ProductionContents, type TocEntry } from "./ProductionContents";
import { addDiscoveryDoc, addDiscoveryAnnotation, deleteDiscoveryAnnotation, listFileAnnotations,
  stageForProduction, unstageProductionDoc, prepareProduction, finalizeProduction, discardProductionDraft, updateRequestDeadlines, setDiscoveryDocBucket,
  type FileAnnotation, type AnnotationKind, type StageSelection,
} from "@/app/admin/(panel)/discovery-reviewer/actions";
import type { StampStyle } from "@/lib/production/build";

const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";

export type ClientFile = { key: string; name: string; dir: string; folderId: number | null; folderName: string; createdAt: string; status: "" | "staged" | "produced"; movedFromOpposing?: boolean };
export type StagedDoc = { id: number; name: string; requestLabel: string; url: string | null; batesPrefix: string; batesStart: number; batesEnd: number; productionId: number | null; sourceKey: string; sourcePages: number[]; status: "staged" | "produced" };
export type ProductionRow = { id: number; label: string; batesPrefix: string; batesStart: number; batesEnd: number; producedAt: string | null; letterUrl: string | null; fileUrl: string | null; fileName: string; token: string };
export type RequestRow = { folderId: number; who: string; sentAt: string; responseDue: string; clientDue: string; files: number; rfp: boolean };

export const bates = (prefix: string, n: number) => `${prefix}${String(n).padStart(6, "0")}`;
const fmtDay = (iso: string) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

/* --------------------------- request tracker ----------------------------- */

/** The sent-requests ledger under the "Request documents from client" button,
 *  ordered by the date we need the documents back from the client. */
export function RequestTracker({ requests }: { requests: RequestRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<number | null>(null);
  const [resp, setResp] = useState("");
  const [client, setClient] = useState("");
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(() => [...requests].sort((a, b) => (a.clientDue || "9999").localeCompare(b.clientDue || "9999")), [requests]);
  if (sorted.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="w-full max-w-md rounded-md border border-[var(--c-border)] bg-[var(--c-bg)]/60 p-2">
      <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--c-ink-muted)]">Document requests sent</p>
      <div className="max-h-40 space-y-1 overflow-y-auto">
        {sorted.map((r) => (
          <div key={r.folderId} className="rounded border border-[var(--c-border)] bg-[var(--c-surface)] px-2 py-1.5 text-xs">
            {editing === r.folderId ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <label className="flex items-center gap-1">client due <input type="date" value={client} onChange={(e) => setClient(e.target.value)} className={`${input} px-1.5 py-0.5 text-xs`} /></label>
                <label className="flex items-center gap-1">response <input type="date" value={resp} onChange={(e) => setResp(e.target.value)} className={`${input} px-1.5 py-0.5 text-xs`} /></label>
                <button disabled={busy} onClick={async () => { setBusy(true); await updateRequestDeadlines(r.folderId, resp, client); setBusy(false); setEditing(null); router.refresh(); }}
                  className="rounded p-1 text-emerald-600" title="Save">{busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}</button>
                <button onClick={() => setEditing(null)} className="rounded p-1 text-[var(--c-ink-muted)]"><X size={13} /></button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href={`/admin/share-folders/${r.folderId}`} className="min-w-0 flex-1 hover:text-[var(--c-accent)]" title="Open the folder the client is working in">
                  <span className="font-medium">{r.rfp ? "Discovery request" : "Document request"}</span> sent to <span className="font-medium">{r.who}</span> on {fmtDay(r.sentAt)}
                  <span className="block text-[var(--c-ink-muted)]">
                    {r.clientDue && <span className={r.clientDue < today ? "font-semibold text-red-600" : ""}>client due {fmtDay(r.clientDue)}</span>}
                    {r.clientDue && r.responseDue && " · "}
                    {r.responseDue && <>response due {fmtDay(r.responseDue)}</>}
                    {(r.clientDue || r.responseDue) && " · "}{r.files} file{r.files === 1 ? "" : "s"}
                  </span>
                </Link>
                <button onClick={() => { setEditing(r.folderId); setResp(r.responseDue); setClient(r.clientDue); }}
                  className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Edit deadlines"><Pencil size={12} /></button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------- pipeline views ------------------------------ */

export type PipelineContents = { toc: string; notes: string; tocFile: string };

export function ProductionPipeline({ mode, setId, clientFiles, staged, prods, batesDefaults, contents }: {
  mode: "received" | "staged" | "produced";
  setId: number;
  clientFiles: ClientFile[];
  staged: StagedDoc[];
  prods: ProductionRow[];
  batesDefaults: { prefix: string; nextStart: number };
  contents: PipelineContents;
}) {
  if (mode === "received") return <ReceivedView setId={setId} files={clientFiles} stagedDocs={staged} batesDefaults={batesDefaults} contents={contents} />;
  if (mode === "staged") return <StagedView setId={setId} staged={staged} prods={prods} contents={contents} />;
  return <ProducedView setId={setId} staged={staged} prods={prods} contents={contents} />;
}

/** The staged/produced PDF most likely to be "the review set" the table of
 *  contents was written against: the widest Bates span with a file, else
 *  the first with a file. */
function likelyMainDoc(rows: StagedDoc[]): StagedDoc | null {
  const withUrl = rows.filter((d) => d.url);
  if (!withUrl.length) return null;
  return [...withUrl].sort((a, b) => (b.batesEnd - b.batesStart) - (a.batesEnd - a.batesStart))[0];
}

/* ---- pale red: everything the client dropped, page-level like opposing ---- */

const fileKind = (name: string): "pdf" | "image" | "other" => {
  if (/\.pdf$/i.test(name)) return "pdf";
  if (/\.(jpe?g|png)$/i.test(name)) return "image";
  return "other";
};

/** A selected page's key in the selection set: "<fileKey>#<page>". */
const pk = (key: string, page: number) => `${key}#${page}`;

export type PageMark = "" | "staged" | "produced";

function ReceivedView({ setId, files, stagedDocs, batesDefaults, contents }: { setId: number; files: ClientFile[]; stagedDocs: StagedDoc[]; batesDefaults: { prefix: string; nextStart: number }; contents: PipelineContents }) {
  const router = useRouter();
  const [view, setView] = useState<"grid" | "reader" | "docs">("grid");
  const [cols, setCols] = useState(5);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reader, setReader] = useState<{ docIdx: number; page: number }>({ docIdx: 0, page: 1 });
  const [dialog, setDialog] = useState(false);
  const [doBates, setDoBates] = useState(true);
  const [prefix, setPrefix] = useState(batesDefaults.prefix);
  const [start, setStart] = useState(String(batesDefaults.nextStart));
  const [stampStyle, setStampStyle] = useState<Required<StampStyle>>({ position: "bottom-right", font: "helvetica", color: "black", size: 10 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number; current: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pageCounts, setPageCounts] = useState<Record<string, number>>({});
  const anchor = useRef<{ key: string; page: number } | null>(null);
  const [annos, setAnnos] = useState<Record<string, FileAnnotation[]>>({});

  // Which pages of which source files are already staged/produced, so a
  // 700-page PDF can go over in slices and the sent slices show their stamp.
  const pageMarks = useMemo(() => {
    const m = new Map<string, Map<number, PageMark>>();
    for (const d of stagedDocs) {
      if (!d.sourceKey || !d.sourcePages.length) continue;
      const mm = m.get(d.sourceKey) ?? new Map<number, PageMark>();
      for (const p of d.sourcePages) mm.set(p, d.status === "produced" || mm.get(p) === "produced" ? "produced" : "staged");
      m.set(d.sourceKey, mm);
    }
    return m;
  }, [stagedDocs]);
  const pageMark = useCallback((f: ClientFile, page: number): PageMark => f.status || (pageMarks.get(f.key)?.get(page) ?? ""), [pageMarks]);

  const notePages = useCallback((key: string, n: number) => setPageCounts((prev) => (prev[key] === n ? prev : { ...prev, [key]: n })), []);

  /** Direct uploads into the red pile — for when the firm itself has the
   *  client's documents in hand (the client portal remains the other door). */
  async function uploadClientFiles(all: File[]) {
    const okFiles = all.filter((f) => /\.(pdf|jpe?g|png)$/i.test(f.name));
    if (okFiles.length === 0) { setError("Drop PDFs or photos (JPG/PNG)."); return; }
    setError(null);
    setUploading({ done: 0, total: okFiles.length, current: okFiles[0].name });
    for (let i = 0; i < okFiles.length; i++) {
      const file = okFiles[i];
      setUploading({ done: i, total: okFiles.length, current: file.name });
      try {
        const blob = await upload(`discovery/${setId}/client/${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`, file, {
          access: "public", handleUploadUrl: "/api/admin/trial-upload", clientPayload: String(setId), multipart: true,
          contentType: file.type || undefined,
        });
        const r = await addDiscoveryDoc(setId, { name: file.name, file: { url: blob.url, pathname: blob.pathname, contentType: file.type || undefined, size: file.size }, bucket: "client" });
        if (!r.ok) setError(r.error ?? `Couldn't save "${file.name}".`);
      } catch (err) {
        setError(`Upload failed for "${file.name}": ${(err as Error).message}`);
      }
    }
    setUploading(null);
    setNotice(`${okFiles.length} document${okFiles.length === 1 ? "" : "s"} added to Received from Client.`);
    router.refresh();
  }

  // one pdf.js proxy per document, shared by grid + reader
  const proxies = useRef(new Map<string, Promise<import("pdfjs-dist").PDFDocumentProxy>>());
  const proxyUrl = useCallback((f: ClientFile) =>
    f.key.startsWith("share:")
      ? `/admin/discovery-reviewer/${setId}/client-file/${f.key.slice(6)}`
      : `/admin/discovery-reviewer/${setId}/doc/${f.key.slice(4)}`, [setId]);
  const getDoc = useCallback((f: ClientFile) => {
    let p = proxies.current.get(f.key);
    if (!p) {
      p = loadPdfjs().then((lib) => lib.getDocument({
        url: proxyUrl(f), wasmUrl: "/pdfjs/wasm/", iccUrl: "/pdfjs/iccs/", cMapUrl: "/pdfjs/cmaps/", standardFontDataUrl: "/pdfjs/standard_fonts/",
      }).promise);
      proxies.current.set(f.key, p);
    }
    return p;
  }, [proxyUrl]);

  /** Click = one page. Shift-click = the range from the last clicked page. */
  const togglePage = (f: ClientFile, page: number, shiftKey = false) => {
    if (pageMark(f, page)) return;
    const next = new Set(selected);
    const a = anchor.current;
    if (shiftKey && a && a.key === f.key && a.page !== page) {
      const [lo, hi] = [Math.min(a.page, page), Math.max(a.page, page)];
      for (let p = lo; p <= hi; p++) if (!pageMark(f, p)) next.add(pk(f.key, p));
    } else {
      const k = pk(f.key, page);
      if (next.has(k)) next.delete(k); else next.add(k);
    }
    anchor.current = { key: f.key, page };
    setSelected(next);
  };

  /** Header checkbox / documents-view card: whole document at once. */
  const toggleDoc = async (f: ClientFile) => {
    if (f.status) return;
    let n = fileKind(f.name) === "pdf" ? pageCounts[f.key] ?? 0 : 1;
    if (!n && fileKind(f.name) === "pdf") {
      try { n = (await getDoc(f)).numPages; notePages(f.key, n); } catch { return; }
    }
    if (!n) n = 1;
    const free: number[] = [];
    for (let p = 1; p <= n; p++) if (!pageMark(f, p)) free.push(p);
    if (!free.length) return;
    const allSel = free.every((p) => selected.has(pk(f.key, p)));
    const next = new Set(selected);
    for (const p of free) { if (allSel) next.delete(pk(f.key, p)); else next.add(pk(f.key, p)); }
    anchor.current = { key: f.key, page: free[free.length - 1] };
    setSelected(next);
  };

  // Selection tallies for the toolbar and the staging dialog.
  const selByKey = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const s of selected) {
      const i = s.lastIndexOf("#");
      const key = s.slice(0, i), p = Number(s.slice(i + 1));
      const list = m.get(key) ?? [];
      list.push(p);
      m.set(key, list);
    }
    return m;
  }, [selected]);

  async function submit() {
    setBusy(true);
    setError(null);
    const selections: StageSelection[] = [];
    for (const [key, pages] of selByKey) {
      const f = files.find((x) => x.key === key);
      if (f && fileKind(f.name) === "pdf") selections.push({ key, pages: [...pages].sort((a, b) => a - b) });
      else selections.push({ key });
    }
    const r = await stageForProduction(setId, selections, {
      bates: doBates, prefix, start: Number(start) || undefined,
      stamp: doBates ? stampStyle : undefined,
    });
    setBusy(false);
    if (r.ok) {
      setDialog(false);
      setSelected(new Set());
      setNotice(`${r.staged} document${r.staged === 1 ? "" : "s"} ${doBates ? "Bates-labeled and " : ""}moved to "To be produced".${r.skipped.length ? ` Skipped: ${r.skipped.join("; ")}` : ""}`);
      router.refresh();
    } else setError(r.error ?? "Couldn't stage the documents.");
  }

  const openStageDialog = () => { setDoBates(true); setPrefix(batesDefaults.prefix); setStart(String(batesDefaults.nextStart)); setDialog(true); };

  // ---- review marks (highlighter / redaction / notes), cached per file ----
  const loadedAnnos = useRef(new Set<string>());
  const ensureAnnos = useCallback(async (key: string) => {
    if (loadedAnnos.current.has(key)) return;
    loadedAnnos.current.add(key);
    const r = await listFileAnnotations(setId, key);
    if (r.ok) setAnnos((prev) => ({ ...prev, [key]: r.annotations }));
    else loadedAnnos.current.delete(key);
  }, [setId]);
  const addAnno = async (key: string, page: number, kind: AnnotationKind, rect: { x: number; y: number; w: number; h: number }, note?: string) => {
    const r = await addDiscoveryAnnotation(setId, key, page, kind, rect, note);
    if (r.ok) setAnnos((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), r.annotation] }));
    else setError(r.error ?? "Couldn't save the mark.");
  };
  const delAnno = async (key: string, id: number) => {
    setAnnos((prev) => ({ ...prev, [key]: (prev[key] ?? []).filter((a) => a.id !== id) }));
    const r = await deleteDiscoveryAnnotation(setId, id);
    if (!r.ok) void ensureAnnos(key); // resync on failure
  };

  const viewBtn = (m: "grid" | "reader" | "docs", label: string, icon: React.ReactNode) => (
    <button onClick={() => setView(m)} disabled={m !== "docs" && files.length === 0}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm disabled:opacity-40 ${view === m ? "bg-[var(--c-accent)] text-[var(--c-on-accent)]" : "hover:bg-[var(--c-bg)]"}`}>
      {icon} {label}
    </button>
  );

  // The TOC's jump target: the designated file, else the first PDF.
  const pdfFiles = files.filter((f) => fileKind(f.name) === "pdf");
  const tocTarget = pdfFiles.find((f) => f.key === contents.tocFile) ?? pdfFiles[0] ?? null;
  const jumpToPage = (page: number) => {
    if (!tocTarget) return;
    setReader({ docIdx: files.findIndex((x) => x.key === tocTarget.key), page });
    setView("reader");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ProductionContents setId={setId} mode="received" toc={contents.toc} notes={contents.notes} tocFile={contents.tocFile}
        fileChoices={pdfFiles.map((f) => ({ key: f.key, name: f.name }))} onJump={jumpToPage} />
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-2 mt-3">
        <div className="inline-flex overflow-hidden rounded-md border border-[var(--c-border)]">
          {viewBtn("grid", "Grid", <Grid3x3 size={14} />)}
          {viewBtn("reader", "Reader", <BookOpen size={14} />)}
          {viewBtn("docs", "Documents", <FileText size={14} />)}
        </div>
        {view === "grid" && (
          <div className="inline-flex items-center overflow-hidden rounded-md border border-[var(--c-border)]" title="Zoom the page grid">
            <button onClick={() => setCols((c) => Math.min(10, c + 1))} disabled={cols >= 10} className="px-2.5 py-1.5 hover:bg-[var(--c-bg)] disabled:opacity-40"><ZoomOut size={15} /></button>
            <span className="min-w-[3.5rem] border-x border-[var(--c-border)] px-2 py-1.5 text-center text-xs text-[var(--c-ink-muted)]">{cols}/row</span>
            <button onClick={() => setCols((c) => Math.max(1, c - 1))} disabled={cols <= 1} className="px-2.5 py-1.5 hover:bg-[var(--c-bg)] disabled:opacity-40"><ZoomIn size={15} /></button>
          </div>
        )}
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--c-border)] px-3 py-1.5 text-sm hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]">
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
          {uploading ? `Uploading ${uploading.done + 1}/${uploading.total}…` : "Add client documents"}
          <input type="file" accept=".pdf,image/jpeg,image/png" multiple className="hidden" disabled={!!uploading}
            onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; void uploadClientFiles(fs); }} />
        </label>
        <span className="text-xs text-[var(--c-ink-muted)]">Click a page to select it · Shift-click another page for the range · double-click to read.</span>
        <div className={`ml-auto flex items-center gap-2 rounded-md px-2 py-1 ${selected.size ? "bg-[var(--c-accent)]/10 ring-1 ring-[var(--c-accent)]/40" : ""}`}>
          {selected.size > 0 && <span className="text-sm font-medium">{selected.size} page{selected.size === 1 ? "" : "s"} · {selByKey.size} doc{selByKey.size === 1 ? "" : "s"}</span>}
          <button onClick={openStageDialog} disabled={selected.size === 0}
            className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-50">
            <Stamp size={15} /> Intend to produce{selected.size ? ` (${selected.size} pp.)` : ""}
          </button>
        </div>
      </div>

      <div className={`min-h-0 flex-1 overflow-y-auto p-4 ${dragOver ? "ring-2 ring-inset ring-[var(--c-accent)] bg-[var(--c-accent)]/5" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void uploadClientFiles(Array.from(e.dataTransfer.files)); }}>
        {notice && (
          <p className="mb-3 flex items-start gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            <Check size={15} className="mt-0.5 shrink-0" /> {notice} <button onClick={() => setNotice(null)} className="ml-auto"><X size={14} /></button>
          </p>
        )}
        {error && (
          <p className="mb-3 flex items-start gap-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">
            {error} <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
          </p>
        )}
        {files.length === 0 ? (
          <p className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center text-sm text-[var(--c-ink-muted)]">
            Nothing here yet. Drag &amp; drop the client&apos;s documents anywhere on this area (or use <strong>Add client documents</strong> above) — or send a document request and their uploads land here on their own.
          </p>
        ) : view === "reader" ? (
          <ClientReader files={files} state={reader} setState={setReader} selected={selected} pageMark={pageMark}
            onTogglePage={togglePage} getDoc={getDoc} proxyUrl={proxyUrl}
            annos={annos} ensureAnnos={ensureAnnos} addAnno={addAnno} delAnno={delAnno}
            onStageFromTools={(f) => {
              if (selected.size === 0 && !pageMark(f, reader.page)) togglePage(f, reader.page);
              openStageDialog();
            }} />
        ) : view === "grid" ? (
          <div className="space-y-6">
            {files.map((f) => (
              <ClientDocSection key={f.key} f={f} cols={cols} selected={selected} pageMark={pageMark}
                onTogglePage={togglePage} onToggleDoc={() => void toggleDoc(f)} onPagesKnown={notePages}
                onOpen={(page) => { setReader({ docIdx: files.findIndex((x) => x.key === f.key), page }); setView("reader"); }}
                getDoc={getDoc} proxyUrl={proxyUrl} />
            ))}
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {files.map((f) => {
              const selPages = selByKey.get(f.key)?.length ?? 0;
              const sel = selPages > 0;
              const locked = !!f.status;
              return (
                <button key={f.key} onClick={() => void toggleDoc(f)}
                  className={`relative rounded-lg border bg-[var(--c-surface)] p-3 text-left transition-shadow ${sel ? "border-[var(--c-accent)] ring-2 ring-[var(--c-accent)]" : "border-[var(--c-border)]"} ${locked ? "opacity-70" : "hover:shadow"}`}>
                  <div className="flex items-start gap-2">
                    <FileText size={17} className="mt-0.5 shrink-0 text-[var(--c-accent)]" />
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium leading-snug">{f.name}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--c-ink-muted)]">
                        {f.dir && <span className="rounded-full bg-[var(--c-accent)]/10 px-1.5 py-0.5 font-semibold text-[var(--c-accent)]">{f.dir}</span>}
                        {f.movedFromOpposing && <span className="rounded-full bg-[var(--c-border)] px-1.5 py-0.5">moved from opposing</span>}
                        <span>{fmtDay(f.createdAt.slice(0, 10))}</span>
                        {f.movedFromOpposing && !locked && (
                          <span role="button" tabIndex={0}
                            onClick={async (e) => { e.stopPropagation(); if (confirm(`Move "${f.name}" back to Opposing production?`)) { await setDiscoveryDocBucket(Number(f.key.slice(4)), "opposing"); router.refresh(); } }}
                            className="cursor-pointer text-[var(--c-accent)] underline">move back</span>
                        )}
                      </p>
                    </div>
                  </div>
                  {f.status ? (
                    <span className={`absolute right-2 top-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${f.status === "produced" ? "bg-green-200 text-green-900" : "bg-yellow-200 text-yellow-900"}`}>
                      {f.status === "produced" ? "produced" : "TBP →"}
                    </span>
                  ) : (pageMarks.get(f.key)?.size ?? 0) > 0 ? (
                    <span className="absolute right-2 top-2 rounded-full bg-yellow-200 px-1.5 py-0.5 text-[10px] font-bold text-yellow-900">
                      {pageMarks.get(f.key)!.size} pp. TBP →
                    </span>
                  ) : sel ? (
                    <span className="absolute right-2 top-2 rounded-full bg-[var(--c-accent)]/15 px-1.5 py-0.5 text-[10px] font-bold text-[var(--c-accent)]">{selPages} pp. selected</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {dialog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget && !busy) setDialog(false); }}>
          <div className="w-full max-w-md rounded-lg border border-[var(--c-accent)] bg-[var(--c-surface)] p-5">
            <h3 className="font-[family-name:var(--font-display)] text-lg">Stage for production</h3>
            <p className="mt-1 text-sm text-[var(--c-ink-muted)]">
              The {selected.size} selected page{selected.size === 1 ? "" : "s"} (across {selByKey.size} document{selByKey.size === 1 ? "" : "s"}) will move to <strong>Documents to be produced</strong>. Pages you didn&apos;t select stay here for a later batch.
            </p>
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" checked={doBates} onChange={(e) => setDoBates(e.target.checked)} className="mt-0.5 accent-[var(--c-accent)]" />
              <span>
                <span className="font-semibold">Do you want to Bates label these documents?</span>
                <span className="block text-xs text-[var(--c-ink-muted)]">Uncheck for material that arrived already Bates-labeled — it will be staged exactly as-is.</span>
              </span>
            </label>
            {doBates && (
              <>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-semibold">Bates prefix</span>
                    <input value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} placeholder="e.g. SMITH" className={`${input} w-full`} />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-semibold">Starting number</span>
                    <input value={start} onChange={(e) => setStart(e.target.value.replace(/[^0-9]/g, ""))} className={`${input} w-full`} />
                  </label>
                </div>
                <p className="mt-2 text-xs text-[var(--c-ink-muted)]">First label: <strong>{bates(prefix || "PREFIX", Number(start) || 1)}</strong>. Numbering continues automatically on later batches.</p>
                <fieldset className="mt-3 rounded-md border border-[var(--c-border)] p-2.5">
                  <legend className="px-1 text-xs font-semibold">Stamp appearance</legend>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-xs">
                      <span className="mb-0.5 block font-semibold">Location</span>
                      <select value={stampStyle.position} onChange={(e) => setStampStyle((s) => ({ ...s, position: e.target.value as Required<StampStyle>["position"] }))} className={`${input} w-full py-1.5 text-xs`}>
                        <option value="bottom-right">Bottom right</option>
                        <option value="bottom-left">Bottom left</option>
                        <option value="bottom-center">Bottom middle</option>
                      </select>
                    </label>
                    <label className="block text-xs">
                      <span className="mb-0.5 block font-semibold">Font</span>
                      <select value={stampStyle.font} onChange={(e) => setStampStyle((s) => ({ ...s, font: e.target.value as Required<StampStyle>["font"] }))} className={`${input} w-full py-1.5 text-xs`}>
                        <option value="helvetica">Helvetica</option>
                        <option value="helvetica-bold">Helvetica bold</option>
                        <option value="times">Times Roman</option>
                        <option value="courier">Courier</option>
                      </select>
                    </label>
                    <label className="block text-xs">
                      <span className="mb-0.5 block font-semibold">Color</span>
                      <select value={stampStyle.color} onChange={(e) => setStampStyle((s) => ({ ...s, color: e.target.value as Required<StampStyle>["color"] }))} className={`${input} w-full py-1.5 text-xs`}>
                        <option value="black">Black</option>
                        <option value="red">Red</option>
                        <option value="blue">Blue</option>
                        <option value="gray">Gray</option>
                        <option value="white">White (dark backing)</option>
                      </select>
                    </label>
                    <label className="block text-xs">
                      <span className="mb-0.5 block font-semibold">Size</span>
                      <select value={String(stampStyle.size)} onChange={(e) => setStampStyle((s) => ({ ...s, size: Number(e.target.value) }))} className={`${input} w-full py-1.5 text-xs`}>
                        {[8, 9, 10, 12, 14, 18].map((n) => <option key={n} value={n}>{n} pt</option>)}
                      </select>
                    </label>
                  </div>
                </fieldset>
              </>
            )}
            {error && <p className="mt-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setDialog(false)} disabled={busy} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
              <button onClick={() => void submit()} disabled={busy || (doBates && !prefix.trim())} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Stamp size={14} />} {busy ? "Working…" : doBates ? "Bates label & stage" : "Stage as-is"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* one client document: header + its pages, rendered like the opposing grid */
function ClientDocSection({ f, cols, selected, pageMark, onTogglePage, onToggleDoc, onPagesKnown, onOpen, getDoc, proxyUrl }: {
  f: ClientFile; cols: number; selected: Set<string>;
  pageMark: (f: ClientFile, page: number) => PageMark;
  onTogglePage: (f: ClientFile, page: number, shiftKey?: boolean) => void;
  onToggleDoc: () => void;
  onPagesKnown: (key: string, n: number) => void;
  onOpen: (page: number) => void;
  getDoc: (f: ClientFile) => Promise<import("pdfjs-dist").PDFDocumentProxy>;
  proxyUrl: (f: ClientFile) => string;
}) {
  const kind = fileKind(f.name);
  const [pages, setPages] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (kind !== "pdf") return;
    let alive = true;
    getDoc(f).then((d) => { if (alive) { setPages(d.numPages); onPagesKnown(f.key, d.numPages); } }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [kind, f, getDoc, onPagesKnown]);
  const renderW = cols >= 8 ? 220 : cols >= 6 ? 300 : cols >= 4 ? 460 : cols >= 2 ? 720 : 1200;

  // Header checkbox state + this document's staged-page tally.
  const total = kind === "pdf" ? pages : 1;
  let selCount = 0, stagedCount = 0, producedCount = 0;
  for (let p = 1; p <= total; p++) {
    const mk = pageMark(f, p);
    if (mk === "produced") producedCount++;
    else if (mk === "staged") stagedCount++;
    else if (selected.has(pk(f.key, p))) selCount++;
  }
  const freeCount = total - stagedCount - producedCount;
  const allSel = total > 0 && freeCount > 0 && selCount === freeCount;

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button onClick={onToggleDoc} disabled={!!f.status || (total > 0 && freeCount === 0)}
          className={`flex h-5 w-5 items-center justify-center rounded border ${allSel ? "border-[var(--c-accent)] bg-[var(--c-accent)] text-white" : selCount > 0 ? "border-[var(--c-accent)] text-[var(--c-accent)]" : "border-[var(--c-border)]"} disabled:opacity-40`}
          title={f.status ? "Already staged or produced" : allSel ? "Deselect all pages" : "Select every remaining page of this document"}>
          {allSel ? <Check size={13} strokeWidth={3} /> : selCount > 0 ? <span className="text-[11px] font-bold leading-none">–</span> : null}
        </button>
        <h3 className="truncate text-sm font-semibold">{f.name}</h3>
        {f.dir && <span className="rounded-full bg-[var(--c-accent)]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[var(--c-accent)]">{f.dir}</span>}
        {f.movedFromOpposing && <span className="rounded-full bg-[var(--c-border)] px-1.5 py-0.5 text-[11px] text-[var(--c-ink-muted)]">moved from opposing</span>}
        {f.status ? (
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${f.status === "produced" ? "bg-green-200 text-green-900" : "bg-yellow-200 text-yellow-900"}`}>
            {f.status === "produced" ? "produced" : "TBP →"}
          </span>
        ) : (
          <>
            {stagedCount > 0 && <span className="rounded-full bg-yellow-200 px-1.5 py-0.5 text-[10px] font-bold text-yellow-900">{stagedCount} pp. TBP →</span>}
            {producedCount > 0 && <span className="rounded-full bg-green-200 px-1.5 py-0.5 text-[10px] font-bold text-green-900">{producedCount} pp. produced</span>}
            {selCount > 0 && <span className="rounded-full bg-[var(--c-accent)]/15 px-1.5 py-0.5 text-[10px] font-bold text-[var(--c-accent)]">{selCount} pp. selected</span>}
          </>
        )}
        <span className="text-xs text-[var(--c-ink-muted)]">{kind === "pdf" ? (failed ? "couldn't open" : pages ? `${pages} page${pages === 1 ? "" : "s"}` : "opening…") : ""}</span>
        <a href={proxyUrl(f)} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--c-accent)] hover:underline"><ExternalLink size={12} /> original</a>
      </div>
      {kind === "image" ? (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          <div className="relative">
            <button onClick={() => onTogglePage(f, 1)} onDoubleClick={() => onOpen(1)} disabled={!!pageMark(f, 1)}
              className={`w-full overflow-hidden rounded-md border bg-white shadow-sm ${selected.has(pk(f.key, 1)) ? "border-[var(--c-accent)] ring-[3px] ring-[var(--c-accent)]" : "border-[var(--c-border)] hover:ring-1 hover:ring-[var(--c-accent)]/50"} ${pageMark(f, 1) ? "cursor-default" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proxyUrl(f)} alt={f.name} className={`aspect-[8.5/11] w-full object-contain ${pageMark(f, 1) ? "opacity-60 grayscale-[35%]" : ""}`} loading="lazy" />
            </button>
            {pageMark(f, 1) && (
              <span className={`absolute right-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold shadow ${pageMark(f, 1) === "produced" ? "bg-green-300 text-green-950" : "bg-yellow-300 text-yellow-950"}`}>
                {pageMark(f, 1) === "produced" ? "PROD" : "TBP →"}
              </span>
            )}
          </div>
        </div>
      ) : kind === "pdf" && pages > 0 ? (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: pages }, (_, i) => i + 1).map((page) => (
            <ClientPageCell key={page} f={f} page={page} renderW={renderW}
              selected={selected.has(pk(f.key, page))} mark={pageMark(f, page)} getDoc={getDoc}
              onClick={(shiftKey) => onTogglePage(f, page, shiftKey)} onOpen={() => onOpen(page)} />
          ))}
        </div>
      ) : kind === "pdf" && failed ? (
        <p className="rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] p-3 text-xs text-[var(--c-ink-muted)]">Preview unavailable — open the original instead.</p>
      ) : kind === "other" ? (
        <p className="rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] p-3 text-xs text-[var(--c-ink-muted)]">No page preview for this file type.</p>
      ) : null}
    </section>
  );
}

function ClientPageCell({ f, page, renderW, selected, mark, getDoc, onClick, onOpen }: {
  f: ClientFile; page: number; renderW: number; selected: boolean; mark: PageMark;
  getDoc: (f: ClientFile) => Promise<import("pdfjs-dist").PDFDocumentProxy>;
  onClick: (shiftKey: boolean) => void; onOpen: () => void;
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
      if (entries.some((e) => e.isIntersecting)) { setInView(true); io.disconnect(); }
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || renderedW.current === renderW) return;
    const seq = ++seqRef.current;
    void (async () => {
      try {
        const doc = await getDoc(f);
        const pdfPage = await doc.getPage(page);
        if (seq !== seqRef.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({ scale: renderW / base.width });
        taskRef.current?.cancel();
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const task = pdfPage.render({ canvas, viewport });
        taskRef.current = task;
        await task.promise;
        if (seq !== seqRef.current) return;
        renderedW.current = renderW;
        setState("done");
      } catch {
        if (seq === seqRef.current) setState("error");
      }
    })();
  }, [inView, renderW, f, page, getDoc]);

  return (
    <div ref={holder} onClick={(e) => { if (!mark) onClick(e.shiftKey); }} onDoubleClick={onOpen}
      onMouseDown={(e) => { if (e.shiftKey) e.preventDefault(); }} // shift-click shouldn't drag-select text
      className={`group relative aspect-[8.5/11] overflow-hidden rounded-md border bg-white shadow-sm ${mark ? "cursor-default" : "cursor-pointer"} ${selected ? "border-[var(--c-accent)] ring-[3px] ring-[var(--c-accent)]" : "border-[var(--c-border)]"} ${!mark && !selected ? "hover:ring-1 hover:ring-[var(--c-accent)]/50" : ""}`}
      title={mark === "produced" ? "Already produced" : mark === "staged" ? "Already staged — see the yellow tab" : "Click to select this page · Shift-click for a range · Double-click to read"}>
      <canvas ref={canvasRef} className={`h-full w-full object-contain ${mark ? "opacity-60 grayscale-[35%]" : ""}`} />
      {state === "idle" && <div className="absolute inset-0 flex items-center justify-center bg-[var(--c-bg)]"><Loader2 size={16} className="animate-spin text-[var(--c-ink-muted)]" /></div>}
      {state === "error" && <div className="absolute inset-0 flex items-center justify-center bg-[var(--c-bg)] text-xs text-[var(--c-ink-muted)]">page {page}</div>}
      {mark && (
        <span className={`absolute right-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-bold shadow ${mark === "produced" ? "bg-green-300 text-green-950" : "bg-yellow-300 text-yellow-950"}`}>
          {mark === "produced" ? "PROD" : "TBP →"}
        </span>
      )}
      <span className="absolute bottom-1 right-1.5 rounded bg-black/55 px-1 text-[10px] leading-4 text-white">{page}</span>
    </div>
  );
}

/* reader: one client document at a time, full width */

type ReviewTool = "select" | "highlight" | "redact" | "note" | "eraser";

const TOOL_LABELS: Record<ReviewTool, string> = { select: "Select", highlight: "Highlighter", redact: "Redaction", note: "Note", eraser: "Eraser" };

function ClientReader({ files, state, setState, selected, pageMark, onTogglePage, getDoc, proxyUrl, annos, ensureAnnos, addAnno, delAnno, onStageFromTools }: {
  files: ClientFile[];
  state: { docIdx: number; page: number };
  setState: (s: { docIdx: number; page: number }) => void;
  selected: Set<string>;
  pageMark: (f: ClientFile, page: number) => PageMark;
  onTogglePage: (f: ClientFile, page: number, shiftKey?: boolean) => void;
  getDoc: (f: ClientFile) => Promise<import("pdfjs-dist").PDFDocumentProxy>;
  proxyUrl: (f: ClientFile) => string;
  annos: Record<string, FileAnnotation[]>;
  ensureAnnos: (key: string) => Promise<void>;
  addAnno: (key: string, page: number, kind: AnnotationKind, rect: { x: number; y: number; w: number; h: number }, note?: string) => Promise<void>;
  delAnno: (key: string, id: number) => Promise<void>;
  onStageFromTools: (f: ClientFile) => void;
}) {
  const f = files[Math.min(state.docIdx, files.length - 1)];
  const kind = fileKind(f.name);
  const [pages, setPages] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendering, setRendering] = useState(true);
  const renderSeq = useRef(0);
  const taskRef = useRef<{ cancel: () => void } | null>(null);
  const [tool, setTool] = useState<ReviewTool>("select");
  const [menuOpen, setMenuOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => { if (kind === "pdf") void ensureAnnos(f.key); }, [kind, f.key, ensureAnnos]);

  useEffect(() => {
    if (kind !== "pdf") { setPages(1); return; }
    let alive = true;
    getDoc(f).then((d) => { if (alive) setPages(d.numPages); }).catch(() => { if (alive) setPages(0); });
    return () => { alive = false; };
  }, [kind, f, getDoc]);

  useEffect(() => {
    if (kind !== "pdf") return;
    const seq = ++renderSeq.current;
    setRendering(true);
    void (async () => {
      try {
        const doc = await getDoc(f);
        const pdfPage = await doc.getPage(Math.min(state.page, doc.numPages));
        if (seq !== renderSeq.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const cssW = Math.min(940, Math.max(480, (canvas.parentElement?.clientWidth ?? 800) - 16));
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const viewport = pdfPage.getViewport({ scale: (cssW / base.width) * dpr });
        taskRef.current?.cancel();
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.width = `${cssW}px`;
        const task = pdfPage.render({ canvas, viewport });
        taskRef.current = task;
        await task.promise;
      } catch { /* keep previous frame */ } finally {
        if (seq === renderSeq.current) setRendering(false);
      }
    })();
  }, [kind, f, state.page, getDoc]);

  const prev = () => {
    if (state.page > 1) setState({ ...state, page: state.page - 1 });
    else if (state.docIdx > 0) setState({ docIdx: state.docIdx - 1, page: 1 });
  };
  const next = () => {
    if (state.page < pages) setState({ ...state, page: state.page + 1 });
    else if (state.docIdx < files.length - 1) setState({ docIdx: state.docIdx + 1, page: 1 });
  };
  const mk = pageMark(f, state.page);
  const isSel = selected.has(pk(f.key, state.page));
  const pageAnnos = (annos[f.key] ?? []).filter((a) => a.page === state.page);
  const drawing = tool === "highlight" || tool === "redact";

  const normPoint = (e: React.MouseEvent) => {
    const r = overlayRef.current?.getBoundingClientRect();
    if (!r || r.width < 2 || r.height < 2) return null;
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const onOverlayDown = (e: React.MouseEvent) => {
    if (!drawing || e.button !== 0) return;
    const p = normPoint(e);
    if (!p) return;
    e.preventDefault();
    dragStart.current = p;
    setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
  };
  const onOverlayMove = (e: React.MouseEvent) => {
    const s = dragStart.current;
    if (!s) return;
    const p = normPoint(e);
    if (!p) return;
    setDraft({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };
  const finishDrag = () => {
    const rect = draft;
    dragStart.current = null;
    setDraft(null);
    if (rect && drawing && rect.w >= 0.005 && rect.h >= 0.005) void addAnno(f.key, state.page, tool as AnnotationKind, rect);
  };
  const onOverlayClick = (e: React.MouseEvent) => {
    if (tool !== "note") return;
    const p = normPoint(e);
    if (!p) return;
    const text = window.prompt("Note (stays internal — never goes to the other side):");
    if (text && text.trim()) void addAnno(f.key, state.page, "note", { x: p.x, y: p.y, w: 0, h: 0 }, text.trim());
  };

  const toolItem = (t: ReviewTool, icon: React.ReactNode, hint?: string) => (
    <button key={t} onClick={() => { setTool(t); setMenuOpen(false); }}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--c-bg)] ${tool === t ? "font-semibold text-[var(--c-accent)]" : ""}`}>
      {icon} {TOOL_LABELS[t]} {hint && <span className="ml-auto text-[10px] text-[var(--c-ink-muted)]">{hint}</span>}
      {tool === t && <Check size={13} className={hint ? "" : "ml-auto"} />}
    </button>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-3 flex flex-wrap items-center justify-center gap-3">
        <button onClick={prev} disabled={state.docIdx === 0 && state.page <= 1} className="rounded-md border border-[var(--c-border)] p-1.5 disabled:opacity-40 hover:border-[var(--c-accent)]"><ChevronLeft size={16} /></button>
        <span className="text-sm">
          <strong>{f.name}</strong>
          {f.dir && <span className="ml-2 rounded-full bg-[var(--c-accent)]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[var(--c-accent)]">{f.dir}</span>}
          <span className="ml-2 text-xs text-[var(--c-ink-muted)]">page {state.page}{pages ? ` of ${pages}` : ""} · document {state.docIdx + 1} of {files.length}</span>
        </span>
        <button onClick={next} disabled={state.docIdx >= files.length - 1 && state.page >= pages} className="rounded-md border border-[var(--c-border)] p-1.5 disabled:opacity-40 hover:border-[var(--c-accent)]"><ChevronRight size={16} /></button>
        <button onClick={() => onTogglePage(f, state.page)} disabled={!!mk}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${isSel ? "border-[var(--c-accent)] bg-[var(--c-accent)] text-[var(--c-on-accent)]" : "border-[var(--c-border)] hover:border-[var(--c-accent)]"}`}>
          <Check size={14} /> {mk ? (mk === "produced" ? "Page produced" : "Page staged") : isSel ? `Page ${state.page} selected` : `Select page ${state.page}`}
        </button>
        <div className="relative">
          <button onClick={() => setMenuOpen((o) => !o)} disabled={kind !== "pdf"}
            title={kind !== "pdf" ? "Review tools work on PDF pages" : "Review tools"}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${tool !== "select" ? "border-[var(--c-accent)] text-[var(--c-accent)]" : "border-[var(--c-border)] hover:border-[var(--c-accent)]"}`}>
            <Wrench size={14} /> Tools{tool !== "select" ? `: ${TOOL_LABELS[tool]}` : ""}
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-50 mt-1 w-64 overflow-hidden rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] py-1 shadow-lg">
                {toolItem("select", <MousePointer2 size={14} />)}
                {toolItem("highlight", <Highlighter size={14} className="text-yellow-600" />, "drag a box")}
                {toolItem("redact", <Square size={14} className="fill-black text-black" />, "drag a box")}
                {toolItem("note", <StickyNote size={14} className="text-amber-600" />, "click to place")}
                {toolItem("eraser", <Eraser size={14} />, "click a mark")}
                <div className="my-1 border-t border-[var(--c-border)]" />
                <button onClick={() => { setMenuOpen(false); onStageFromTools(f); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--c-bg)]">
                  <Stamp size={14} /> Bates label &amp; stage selection…
                </button>
                <p className="border-t border-[var(--c-border)] px-3 py-1.5 text-[10px] leading-snug text-[var(--c-ink-muted)]">
                  Redactions are burned into the copies that go out. Highlights &amp; notes stay internal.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
      <div className={`relative mx-auto w-fit overflow-hidden rounded-md border bg-white shadow ${isSel ? "ring-2 ring-[var(--c-accent)] border-[var(--c-accent)]" : "border-[var(--c-border)]"}`}>
        {kind === "pdf" ? (
          <>
            <canvas ref={canvasRef} className={mk ? "opacity-60 grayscale-[35%]" : ""} />
            <div ref={overlayRef} data-testid="reader-overlay" className="absolute inset-0"
              style={{ cursor: drawing || tool === "note" ? "crosshair" : tool === "eraser" ? "pointer" : "default", pointerEvents: tool === "select" ? "none" : "auto" }}
              onMouseDown={onOverlayDown} onMouseMove={onOverlayMove} onMouseUp={finishDrag} onMouseLeave={finishDrag} onClick={onOverlayClick}>
              {pageAnnos.map((a) => a.kind === "note" ? (
                <button key={a.id} title={a.note || "Note"}
                  onClick={(e) => { e.stopPropagation(); if (tool === "eraser") void delAnno(f.key, a.id); else window.alert(a.note || "Note"); }}
                  className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-500 bg-amber-200 p-1 text-amber-900 shadow"
                  style={{ left: `${a.rect.x * 100}%`, top: `${a.rect.y * 100}%`, pointerEvents: "auto" }}>
                  <StickyNote size={12} />
                </button>
              ) : (
                <div key={a.id} title={tool === "eraser" ? "Click to remove" : a.kind === "redact" ? "Redaction — burned into produced copies" : "Highlight (internal)"}
                  onClick={(e) => { if (tool === "eraser") { e.stopPropagation(); void delAnno(f.key, a.id); } }}
                  className={a.kind === "redact" ? "absolute bg-black/80" : "absolute bg-yellow-300/40 ring-1 ring-yellow-500/60"}
                  style={{ left: `${a.rect.x * 100}%`, top: `${a.rect.y * 100}%`, width: `${a.rect.w * 100}%`, height: `${a.rect.h * 100}%`, pointerEvents: tool === "eraser" ? "auto" : "none" }} />
              ))}
              {draft && (
                <div className={tool === "redact" ? "absolute bg-black/60 ring-2 ring-black" : "absolute bg-yellow-300/40 ring-2 ring-yellow-500"}
                  style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.w * 100}%`, height: `${draft.h * 100}%`, pointerEvents: "none" }} />
              )}
            </div>
            {mk && (
              <span className={`absolute right-2 top-2 z-20 rounded px-2 py-1 text-xs font-bold shadow ${mk === "produced" ? "bg-green-300 text-green-950" : "bg-yellow-300 text-yellow-950"}`}>
                {mk === "produced" ? "PROD" : "TBP →"}
              </span>
            )}
            {rendering && <div className="absolute inset-0 flex items-center justify-center bg-white/60"><Loader2 size={20} className="animate-spin text-[var(--c-ink-muted)]" /></div>}
          </>
        ) : kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyUrl(f)} alt={f.name} className={`max-h-[80vh] w-auto ${mk ? "opacity-60 grayscale-[35%]" : ""}`} />
        ) : (
          <p className="p-10 text-sm text-[var(--c-ink-muted)]">No preview for this file type — <a href={proxyUrl(f)} className="text-[var(--c-accent)] underline" target="_blank" rel="noreferrer">open the original</a>.</p>
        )}
      </div>
    </div>
  );
}

/* ------------- pale yellow: staged, reviewable, then produce ------------- */

function StagedView({ setId, staged, prods, contents }: { setId: number; staged: StagedDoc[]; prods: ProductionRow[]; contents: PipelineContents }) {
  const router = useRouter();
  const draft = prods.find((p) => !p.producedAt) ?? null;
  const rows = staged.filter((d) => !d.productionId || d.productionId === draft?.id).sort((a, b) => a.batesStart - b.batesStart);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<ProductionRow | null>(draft);
  const [copied, setCopied] = useState(false);

  async function prepare() {
    setBusy(true);
    setError(null);
    const r = await prepareProduction(setId);
    setBusy(false);
    if (r.ok) {
      setReview({ id: r.id, label: r.label, batesPrefix: "", batesStart: 0, batesEnd: 0, producedAt: null, letterUrl: r.letterUrl, fileUrl: r.fileUrl, fileName: r.fileName, token: r.publicUrl.split("/").pop() ?? "" });
      router.refresh();
    } else setError(r.error ?? "Couldn't prepare the production.");
  }

  const publicUrl = (p: ProductionRow) => `${typeof window !== "undefined" ? window.location.origin : ""}/production/${p.token}`;

  const mainDoc = likelyMainDoc(rows.length ? rows : staged);
  const linkFor = (e: TocEntry) => (mainDoc?.url ? `${mainDoc.url}#page=${e.from}` : null);

  return (
    <div className="p-4">
      <div className="-mx-4 -mt-1 mb-3"><ProductionContents setId={setId} mode="staged" toc={contents.toc} notes={contents.notes} tocFile={contents.tocFile} linkFor={linkFor} /></div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="text-sm text-[var(--c-ink-muted)]">Bates-labeled and under review — nothing here has gone to the other side yet.</p>
        <button onClick={() => void prepare()} disabled={busy || rows.length === 0 || !!draft}
          className="btn btn-accent ml-auto inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-50"
          title={draft ? "A draft production is awaiting review below" : undefined}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {busy ? "Assembling…" : "Prepare production"}
        </button>
      </div>
      {error && <p className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}

      {draft && review && (
        <div className="mb-4 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4">
          <p className="font-semibold">{draft.label} — draft, awaiting your review</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {draft.letterUrl && <a href={draft.letterUrl} target="_blank" rel="noreferrer" className="btn btn-outline inline-flex items-center gap-1.5 text-xs py-1.5 px-3"><FileText size={13} /> Review the letter</a>}
            {draft.fileUrl && <a href={draft.fileUrl} target="_blank" rel="noreferrer" className="btn btn-outline inline-flex items-center gap-1.5 text-xs py-1.5 px-3"><FileText size={13} /> Review {draft.fileName}</a>}
            <a href={publicUrl(draft)} target="_blank" rel="noreferrer" className="btn btn-outline inline-flex items-center gap-1.5 text-xs py-1.5 px-3"><ExternalLink size={13} /> Review the opposing-counsel page</a>
            <button onClick={async () => { try { await navigator.clipboard.writeText(publicUrl(draft)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* no clipboard */ } }}
              className="btn btn-outline inline-flex items-center gap-1.5 text-xs py-1.5 px-3"><Copy size={13} /> {copied ? "Copied!" : "Copy link"}</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={async () => { setBusy(true); await finalizeProduction(draft.id); setBusy(false); router.refresh(); }} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50">
              <Check size={14} /> Mark as produced
            </button>
            <button onClick={async () => { if (confirm("Discard this draft? The documents stay staged.")) { setBusy(true); await discardProductionDraft(draft.id); setBusy(false); setReview(null); router.refresh(); } }} disabled={busy}
              className="btn btn-outline inline-flex items-center gap-1.5 text-sm py-2 px-4"><Trash2 size={14} /> Discard draft</button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center text-sm text-[var(--c-ink-muted)]">
          Nothing staged. Select documents under <strong>Received from Client</strong> and click <strong>Intend to produce</strong>.
        </p>
      ) : (
        <div className="divide-y divide-[var(--c-border)] rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]">
          {rows.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              <span className="font-mono text-xs font-semibold text-[var(--c-accent)]">{d.batesPrefix ? <>{bates(d.batesPrefix, d.batesStart)}{d.batesEnd > d.batesStart ? `–${String(d.batesEnd).padStart(6, "0")}` : ""}</> : "pre-labeled"}</span>
              <span className="min-w-0 flex-1 break-words">{d.name}</span>
              {d.requestLabel && <span className="rounded-full bg-[var(--c-accent)]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[var(--c-accent)]">{d.requestLabel}</span>}
              {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="text-[var(--c-accent)]" title="View staged copy"><ExternalLink size={14} /></a>}
              {!d.productionId && (
                <button onClick={async () => { if (confirm(`Remove ${bates(d.batesPrefix, d.batesStart)} from the staging list?`)) { await unstageProductionDoc(d.id); router.refresh(); } }}
                  className="text-[var(--c-ink-muted)] hover:text-red-600" title="Remove from staging"><Trash2 size={14} /></button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------- pale green: what has actually gone out ------------------ */

function ProducedView({ setId, staged, prods, contents }: { setId: number; staged: StagedDoc[]; prods: ProductionRow[]; contents: PipelineContents }) {
  const done = prods.filter((p) => p.producedAt).sort((a, b) => a.batesStart - b.batesStart);
  // Link + Bates base come from the most recent production with a file.
  const latest = [...done].reverse().find((p) => p.fileUrl) ?? null;
  const mainDoc = latest ? null : likelyMainDoc(staged.filter((d) => d.productionId && done.some((p) => p.id === d.productionId)));
  const linkUrl = latest?.fileUrl ?? mainDoc?.url ?? null;
  const linkFor = (e: TocEntry) => (linkUrl ? `${linkUrl}#page=${e.from}` : null);
  const batesBase = latest && latest.batesPrefix
    ? { prefix: latest.batesPrefix, start: latest.batesStart }
    : mainDoc && mainDoc.batesPrefix
      ? { prefix: mainDoc.batesPrefix, start: mainDoc.batesStart }
      : null;
  return (
    <div className="p-4">
      <div className="-mx-4 -mt-1 mb-3"><ProductionContents setId={setId} mode="produced" toc={contents.toc} notes={contents.notes} tocFile={contents.tocFile} linkFor={linkFor} batesBase={batesBase} /></div>
      {done.length === 0 ? (
        <p className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center text-sm text-[var(--c-ink-muted)]">
          Nothing has been produced yet. Stage documents, prepare the production, review it, and mark it produced.
        </p>
      ) : (
        <div className="space-y-6">
          {done.map((p) => {
            const docs = staged.filter((d) => d.productionId === p.id).sort((a, b) => a.batesStart - b.batesStart);
            return (
              <section key={p.id} className="overflow-hidden rounded-lg border border-green-600/40">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-green-600/10 px-4 py-2.5">
                  <span className="font-semibold">{p.label}</span>
                  <span className="font-mono text-xs">{bates(p.batesPrefix, p.batesStart)} – {String(p.batesEnd).padStart(6, "0")}</span>
                  {p.producedAt && <span className="text-xs text-[var(--c-ink-muted)]">produced {fmtDay(p.producedAt.slice(0, 10))}</span>}
                  <span className="ml-auto flex items-center gap-2 text-xs">
                    {p.letterUrl && <a href={p.letterUrl} target="_blank" rel="noreferrer" className="text-[var(--c-accent)] hover:underline">letter</a>}
                    {p.fileUrl && <a href={p.fileUrl} target="_blank" rel="noreferrer" className="text-[var(--c-accent)] hover:underline">{p.fileName || "production PDF"}</a>}
                    <a href={`/production/${p.token}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--c-accent)] hover:underline">OC link <ExternalLink size={11} /></a>
                  </span>
                </div>
                <div className="divide-y divide-[var(--c-border)] bg-[var(--c-surface)]">
                  {docs.map((d) => (
                    <div key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
                      <span className="font-mono text-xs font-semibold text-[var(--c-accent)]">{bates(d.batesPrefix, d.batesStart)}{d.batesEnd > d.batesStart ? `–${String(d.batesEnd).padStart(6, "0")}` : ""}</span>
                      <span className="min-w-0 flex-1 break-words">{d.name}</span>
                      {d.requestLabel && <span className="rounded-full bg-[var(--c-accent)]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[var(--c-accent)]">{d.requestLabel}</span>}
                      {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="text-[var(--c-accent)]"><ExternalLink size={13} /></a>}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}