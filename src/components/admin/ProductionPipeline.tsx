"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check, Copy, ExternalLink, FileText, Loader2, Pencil, Send, Stamp, Trash2, X,
} from "lucide-react";
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

/* ---- pale red: everything the client dropped, flattened, RFP-labeled ---- */

function ReceivedView({ setId, files, batesDefaults }: { setId: number; files: ClientFile[]; batesDefaults: { prefix: string; nextStart: number } }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState(false);
  const [prefix, setPrefix] = useState(batesDefaults.prefix);
  const [start, setStart] = useState(String(batesDefaults.nextStart));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const toggle = (key: string, ok: boolean) => {
    if (!ok) return;
    setSelected((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  };

  async function submit() {
    setBusy(true);
    setError(null);
    const r = await stageForProduction(setId, [...selected], prefix, Number(start) || undefined);
    setBusy(false);
    if (r.ok) {
      setDialog(false);
      setSelected(new Set());
      setNotice(`${r.staged} document${r.staged === 1 ? "" : "s"} Bates-labeled and moved to "To be produced".${r.skipped.length ? ` Skipped: ${r.skipped.join("; ")}` : ""}`);
      router.refresh();
    } else setError(r.error ?? "Couldn't stage the documents.");
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="text-sm text-[var(--c-ink-muted)]">
          Everything the client has dropped into this case&apos;s request folders — labeled by the request it answers.
        </p>
        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && <span className="text-sm font-medium">{selected.size} selected</span>}
          <button onClick={() => { setPrefix(batesDefaults.prefix); setStart(String(batesDefaults.nextStart)); setDialog(true); }} disabled={selected.size === 0}
            className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-50">
            <Stamp size={15} /> Intend to produce{selected.size ? ` (${selected.size})` : ""}
          </button>
        </div>
      </div>
      {notice && (
        <p className="mb-3 flex items-start gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          <Check size={15} className="mt-0.5 shrink-0" /> {notice} <button onClick={() => setNotice(null)} className="ml-auto"><X size={14} /></button>
        </p>
      )}

      {files.length === 0 ? (
        <p className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center text-sm text-[var(--c-ink-muted)]">
          Nothing from the client yet. Send a document request (button above) and their uploads will land here.
        </p>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {files.map((f) => {
            const sel = selected.has(f.key);
            const locked = !!f.status;
            return (
              <button key={f.key} onClick={() => toggle(f.key, !locked)}
                className={`relative rounded-lg border bg-[var(--c-surface)] p-3 text-left transition-shadow ${sel ? "border-[var(--c-accent)] ring-2 ring-[var(--c-accent)]" : "border-[var(--c-border)]"} ${locked ? "opacity-70" : "hover:shadow"}`}>
                <div className="flex items-start gap-2">
                  <FileText size={17} className="mt-0.5 shrink-0 text-[var(--c-accent)]" />
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium leading-snug">{f.name}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--c-ink-muted)]">
                      {f.dir && <span className="rounded-full bg-[var(--c-accent)]/10 px-1.5 py-0.5 font-semibold text-[var(--c-accent)]">{f.dir}</span>}
                      {f.movedFromOpposing && (
                        <span className="rounded-full bg-[var(--c-border)] px-1.5 py-0.5">moved from opposing</span>
                      )}
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

      {dialog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget && !busy) setDialog(false); }}>
          <div className="w-full max-w-md rounded-lg border border-[var(--c-accent)] bg-[var(--c-surface)] p-5">
            <h3 className="font-[family-name:var(--font-display)] text-lg">Bates label &amp; stage for production</h3>
            <p className="mt-1 text-sm text-[var(--c-ink-muted)]">
              The {selected.size} selected document{selected.size === 1 ? "" : "s"} will be Bates-labeled on every page and moved to <strong>Documents to be produced</strong>.
            </p>
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
            {error && <p className="mt-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setDialog(false)} disabled={busy} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
              <button onClick={() => void submit()} disabled={busy || !prefix.trim()} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Stamp size={14} />} {busy ? "Stamping…" : "Bates label & stage"}
              </button>
            </div>
          </div>
        </div>
      )}
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
              <span className="font-mono text-xs font-semibold text-[var(--c-accent)]">{bates(d.batesPrefix, d.batesStart)}{d.batesEnd > d.batesStart ? `–${String(d.batesEnd).padStart(6, "0")}` : ""}</span>
              <span className="min-w-0 flex-1 break-words">{d.name}</span>
              {d.requestLabel && <span className="rounded-full bg-[var(--c-accent)]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[var(--c-accent)]">{d.requestLabel}</span>}
              {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="text-[var(--c-accent)]" title="View stamped copy"><ExternalLink size={14} /></a>}
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