"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookOpen, Check, ChevronLeft, ChevronRight, Copy, ExternalLink, FileText, Grid3x3, Loader2, Pencil, Send, Stamp, Trash2, X, ZoomIn, ZoomOut,
} from "lucide-react";
import { loadPdfjs } from "./DiscoveryReviewer";
import {
  stageForProduction, unstageProductionDoc, prepareProduction, finalizeProduction, discardProductionDraft, updateRequestDeadlines, setDiscoveryDocBucket,
} from "@/app/admin/(panel)/discovery-reviewer/actions";

const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";

export type ClientFile = { key: string; name: string; dir: string; folderId: number | null; folderName: string; createdAt: string; status: "" | "staged" | "produced"; movedFromOpposing?: boolean };
export type StagedDoc = { id: number; name: string; requestLabel: string; url: string | null; batesPrefix: string; batesStart: number; batesEnd: number; productionId: number | null };
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

export function ProductionPipeline({ mode, setId, clientFiles, staged, prods, batesDefaults }: {
  mode: "received" | "staged" | "produced";
  setId: number;
  clientFiles: ClientFile[];
  staged: StagedDoc[];
  prods: ProductionRow[];
  batesDefaults: { prefix: string; nextStart: number };
}) {
  if (mode === "received") return <ReceivedView setId={setId} files={clientFiles} batesDefaults={batesDefaults} />;
  if (mode === "staged") return <StagedView setId={setId} staged={staged} prods={prods} />;
  return <ProducedView staged={staged} prods={prods} />;
}

/* ---- pale red: everything the client dropped, page-level like opposing ---- */

const fileKind = (name: string): "pdf" | "image" | "other" => {
  if (/\.pdf$/i.test(name)) return "pdf";
  if (/\.(jpe?g|png)$/i.test(name)) return "image";
  return "other";
};

function ReceivedView({ setId, files, batesDefaults }: { setId: number; files: ClientFile[]; batesDefaults: { prefix: string; nextStart: number } }) {
  const router = useRouter();
  const [view, setView] = useState<"grid" | "reader" | "docs">("grid");
  const [cols, setCols] = useState(5);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reader, setReader] = useState<{ docIdx: number; page: number }>({ docIdx: 0, page: 1 });
  const [dialog, setDialog] = useState(false);
  const [doBates, setDoBates] = useState(true);
  const [prefix, setPrefix] = useState(batesDefaults.prefix);
  const [start, setStart] = useState(String(batesDefaults.nextStart));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  const toggle = (f: ClientFile) => {
    if (f.status) return;
    setSelected((prev) => { const next = new Set(prev); if (next.has(f.key)) next.delete(f.key); else next.add(f.key); return next; });
  };

  async function submit() {
    setBusy(true);
    setError(null);
    const r = await stageForProduction(setId, [...selected], { bates: doBates, prefix, start: Number(start) || undefined });
    setBusy(false);
    if (r.ok) {
      setDialog(false);
      setSelected(new Set());
      setNotice(`${r.staged} document${r.staged === 1 ? "" : "s"} ${doBates ? "Bates-labeled and " : ""}moved to "To be produced".${r.skipped.length ? ` Skipped: ${r.skipped.join("; ")}` : ""}`);
      router.refresh();
    } else setError(r.error ?? "Couldn't stage the documents.");
  }

  const viewBtn = (m: "grid" | "reader" | "docs", label: string, icon: React.ReactNode) => (
    <button onClick={() => setView(m)} disabled={m !== "docs" && files.length === 0}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm disabled:opacity-40 ${view === m ? "bg-[var(--c-accent)] text-[var(--c-on-accent)]" : "hover:bg-[var(--c-bg)]"}`}>
      {icon} {label}
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-2">
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
        <span className="text-xs text-[var(--c-ink-muted)]">Click a document (or any of its pages) to select it for production.</span>
        <div className={`ml-auto flex items-center gap-2 rounded-md px-2 py-1 ${selected.size ? "bg-[var(--c-accent)]/10 ring-1 ring-[var(--c-accent)]/40" : ""}`}>
          {selected.size > 0 && <span className="text-sm font-medium">{selected.size} selected</span>}
          <button onClick={() => { setDoBates(true); setPrefix(batesDefaults.prefix); setStart(String(batesDefaults.nextStart)); setDialog(true); }} disabled={selected.size === 0}
            className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-50">
            <Stamp size={15} /> Intend to produce{selected.size ? ` (${selected.size})` : ""}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {notice && (
          <p className="mb-3 flex items-start gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            <Check size={15} className="mt-0.5 shrink-0" /> {notice} <button onClick={() => setNotice(null)} className="ml-auto"><X size={14} /></button>
          </p>
        )}
        {files.length === 0 ? (
          <p className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center text-sm text-[var(--c-ink-muted)]">
            Nothing from the client yet. Send a document request (button above) and their uploads will land here.
          </p>
        ) : view === "reader" ? (
          <ClientReader files={files} state={reader} setState={setReader} selected={selected} onToggle={toggle} getDoc={getDoc} proxyUrl={proxyUrl} />
        ) : view === "grid" ? (
          <div className="space-y-6">
            {files.map((f) => (
              <ClientDocSection key={f.key} f={f} cols={cols} selected={selected.has(f.key)} onToggle={() => toggle(f)}
                onOpen={(page) => { setReader({ docIdx: files.findIndex((x) => x.key === f.key), page }); setView("reader"); }}
                getDoc={getDoc} proxyUrl={proxyUrl} />
            ))}
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {files.map((f) => {
              const sel = selected.has(f.key);
              const locked = !!f.status;
              return (
                <button key={f.key} onClick={() => toggle(f)}
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
                  {f.status && (
                    <span className={`absolute right-2 top-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${f.status === "produced" ? "bg-green-200 text-green-900" : "bg-yellow-200 text-yellow-900"}`}>
                      {f.status === "produced" ? "produced" : "to produce"}
                    </span>
                  )}
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
              The {selected.size} selected document{selected.size === 1 ? "" : "s"} will move to <strong>Documents to be produced</strong>.
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
function ClientDocSection({ f, cols, selected, onToggle, onOpen, getDoc, proxyUrl }: {
  f: ClientFile; cols: number; selected: boolean;
  onToggle: () => void; onOpen: (page: number) => void;
  getDoc: (f: ClientFile) => Promise<import("pdfjs-dist").PDFDocumentProxy>;
  proxyUrl: (f: ClientFile) => string;
}) {
  const kind = fileKind(f.name);
  const [pages, setPages] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (kind !== "pdf") return;
    let alive = true;
    getDoc(f).then((d) => { if (alive) setPages(d.numPages); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [kind, f, getDoc]);
  const renderW = cols >= 8 ? 220 : cols >= 6 ? 300 : cols >= 4 ? 460 : cols >= 2 ? 720 : 1200;

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button onClick={onToggle} disabled={!!f.status}
          className={`flex h-5 w-5 items-center justify-center rounded border ${selected ? "border-[var(--c-accent)] bg-[var(--c-accent)] text-white" : "border-[var(--c-border)]"} disabled:opacity-40`}
          title={f.status ? "Already staged or produced" : "Select this document for production"}>
          {selected && <Check size={13} strokeWidth={3} />}
        </button>
        <h3 className="truncate text-sm font-semibold">{f.name}</h3>
        {f.dir && <span className="rounded-full bg-[var(--c-accent)]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[var(--c-accent)]">{f.dir}</span>}
        {f.movedFromOpposing && <span className="rounded-full bg-[var(--c-border)] px-1.5 py-0.5 text-[11px] text-[var(--c-ink-muted)]">moved from opposing</span>}
        {f.status && (
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${f.status === "produced" ? "bg-green-200 text-green-900" : "bg-yellow-200 text-yellow-900"}`}>
            {f.status === "produced" ? "produced" : "to produce"}
          </span>
        )}
        <span className="text-xs text-[var(--c-ink-muted)]">{kind === "pdf" ? (failed ? "couldn't open" : pages ? `${pages} page${pages === 1 ? "" : "s"}` : "opening…") : ""}</span>
        <a href={proxyUrl(f)} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--c-accent)] hover:underline"><ExternalLink size={12} /> original</a>
      </div>
      {kind === "image" ? (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          <button onClick={onToggle} onDoubleClick={() => onOpen(1)}
            className={`overflow-hidden rounded-md border bg-white shadow-sm ${selected ? "border-[var(--c-accent)] ring-[3px] ring-[var(--c-accent)]" : "border-[var(--c-border)] hover:ring-1 hover:ring-[var(--c-accent)]/50"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proxyUrl(f)} alt={f.name} className="aspect-[8.5/11] w-full object-contain" loading="lazy" />
          </button>
        </div>
      ) : kind === "pdf" && pages > 0 ? (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: pages }, (_, i) => i + 1).map((page) => (
            <ClientPageCell key={page} f={f} page={page} renderW={renderW} selected={selected} getDoc={getDoc}
              onClick={onToggle} onOpen={() => onOpen(page)} />
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

function ClientPageCell({ f, page, renderW, selected, getDoc, onClick, onOpen }: {
  f: ClientFile; page: number; renderW: number; selected: boolean;
  getDoc: (f: ClientFile) => Promise<import("pdfjs-dist").PDFDocumentProxy>;
  onClick: () => void; onOpen: () => void;
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
    <div ref={holder} onClick={onClick} onDoubleClick={onOpen}
      className={`group relative aspect-[8.5/11] cursor-pointer overflow-hidden rounded-md border bg-white shadow-sm ${selected ? "border-[var(--c-accent)] ring-[3px] ring-[var(--c-accent)]" : "border-[var(--c-border)] hover:ring-1 hover:ring-[var(--c-accent)]/50"}`}
      title="Click to select this document · Double-click to read">
      <canvas ref={canvasRef} className="h-full w-full object-contain" />
      {state === "idle" && <div className="absolute inset-0 flex items-center justify-center bg-[var(--c-bg)]"><Loader2 size={16} className="animate-spin text-[var(--c-ink-muted)]" /></div>}
      {state === "error" && <div className="absolute inset-0 flex items-center justify-center bg-[var(--c-bg)] text-xs text-[var(--c-ink-muted)]">page {page}</div>}
      <span className="absolute bottom-1 right-1.5 rounded bg-black/55 px-1 text-[10px] leading-4 text-white">{page}</span>
    </div>
  );
}

/* reader: one client document at a time, full width */
function ClientReader({ files, state, setState, selected, onToggle, getDoc, proxyUrl }: {
  files: ClientFile[];
  state: { docIdx: number; page: number };
  setState: (s: { docIdx: number; page: number }) => void;
  selected: Set<string>;
  onToggle: (f: ClientFile) => void;
  getDoc: (f: ClientFile) => Promise<import("pdfjs-dist").PDFDocumentProxy>;
  proxyUrl: (f: ClientFile) => string;
}) {
  const f = files[Math.min(state.docIdx, files.length - 1)];
  const kind = fileKind(f.name);
  const [pages, setPages] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendering, setRendering] = useState(true);
  const renderSeq = useRef(0);
  const taskRef = useRef<{ cancel: () => void } | null>(null);

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
  const isSel = selected.has(f.key);

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
        <button onClick={() => onToggle(f)} disabled={!!f.status}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${isSel ? "border-[var(--c-accent)] bg-[var(--c-accent)] text-[var(--c-on-accent)]" : "border-[var(--c-border)] hover:border-[var(--c-accent)]"}`}>
          <Check size={14} /> {f.status ? (f.status === "produced" ? "Produced" : "Staged") : isSel ? "Selected" : "Select document"}
        </button>
      </div>
      <div className={`relative mx-auto w-fit overflow-hidden rounded-md border bg-white shadow ${isSel ? "ring-2 ring-[var(--c-accent)] border-[var(--c-accent)]" : "border-[var(--c-border)]"}`}>
        {kind === "pdf" ? (
          <>
            <canvas ref={canvasRef} />
            {rendering && <div className="absolute inset-0 flex items-center justify-center bg-white/60"><Loader2 size={20} className="animate-spin text-[var(--c-ink-muted)]" /></div>}
          </>
        ) : kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyUrl(f)} alt={f.name} className="max-h-[80vh] w-auto" />
        ) : (
          <p className="p-10 text-sm text-[var(--c-ink-muted)]">No preview for this file type — <a href={proxyUrl(f)} className="text-[var(--c-accent)] underline" target="_blank" rel="noreferrer">open the original</a>.</p>
        )}
      </div>
    </div>
  );
}

/* ------------- pale yellow: staged, reviewable, then produce ------------- */

function StagedView({ setId, staged, prods }: { setId: number; staged: StagedDoc[]; prods: ProductionRow[] }) {
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

  return (
    <div className="p-4">
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

function ProducedView({ staged, prods }: { staged: StagedDoc[]; prods: ProductionRow[] }) {
  const done = prods.filter((p) => p.producedAt).sort((a, b) => a.batesStart - b.batesStart);
  return (
    <div className="p-4">
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