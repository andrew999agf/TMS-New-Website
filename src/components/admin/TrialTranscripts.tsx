"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Plus, Trash2, Loader2, Upload, ExternalLink, X, Pencil, FileAudio, Paperclip } from "lucide-react";
import { addTranscript, updateTranscript, deleteTranscript } from "@/app/admin/(panel)/pre-trial/evidence-actions";

export type TranscriptRow = { id: number; kind: string; title: string; witnessId: number | null; takenOn: string | null; url: string | null; sizeBytes: number | null; notes: string };
export type WitnessLite = { id: number; name: string; side: string; role: string };

const input = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]";
const fmtSize = (n: number | null) => (n == null ? "" : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const fmtDate = (iso: string | null) => (iso ? new Date(Date.parse(`${iso}T00:00:00Z`)).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : "");
const KIND_LABEL: Record<string, string> = { deposition: "Deposition", statement: "Statement", hearing: "Hearing", other: "Other" };

const EMPTY = { title: "", kind: "deposition", witnessId: "", takenOn: "", notes: "" };

export function TrialTranscripts({ caseId, rows, witnesses, blobReady }: { caseId: number; rows: TranscriptRow[]; witnesses: WitnessLite[]; blobReady: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const wById = new Map(witnesses.map((w) => [w.id, w]));

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="inline-flex items-center gap-2 font-[family-name:var(--font-ui)] font-semibold"><FileAudio size={16} className="text-[var(--c-accent)]" /> Depositions &amp; statements ({rows.length})</h3>
        <button onClick={() => setAdding((v) => !v)} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs hover:bg-[var(--c-surface2)]"><Plus size={14} /> Add transcript</button>
      </div>
      {!blobReady && <p className="text-xs text-amber-600">Connect a Blob store to upload transcript files. You can still list them without uploads.</p>}
      {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}

      {adding && <TranscriptForm caseId={caseId} witnesses={witnesses} pending={pending} blobReady={blobReady} onCancel={() => setAdding(false)} onSaved={() => setAdding(false)} run={run} />}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5 text-center text-sm text-[var(--c-ink-muted)]">
          No transcripts yet. Upload deposition transcripts and witness statements here so the page/line citations in the proof matrix have a source.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--c-border)] overflow-hidden rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]">
          {rows.map((t) => (
            <li key={t.id} className="p-3">
              {editId === t.id ? (
                <TranscriptForm caseId={caseId} existing={t} witnesses={witnesses} pending={pending} blobReady={blobReady} onCancel={() => setEditId(null)} onSaved={() => setEditId(null)} run={run} />
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="shrink-0 rounded bg-[var(--c-accent)]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[var(--c-accent)]">{KIND_LABEL[t.kind] ?? t.kind}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[var(--c-ink)]">{t.title}</span>
                    <span className="block truncate text-xs text-[var(--c-ink-muted)]">
                      {[t.witnessId ? wById.get(t.witnessId)?.name : "", fmtDate(t.takenOn), t.url ? fmtSize(t.sizeBytes) : "", t.notes].filter(Boolean).join("  ·  ") || "No details"}
                    </span>
                  </span>
                  {t.url && <Paperclip size={13} className="shrink-0 text-[var(--c-ink-muted)]" />}
                  {t.url && <a href={t.url} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Open"><ExternalLink size={14} /></a>}
                  <button onClick={() => setEditId(t.id)} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Edit"><Pencil size={14} /></button>
                  <button onClick={() => { if (confirm(`Remove “${t.title}”?`)) run(() => deleteTranscript(t.id)); }} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600" title="Remove"><Trash2 size={14} /></button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TranscriptForm({ caseId, existing, witnesses, pending, blobReady, onCancel, onSaved, run }: {
  caseId: number; existing?: TranscriptRow; witnesses: WitnessLite[]; pending: boolean; blobReady: boolean;
  onCancel: () => void; onSaved: () => void;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [f, setF] = useState({
    ...EMPTY,
    ...(existing ? { title: existing.title, kind: existing.kind, witnessId: existing.witnessId ? String(existing.witnessId) : "", takenOn: existing.takenOn ?? "", notes: existing.notes } : {}),
  });
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<{ url: string; pathname: string; contentType?: string; size?: number } | null>(null);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(file: File) {
    setUploading(true);
    try {
      const blob = await upload(`trial/${caseId}/transcripts/${file.name}`, file, { access: "public", handleUploadUrl: "/api/admin/trial-upload", clientPayload: String(caseId), multipart: true });
      setUploaded({ url: blob.url, pathname: blob.pathname, contentType: file.type || blob.contentType, size: file.size });
      setFileName(file.name);
      if (!f.title.trim()) setF((s) => ({ ...s, title: file.name.replace(/\.[^.]+$/, "") }));
    } catch {
      setFileName("");
      alert("Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  function save() {
    const payload = { title: f.title, kind: f.kind, witnessId: f.witnessId ? Number(f.witnessId) : null, takenOn: f.takenOn, notes: f.notes, file: uploaded ?? undefined };
    run(async () => {
      const r = existing ? await updateTranscript(existing.id, payload) : await addTranscript(caseId, payload);
      if (r.ok) onSaved();
      return r;
    });
  }

  return (
    <div className={existing ? "space-y-2" : "space-y-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-3"}>
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Title — e.g. Deposition of Tommy Morgan *" className={`${input} sm:col-span-2`} autoFocus />
        <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className={input}>
          <option value="deposition">Deposition</option>
          <option value="statement">Statement</option>
          <option value="hearing">Hearing</option>
          <option value="other">Other</option>
        </select>
        <select value={f.witnessId} onChange={(e) => setF({ ...f, witnessId: e.target.value })} className={input}>
          <option value="">— link to a witness (optional) —</option>
          {witnesses.map((w) => <option key={w.id} value={w.id}>{`${w.side === "defendant" ? "[D] " : "[P] "}${w.name}`}</option>)}
        </select>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-[var(--c-ink)]">Date taken</label>
          <input type="date" value={f.takenOn} onChange={(e) => setF({ ...f, takenOn: e.target.value })} className={input} />
        </div>
        <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Notes" className={input} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) pick(file); }} />
        <button onClick={() => fileRef.current?.click()} disabled={!blobReady || uploading} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs hover:bg-[var(--c-surface2)] disabled:opacity-50">
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {existing?.url ? "Replace transcript" : "Upload the transcript"}
        </button>
        {fileName && <span className="text-xs text-[var(--c-ink-muted)]">{fileName}</span>}
        {!fileName && existing?.url && <a href={existing.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[var(--c-accent)]"><ExternalLink size={12} /> current file</a>}
      </div>

      <div className="flex gap-2">
        <button onClick={save} disabled={pending || uploading || !f.title.trim()} className="btn btn-accent inline-flex items-center gap-1.5 text-xs py-1.5 px-3 disabled:opacity-50">
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Save
        </button>
        <button onClick={onCancel} className="text-xs text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={13} className="inline" /> Cancel</button>
      </div>
    </div>
  );
}
