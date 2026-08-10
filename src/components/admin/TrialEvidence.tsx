"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Plus, Trash2, Loader2, Users, FileText, Upload, ExternalLink, X, Pencil, Paperclip } from "lucide-react";
import { addWitness, updateWitness, deleteWitness, addExhibit, updateExhibit, deleteExhibit } from "@/app/admin/(panel)/pre-trial/evidence-actions";

export type WitnessRow = { id: number; name: string; side: string; role: string; phone: string; email: string; available: string; appearance: string; notes: string };
export type ExhibitRow = { id: number; side: string; number: string; title: string; bates: string; description: string; status: string; url: string | null; sizeBytes: number | null; notes: string };

const input = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]";

const AVAIL: Record<string, string> = { confirmed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40", likely: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40", unavailable: "bg-red-500/15 text-red-600 border-red-500/40", unknown: "bg-[var(--c-surface2)] text-[var(--c-ink-muted)] border-[var(--c-border)]" };
const STATUS: Record<string, string> = { listed: "bg-[var(--c-surface2)] text-[var(--c-ink-muted)] border-[var(--c-border)]", objected: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40", admitted: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40", excluded: "bg-red-500/15 text-red-600 border-red-500/40" };
const fmtSize = (n: number | null) => (n == null ? "" : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

const EMPTY_W = { name: "", side: "plaintiff", role: "", phone: "", email: "", available: "unknown", appearance: "in-person", notes: "" };
const EMPTY_E = { title: "", side: "plaintiff", number: "", bates: "", description: "", status: "listed", notes: "" };

export function TrialEvidence({ caseId, witnesses, exhibits, blobReady }: { caseId: number; witnesses: WitnessRow[]; exhibits: ExhibitRow[]; blobReady: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}
      <WitnessSection caseId={caseId} rows={witnesses} run={run} pending={pending} />
      <ExhibitSection caseId={caseId} rows={exhibits} run={run} pending={pending} blobReady={blobReady} />
    </div>
  );
}

/* -------------------------------- witnesses ------------------------------- */

function WitnessSection({ caseId, rows, run, pending }: { caseId: number; rows: WitnessRow[]; run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void; pending: boolean }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_W });
  const [editId, setEditId] = useState<number | null>(null);

  const groups = [
    { key: "plaintiff", label: "Plaintiff's witnesses" },
    { key: "defendant", label: "Defendant's witnesses" },
    { key: "third-party", label: "Third-party witnesses" },
  ].filter((g) => rows.some((r) => r.side === g.key));

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="inline-flex items-center gap-2 font-[family-name:var(--font-ui)] font-semibold"><Users size={16} className="text-[var(--c-accent)]" /> Witnesses ({rows.length})</h3>
        <button onClick={() => { setForm({ ...EMPTY_W }); setAdding((v) => !v); }} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs hover:bg-[var(--c-surface2)]"><Plus size={14} /> Add witness</button>
      </div>

      {adding && (
        <WitnessForm
          form={form}
          setForm={setForm}
          pending={pending}
          onCancel={() => setAdding(false)}
          onSave={() => run(async () => { const r = await addWitness(caseId, form); if (r.ok) { setForm({ ...EMPTY_W }); setAdding(false); } return r; })}
        />
      )}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5 text-center text-sm text-[var(--c-ink-muted)]">No witnesses listed yet.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.key}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">{g.label}</p>
              <ul className="divide-y divide-[var(--c-border)] overflow-hidden rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]">
                {rows.filter((r) => r.side === g.key).map((w) => (
                  <li key={w.id} className="p-3">
                    {editId === w.id ? (
                      <WitnessForm
                        form={w}
                        setForm={() => {}}
                        pending={pending}
                        inline
                        onCancel={() => setEditId(null)}
                        onSave={(patch) => run(async () => { const r = await updateWitness(w.id, patch!); if (r.ok) setEditId(null); return r; })}
                      />
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-[var(--c-ink)]">{w.name}</span>
                          <span className="block truncate text-xs text-[var(--c-ink-muted)]">
                            {[w.role, w.phone, w.email].filter(Boolean).join("  ·  ") || "No contact details"}
                            {w.notes && ` — ${w.notes}`}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full border border-[var(--c-border)] bg-[var(--c-surface2)] px-2 py-0.5 text-[10px] text-[var(--c-ink-muted)]">{w.appearance === "zoom" ? "Zoom" : w.appearance === "deposition" ? "By depo" : "In person"}</span>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${AVAIL[w.available] ?? AVAIL.unknown}`}>{w.available}</span>
                        <button onClick={() => setEditId(w.id)} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Edit"><Pencil size={14} /></button>
                        <button onClick={() => { if (confirm(`Remove ${w.name} from the witness list?`)) run(() => deleteWitness(w.id)); }} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600" title="Remove"><Trash2 size={14} /></button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function WitnessForm({ form, setForm, pending, onCancel, onSave, inline }: {
  form: typeof EMPTY_W | WitnessRow;
  setForm: (f: typeof EMPTY_W) => void;
  pending: boolean; onCancel: () => void;
  onSave: (patch?: typeof EMPTY_W) => void;
  inline?: boolean;
}) {
  const [local, setLocal] = useState({ ...EMPTY_W, ...form });
  const upd = (patch: Partial<typeof EMPTY_W>) => {
    const next = { ...local, ...patch };
    setLocal(next);
    if (!inline) setForm(next);
  };
  return (
    <div className={`space-y-2 ${inline ? "" : "mb-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-3"}`}>
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={local.name} onChange={(e) => upd({ name: e.target.value })} placeholder="Witness name *" className={input} autoFocus />
        <input value={local.role} onChange={(e) => upd({ role: e.target.value })} placeholder="Role — e.g. Expert surveyor, Fact witness" className={input} />
        <input value={local.phone} onChange={(e) => upd({ phone: e.target.value })} placeholder="Phone" className={input} />
        <input value={local.email} onChange={(e) => upd({ email: e.target.value })} placeholder="Email" className={input} />
        <select value={local.side} onChange={(e) => upd({ side: e.target.value })} className={input}>
          <option value="plaintiff">Plaintiff&apos;s witness</option>
          <option value="defendant">Defendant&apos;s witness</option>
          <option value="third-party">Third party</option>
        </select>
        <select value={local.available} onChange={(e) => upd({ available: e.target.value })} className={input}>
          <option value="unknown">Availability unknown</option>
          <option value="confirmed">Confirmed</option>
          <option value="likely">Likely</option>
          <option value="unavailable">Unavailable</option>
        </select>
        <select value={local.appearance} onChange={(e) => upd({ appearance: e.target.value })} className={input}>
          <option value="in-person">Appears in person</option>
          <option value="zoom">Appears by Zoom</option>
          <option value="deposition">By deposition</option>
        </select>
        <input value={local.notes} onChange={(e) => upd({ notes: e.target.value })} placeholder="Notes" className={input} />
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave(local)} disabled={pending || !local.name.trim()} className="btn btn-accent inline-flex items-center gap-1.5 text-xs py-1.5 px-3 disabled:opacity-50">
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Save
        </button>
        <button onClick={onCancel} className="text-xs text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">Cancel</button>
      </div>
    </div>
  );
}

/* -------------------------------- exhibits -------------------------------- */

function ExhibitSection({ caseId, rows, run, pending, blobReady }: { caseId: number; rows: ExhibitRow[]; run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void; pending: boolean; blobReady: boolean }) {
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const groups = [
    { key: "plaintiff", label: "Plaintiff's exhibits" },
    { key: "defendant", label: "Defendant's exhibits" },
    { key: "joint", label: "Joint exhibits" },
  ].filter((g) => rows.some((r) => r.side === g.key));

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="inline-flex items-center gap-2 font-[family-name:var(--font-ui)] font-semibold"><FileText size={16} className="text-[var(--c-accent)]" /> Exhibit list ({rows.length})</h3>
        <button onClick={() => setAdding((v) => !v)} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs hover:bg-[var(--c-surface2)]"><Plus size={14} /> Add exhibit</button>
      </div>
      {!blobReady && <p className="mb-2 text-xs text-amber-600">Connect a Blob store to attach exhibit files. You can still list exhibits without uploads.</p>}

      {adding && <ExhibitForm caseId={caseId} pending={pending} blobReady={blobReady} onCancel={() => setAdding(false)} onSaved={() => setAdding(false)} run={run} />}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5 text-center text-sm text-[var(--c-ink-muted)]">No exhibits listed yet.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.key}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">{g.label}</p>
              <ul className="divide-y divide-[var(--c-border)] overflow-hidden rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]">
                {rows.filter((r) => r.side === g.key).map((x) => (
                  <li key={x.id} className="p-3">
                    {editId === x.id ? (
                      <ExhibitForm caseId={caseId} existing={x} pending={pending} blobReady={blobReady} onCancel={() => setEditId(null)} onSaved={() => setEditId(null)} run={run} />
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        {x.number && <span className="shrink-0 rounded bg-[var(--c-accent)]/10 px-1.5 py-0.5 text-[11px] font-bold text-[var(--c-accent)]">{x.number}</span>}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-[var(--c-ink)]">{x.title}</span>
                          <span className="block truncate text-xs text-[var(--c-ink-muted)]">
                            {[x.bates, x.description].filter(Boolean).join("  ·  ")}
                            {x.url && <> · {fmtSize(x.sizeBytes)}</>}
                          </span>
                        </span>
                        {x.url && <Paperclip size={13} className="shrink-0 text-[var(--c-ink-muted)]" />}
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS[x.status] ?? STATUS.listed}`}>{x.status}</span>
                        {x.url && <a href={x.url} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Open"><ExternalLink size={14} /></a>}
                        <button onClick={() => setEditId(x.id)} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Edit"><Pencil size={14} /></button>
                        <button onClick={() => { if (confirm(`Remove exhibit “${x.title}”?`)) run(() => deleteExhibit(x.id)); }} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600" title="Remove"><Trash2 size={14} /></button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ExhibitForm({ caseId, existing, pending, blobReady, onCancel, onSaved, run }: {
  caseId: number; existing?: ExhibitRow; pending: boolean; blobReady: boolean;
  onCancel: () => void; onSaved: () => void;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [f, setF] = useState({ ...EMPTY_E, ...(existing ?? {}) });
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<{ url: string; pathname: string; contentType?: string; size?: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");

  async function pick(file: File) {
    setUploading(true);
    try {
      const blob = await upload(`trial/${caseId}/exhibits/${file.name}`, file, { access: "public", handleUploadUrl: "/api/admin/trial-upload", clientPayload: String(caseId) });
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
    const payload = { ...f, file: uploaded ?? undefined };
    run(async () => {
      const r = existing ? await updateExhibit(existing.id, payload) : await addExhibit(caseId, payload);
      if (r.ok) onSaved();
      return r;
    });
  }

  return (
    <div className={existing ? "space-y-2" : "mb-3 space-y-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-3"}>
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} placeholder="Exhibit no. — e.g. P-12" className={input} />
        <select value={f.side} onChange={(e) => setF({ ...f, side: e.target.value })} className={input}>
          <option value="plaintiff">Plaintiff&apos;s exhibit</option>
          <option value="defendant">Defendant&apos;s exhibit</option>
          <option value="joint">Joint exhibit</option>
        </select>
        <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Description *" className={`${input} sm:col-span-2`} />
        <input value={f.bates} onChange={(e) => setF({ ...f, bates: e.target.value })} placeholder="Bates — e.g. RES_000260" className={input} />
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className={input}>
          <option value="listed">Listed</option>
          <option value="objected">Objected to</option>
          <option value="admitted">Admitted</option>
          <option value="excluded">Excluded</option>
        </select>
        <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Notes" className={`${input} sm:col-span-2`} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) pick(file); }} />
        <button onClick={() => fileRef.current?.click()} disabled={!blobReady || uploading} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs hover:bg-[var(--c-surface2)] disabled:opacity-50">
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {existing?.url ? "Replace file" : "Attach the exhibit"}
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
