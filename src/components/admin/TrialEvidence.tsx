"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Plus, Trash2, Loader2, Users, FileText, Upload, ExternalLink, X, Pencil, Paperclip, ChevronDown, ChevronUp, Scale, ShieldCheck, UserRound, FolderUp, GripVertical } from "lucide-react";
import { addWitness, updateWitness, deleteWitness, addExhibit, updateExhibit, deleteExhibit, setWitnessStatus, setExhibitSponsors, setExhibitElements, bulkAddExhibits } from "@/app/admin/(panel)/pre-trial/evidence-actions";
import { parseExhibitName, suggestOrder, assignNumbers, nextNumbers, getScheme, NUMBER_SCHEMES, FOUNDATION_OPTIONS, type Side } from "@/lib/pretrial/exhibits";
import { filesFromDrop } from "@/lib/share/drop";
import { PopMenu, PopMenuItem } from "./PopMenu";

export type WitnessRow = { id: number; name: string; side: string; role: string; phone: string; email: string; available: string; appearance: string; notes: string };
export type ExhibitRow = { id: number; side: string; number: string; title: string; bates: string; description: string; status: string; url: string | null; sizeBytes: number | null; notes: string; witnessIds: number[]; foundation: string[]; /** Elements this exhibit is linked to on the proof matrix. */ elementIds: number[] };
export type ClaimLite = { id: number; name: string };
export type ElementLite = { id: number; claimId: number; text: string };

const input = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]";
type Run = (fn: () => Promise<{ ok: boolean; error?: string }>) => void;

const AVAIL: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "Confirmed", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40" },
  likely: { label: "Likely", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40" },
  unavailable: { label: "Unavailable", cls: "bg-red-500/15 text-red-600 border-red-500/40" },
  unknown: { label: "Unknown", cls: "bg-[var(--c-surface2)] text-[var(--c-ink-muted)] border-[var(--c-border)] border-dashed" },
};
const APPEAR: Record<string, string> = {
  "in-person": "In person",
  zoom: "By Zoom",
  "depo-written": "By deposition — written",
  "depo-video": "By deposition — video",
};
const STATUS: Record<string, string> = {
  listed: "bg-[var(--c-surface2)] text-[var(--c-ink-muted)] border-[var(--c-border)]",
  objected: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40",
  admitted: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40",
  excluded: "bg-red-500/15 text-red-600 border-red-500/40",
};
const fmtSize = (n: number | null) => (n == null ? "" : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

const EMPTY_W = { name: "", side: "plaintiff", role: "", phone: "", email: "", available: "unknown", appearance: "in-person", notes: "" };
const EMPTY_E = { title: "", side: "plaintiff", number: "", bates: "", description: "", status: "listed", notes: "" };

export function TrialEvidence({ caseId, witnesses, exhibits, claims, elements, blobReady }: {
  caseId: number; witnesses: WitnessRow[]; exhibits: ExhibitRow[]; claims: ClaimLite[]; elements: ElementLite[]; blobReady: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run: Run = (fn) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}
      <WitnessSection caseId={caseId} rows={witnesses} run={run} pending={pending} />
      <ExhibitSection caseId={caseId} rows={exhibits} witnesses={witnesses} claims={claims} elements={elements} run={run} pending={pending} blobReady={blobReady} />
    </div>
  );
}

/* ------------------------------- small chips ------------------------------ */

/**
 * A pill that opens its choices on click — availability and appearance. Uses the
 * shared PopMenu so the list escapes the row's clipping and scrolls if needed.
 */
function ChoiceChip({ value, options, onPick, className, title, pending }: {
  value: string; options: { id: string; label: string }[]; onPick: (id: string) => void;
  className: string; title: string; pending: boolean;
}) {
  const label = options.find((o) => o.id === value)?.label ?? value;
  return (
    <PopMenu
      disabled={pending}
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-opacity hover:opacity-80 ${className}`}
      label={<>{label} <ChevronDown size={10} /></>}
    >
      {(close) =>
        options.map((o) => (
          <PopMenuItem key={o.id} active={o.id === value} onClick={() => { close(); onPick(o.id); }}>
            {o.label}
          </PopMenuItem>
        ))
      }
    </PopMenu>
  );
}

/* -------------------------------- witnesses ------------------------------- */

function WitnessSection({ caseId, rows, run, pending }: { caseId: number; rows: WitnessRow[]; run: Run; pending: boolean }) {
  const [adding, setAdding] = useState(false);
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
        <button onClick={() => setAdding((v) => !v)} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs hover:bg-[var(--c-surface2)]"><Plus size={14} /> Add witness</button>
      </div>

      {adding && <WitnessForm pending={pending} onCancel={() => setAdding(false)} onSave={(v) => run(async () => { const r = await addWitness(caseId, v); if (r.ok) setAdding(false); return r; })} />}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5 text-center text-sm text-[var(--c-ink-muted)]">No witnesses listed yet.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.key}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">{g.label}</p>
              <ul className="divide-y divide-[var(--c-border)] rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]">
                {rows.filter((r) => r.side === g.key).map((w) => (
                  <li key={w.id} className="p-3">
                    {editId === w.id ? (
                      <WitnessForm existing={w} pending={pending} inline onCancel={() => setEditId(null)} onSave={(v) => run(async () => { const r = await updateWitness(w.id, v); if (r.ok) setEditId(null); return r; })} />
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-[var(--c-ink)]">{w.name}</span>
                          <span className="block truncate text-xs text-[var(--c-ink-muted)]">
                            {[w.role, w.phone, w.email].filter(Boolean).join("  ·  ") || "No contact details"}
                            {w.notes && ` — ${w.notes}`}
                          </span>
                        </span>
                        {/* Both chips are click-to-change. */}
                        <ChoiceChip
                          value={w.appearance}
                          options={Object.entries(APPEAR).map(([id, label]) => ({ id, label }))}
                          onPick={(v) => run(() => setWitnessStatus(w.id, { appearance: v }))}
                          className="border-[var(--c-border)] bg-[var(--c-surface2)] text-[var(--c-ink-muted)]"
                          title="How this witness will appear — click to change"
                          pending={pending}
                        />
                        <ChoiceChip
                          value={w.available}
                          options={Object.entries(AVAIL).map(([id, v]) => ({ id, label: v.label }))}
                          onPick={(v) => run(() => setWitnessStatus(w.id, { available: v }))}
                          className={AVAIL[w.available]?.cls ?? AVAIL.unknown.cls}
                          title="Availability — click to change"
                          pending={pending}
                        />
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

function WitnessForm({ existing, pending, onCancel, onSave, inline }: {
  existing?: WitnessRow; pending: boolean; onCancel: () => void; onSave: (v: typeof EMPTY_W) => void; inline?: boolean;
}) {
  const [f, setF] = useState({ ...EMPTY_W, ...(existing ?? {}) });
  return (
    <div className={`space-y-2 ${inline ? "" : "mb-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-3"}`}>
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Witness name *" className={input} autoFocus />
        <input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="Role — e.g. Expert surveyor" className={input} />
        <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Phone" className={input} />
        <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="Email" className={input} />
        <select value={f.side} onChange={(e) => setF({ ...f, side: e.target.value })} className={input}>
          <option value="plaintiff">Plaintiff&apos;s witness</option>
          <option value="defendant">Defendant&apos;s witness</option>
          <option value="third-party">Third party</option>
        </select>
        <select value={f.available} onChange={(e) => setF({ ...f, available: e.target.value })} className={input}>
          {Object.entries(AVAIL).map(([id, v]) => <option key={id} value={id}>{v.label}</option>)}
        </select>
        <select value={f.appearance} onChange={(e) => setF({ ...f, appearance: e.target.value })} className={input}>
          {Object.entries(APPEAR).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Notes" className={input} />
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave(f)} disabled={pending || !f.name.trim()} className="btn btn-accent inline-flex items-center gap-1.5 text-xs py-1.5 px-3 disabled:opacity-50">
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Save
        </button>
        <button onClick={onCancel} className="text-xs text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">Cancel</button>
      </div>
    </div>
  );
}

/* -------------------------------- exhibits -------------------------------- */

function ExhibitSection({ caseId, rows, witnesses, claims, elements, run, pending, blobReady }: {
  caseId: number; rows: ExhibitRow[]; witnesses: WitnessRow[]; claims: ClaimLite[]; elements: ElementLite[];
  run: Run; pending: boolean; blobReady: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);

  const groups = [
    { key: "plaintiff", label: "Plaintiff's exhibits" },
    { key: "defendant", label: "Defendant's exhibits" },
    { key: "joint", label: "Joint exhibits" },
  ].filter((g) => rows.some((r) => r.side === g.key));

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="inline-flex items-center gap-2 font-[family-name:var(--font-ui)] font-semibold"><FileText size={16} className="text-[var(--c-accent)]" /> Exhibit list ({rows.length})</h3>
        <div className="ml-auto flex flex-wrap gap-2">
          <button onClick={() => setImporting(true)} disabled={!blobReady} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-accent)] px-2.5 py-1.5 text-xs font-medium text-[var(--c-accent)] hover:bg-[var(--c-accent)]/10 disabled:opacity-50">
            <FolderUp size={14} /> Import a batch
          </button>
          <button onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs hover:bg-[var(--c-surface2)]"><Plus size={14} /> Add one</button>
        </div>
      </div>
      {!blobReady && <p className="mb-2 text-xs text-amber-600">Connect a Blob store to attach exhibit files. You can still list exhibits without uploads.</p>}

      {adding && <ExhibitForm caseId={caseId} pending={pending} blobReady={blobReady} onCancel={() => setAdding(false)} onSaved={() => setAdding(false)} run={run} />}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5 text-center text-sm text-[var(--c-ink-muted)]">
          No exhibits yet. <strong>Import a batch</strong> to drop in a whole folder at once — it reads the numbers off the filenames and lets you set the order.
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.key}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">{g.label}</p>
              <ul className="divide-y divide-[var(--c-border)] rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]">
                {rows.filter((r) => r.side === g.key).map((x) => (
                  <li key={x.id} className="p-3">
                    {editId === x.id ? (
                      <ExhibitForm caseId={caseId} existing={x} pending={pending} blobReady={blobReady} onCancel={() => setEditId(null)} onSaved={() => setEditId(null)} run={run} />
                    ) : (
                      <ExhibitRowView x={x} witnesses={witnesses} claims={claims} elements={elements} run={run} pending={pending} onEdit={() => setEditId(x.id)} />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {importing && <BulkImportDialog caseId={caseId} existing={rows} onClose={() => setImporting(false)} run={run} pending={pending} />}
    </section>
  );
}

function ExhibitRowView({ x, witnesses, claims, elements, run, pending, onEdit }: {
  x: ExhibitRow; witnesses: WitnessRow[]; claims: ClaimLite[]; elements: ElementLite[];
  run: Run; pending: boolean; onEdit: () => void;
}) {
  const [openPanel, setOpenPanel] = useState<null | "elements" | "sponsors">(null);
  const wById = useMemo(() => new Map(witnesses.map((w) => [w.id, w])), [witnesses]);
  const sponsors = x.witnessIds.map((id) => wById.get(id)?.name).filter(Boolean) as string[];
  const founds = x.foundation.map((f) => FOUNDATION_OPTIONS.find((o) => o.id === f)?.label).filter(Boolean) as string[];

  // Which elements this exhibit is already attached to (via the proof matrix).
  const linked = elements.filter((e) => x.elementIds.includes(e.id));

  return (
    <div className="space-y-2">
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
        <button onClick={onEdit} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Edit"><Pencil size={14} /></button>
        <button onClick={() => { if (confirm(`Remove exhibit “${x.title}”?`)) run(() => deleteExhibit(x.id)); }} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600" title="Remove"><Trash2 size={14} /></button>
      </div>

      {/* Two drop-downs: what it proves, and how it gets in. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={() => setOpenPanel((p) => (p === "elements" ? null : "elements"))} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${linked.length ? "border-[var(--c-accent)]/40 bg-[var(--c-accent)]/10 text-[var(--c-accent)]" : "border-dashed border-[var(--c-border)] text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]"}`}>
          <Scale size={11} /> {linked.length ? `Proves ${linked.length} element${linked.length === 1 ? "" : "s"}` : "Link to elements"}
          {openPanel === "elements" ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </button>
        <button onClick={() => setOpenPanel((p) => (p === "sponsors" ? null : "sponsors"))} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${sponsors.length || founds.length ? "border-[var(--c-accent)]/40 bg-[var(--c-accent)]/10 text-[var(--c-accent)]" : "border-dashed border-[var(--c-border)] text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]"}`}>
          <UserRound size={11} /> {sponsors.length || founds.length ? `Comes in through ${[...sponsors, ...founds].join(", ")}` : "Comes in through…"}
          {openPanel === "sponsors" ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </button>
      </div>

      {openPanel === "elements" && (
        <ElementPicker
          claims={claims}
          elements={elements}
          selected={linked.map((e) => e.id)}
          pending={pending}
          onSave={(ids) => { setOpenPanel(null); run(() => setExhibitElements(x.id, ids)); }}
          onCancel={() => setOpenPanel(null)}
        />
      )}

      {openPanel === "sponsors" && (
        <SponsorPicker
          witnesses={witnesses}
          selectedWitnesses={x.witnessIds}
          selectedFoundation={x.foundation}
          pending={pending}
          onSave={(ids, fnd) => { setOpenPanel(null); run(() => setExhibitSponsors(x.id, ids, fnd)); }}
          onCancel={() => setOpenPanel(null)}
        />
      )}
    </div>
  );
}

/** Cause of action → elements, with a checkbox per element. */
function ElementPicker({ claims, elements, selected, pending, onSave, onCancel }: {
  claims: ClaimLite[]; elements: ElementLite[]; selected: number[]; pending: boolean;
  onSave: (ids: number[]) => void; onCancel: () => void;
}) {
  const [sel, setSel] = useState<Set<number>>(() => new Set(selected));
  const toggle = (id: number) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  if (claims.length === 0) {
    return <p className="rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-3 text-xs text-[var(--c-ink-muted)]">No causes of action yet — add them on the <strong>Proof Matrix</strong> tab, then link exhibits here.</p>;
  }

  return (
    <div className="max-h-80 space-y-3 overflow-auto rounded-md border border-[var(--c-accent)]/40 bg-[var(--c-bg)] p-3">
      <p className="text-[11px] text-[var(--c-ink-muted)]">Check the elements this exhibit helps prove. They appear on the Proof Matrix under each count.</p>
      {claims.map((c) => {
        const els = elements.filter((e) => e.claimId === c.id);
        if (!els.length) return null;
        return (
          <div key={c.id}>
            <p className="mb-1 text-[11px] font-bold text-[var(--c-ink)]">{c.name}</p>
            <div className="space-y-0.5 pl-1">
              {els.map((e) => (
                <label key={e.id} className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-xs hover:bg-[var(--c-surface2)]">
                  <input type="checkbox" checked={sel.has(e.id)} onChange={() => toggle(e.id)} className="mt-0.5 shrink-0" />
                  <span className="text-[var(--c-ink)]">{e.text}</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
      <div className="flex gap-2 border-t border-[var(--c-border)] pt-2">
        <button onClick={() => onSave([...sel])} disabled={pending} className="btn btn-accent text-xs py-1.5 px-3 disabled:opacity-50">Save links</button>
        <button onClick={onCancel} className="text-xs text-[var(--c-ink-muted)]">Cancel</button>
      </div>
    </div>
  );
}

/** Which witness(es) sponsor this exhibit, or the foundation that replaces one. */
function SponsorPicker({ witnesses, selectedWitnesses, selectedFoundation, pending, onSave, onCancel }: {
  witnesses: WitnessRow[]; selectedWitnesses: number[]; selectedFoundation: string[]; pending: boolean;
  onSave: (ids: number[], foundation: string[]) => void; onCancel: () => void;
}) {
  const [w, setW] = useState<Set<number>>(() => new Set(selectedWitnesses));
  const [f, setF] = useState<Set<string>>(() => new Set(selectedFoundation));

  return (
    <div className="max-h-80 space-y-3 overflow-auto rounded-md border border-[var(--c-accent)]/40 bg-[var(--c-bg)] p-3">
      <div>
        <p className="mb-1 text-[11px] font-bold text-[var(--c-ink)]">Sponsoring witness</p>
        {witnesses.length === 0 ? (
          <p className="text-xs text-[var(--c-ink-muted)]">No witnesses on this case yet — add them above.</p>
        ) : (
          <div className="space-y-0.5">
            {witnesses.map((x) => (
              <label key={x.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-[var(--c-surface2)]">
                <input type="checkbox" checked={w.has(x.id)} onChange={() => setW((p) => { const n = new Set(p); if (n.has(x.id)) n.delete(x.id); else n.add(x.id); return n; })} className="shrink-0" />
                <span className="text-[var(--c-ink)]">{x.name}</span>
                {x.role && <span className="text-[var(--c-ink-muted)]">— {x.role}</span>}
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-[var(--c-border)] pt-2">
        <p className="mb-1 inline-flex items-center gap-1 text-[11px] font-bold text-[var(--c-ink)]"><ShieldCheck size={12} className="text-[var(--c-accent)]" /> Or comes in without a witness</p>
        <div className="space-y-0.5">
          {FOUNDATION_OPTIONS.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-xs hover:bg-[var(--c-surface2)]">
              <input type="checkbox" checked={f.has(o.id)} onChange={() => setF((p) => { const n = new Set(p); if (n.has(o.id)) n.delete(o.id); else n.add(o.id); return n; })} className="mt-0.5 shrink-0" />
              <span>
                <span className="block text-[var(--c-ink)]">{o.label}</span>
                <span className="block text-[10px] text-[var(--c-ink-muted)]">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex gap-2 border-t border-[var(--c-border)] pt-2">
        <button onClick={() => onSave([...w], [...f])} disabled={pending} className="btn btn-accent text-xs py-1.5 px-3 disabled:opacity-50">Save</button>
        <button onClick={onCancel} className="text-xs text-[var(--c-ink-muted)]">Cancel</button>
      </div>
    </div>
  );
}

/* ----------------------------- bulk exhibit import ------------------------ */

type StagedRow = {
  key: string; title: string; side: Side; bates: string; fileName: string;
  /** True when the filename declared the party, or the user picked it by hand —
   *  either way, changing the batch default must not overwrite it. */
  sideFromName: boolean;
  file?: { url: string; pathname: string; contentType?: string; size?: number };
};

/**
 * Drop in a folder of exhibits: each file uploads, its filename is read for a
 * party and number, the batch is put in its best-guess order, and the user
 * arranges and confirms before hard numbers are assigned per party.
 */
function BulkImportDialog({ caseId, existing, onClose, run, pending }: {
  caseId: number; existing: ExhibitRow[]; onClose: () => void; run: Run; pending: boolean;
}) {
  const [stage, setStage] = useState<"drop" | "arrange">("drop");
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [rows, setRows] = useState<StagedRow[]>([]);
  const [scheme, setScheme] = useState(NUMBER_SCHEMES[0].id);
  const [defaultSide, setDefaultSide] = useState<Side>("plaintiff");
  const [continueSeq, setContinueSeq] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);

  const start = useMemo(
    () => (continueSeq ? nextNumbers(existing.map((e) => ({ side: e.side, number: e.number }))) : { plaintiff: 1, defendant: 1, joint: 1 }),
    [existing, continueSeq],
  );
  const numbered = useMemo(() => assignNumbers(rows, scheme, start), [rows, scheme, start]);

  async function take(files: File[]) {
    // A second drop while the first is still uploading would race and lose rows.
    if (!files.length || busyRef.current) return;
    busyRef.current = true;
    setUploading({ done: 0, total: files.length });
    const staged: StagedRow[] = [];
    // Parse first so the running order can be suggested from the filenames. Files
    // are tracked by index, not name — a batch can contain two "scan.pdf".
    const parsed = suggestOrder(files.map((f, i) => ({ ...parseExhibitName(f.name), idx: i })));
    let done = 0;
    for (const p of parsed) {
      const file = files[(p as typeof p & { idx: number }).idx];
      let uploaded: StagedRow["file"];
      if (file) {
        try {
          const blob = await upload(`trial/${caseId}/exhibits/${file.name}`, file, { access: "public", handleUploadUrl: "/api/admin/trial-upload", clientPayload: String(caseId), multipart: true });
          uploaded = { url: blob.url, pathname: blob.pathname, contentType: file.type || blob.contentType, size: file.size };
        } catch {
          /* keep the row; it just won't have a file attached */
        }
      }
      staged.push({ key: `${p.fileName}-${staged.length}`, title: p.title, side: p.side ?? defaultSide, sideFromName: p.side != null, bates: p.bates, fileName: p.fileName, file: uploaded });
      done += 1;
      setUploading({ done, total: files.length });
    }
    setRows(staged);
    setUploading(null);
    setStage("arrange");
    busyRef.current = false;
  }

  const move = (i: number, dir: -1 | 1) => {
    setRows((r) => {
      const j = i + dir;
      if (j < 0 || j >= r.length) return r;
      const n = [...r];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  };

  function save() {
    run(async () => {
      const r = await bulkAddExhibits(caseId, numbered.map((n) => ({ title: n.title, side: n.side, number: n.number, bates: n.bates, file: n.file })));
      if (r.ok) onClose();
      return r;
    });
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget && !uploading) onClose(); }}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-[var(--c-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--c-border)] px-5 py-3">
          <h3 className="inline-flex items-center gap-2 font-[family-name:var(--font-display)] text-lg"><FolderUp size={18} className="text-[var(--c-accent)]" /> Import exhibits</h3>
          <button onClick={onClose} disabled={!!uploading} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)] disabled:opacity-40"><X size={18} /></button>
        </div>

        {stage === "drop" ? (
          <div className="p-5">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={async (e) => { e.preventDefault(); setDragOver(false); const picked = await filesFromDrop(e.dataTransfer); take(picked.map((p) => p.file)); }}
              className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors ${dragOver ? "border-[var(--c-accent)] bg-[var(--c-accent)]/5" : "border-[var(--c-border)]"}`}
            >
              {uploading ? (
                <>
                  <Loader2 size={28} className="animate-spin text-[var(--c-accent)]" />
                  <p className="text-sm font-medium">Uploading {uploading.done} / {uploading.total}…</p>
                  <p className="text-xs text-[var(--c-ink-muted)]">Keep this window open until it finishes.</p>
                </>
              ) : (
                <>
                  <FolderUp size={28} className="text-[var(--c-ink-muted)]" />
                  <p className="text-sm font-medium text-[var(--c-ink)]">Drop your exhibits here</p>
                  <p className="max-w-md text-xs text-[var(--c-ink-muted)]">
                    Drop as many files as you like. Names like <strong>P-1</strong>, <strong>D-12</strong>, <strong>EX 3</strong> or
                    {" "}<strong>Plaintiff&apos;s Exhibit 4</strong> are read automatically and used to set the running order — you can rearrange before anything is saved.
                  </p>
                  <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => take(Array.from(e.target.files ?? []))} />
                  <button onClick={() => fileRef.current?.click()} className="btn btn-accent mt-1 text-sm py-2 px-4">Choose files</button>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3 border-b border-[var(--c-border)] px-5 py-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[var(--c-ink)]">Numbering</label>
                <select value={scheme} onChange={(e) => setScheme(e.target.value)} className={input}>
                  {NUMBER_SCHEMES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[var(--c-ink)]">Party for un-labelled files</label>
                <select
                  value={defaultSide}
                  onChange={(e) => { const v = e.target.value as Side; setDefaultSide(v); setRows((r) => r.map((x) => (x.sideFromName ? x : { ...x, side: v }))); }}
                  className={input}
                >
                  <option value="plaintiff">Plaintiff&apos;s</option>
                  <option value="defendant">Defendant&apos;s</option>
                  <option value="joint">Joint</option>
                </select>
              </div>
              <label className="flex cursor-pointer items-center gap-1.5 pb-2 text-xs text-[var(--c-ink-muted)]">
                <input type="checkbox" checked={continueSeq} onChange={(e) => setContinueSeq(e.target.checked)} />
                Continue from existing numbers
              </label>
              <span className="ml-auto pb-2 text-xs text-[var(--c-ink-muted)]">{rows.length} file{rows.length === 1 ? "" : "s"}</span>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-3">
              <ul className="space-y-1">
                {numbered.map((r, i) => (
                  <li key={r.key} className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-2">
                    <GripVertical size={14} className="shrink-0 text-[var(--c-ink-muted)]/50" />
                    <span className="w-20 shrink-0 rounded bg-[var(--c-accent)]/10 px-1.5 py-0.5 text-center text-[11px] font-bold text-[var(--c-accent)]">{r.number}</span>
                    <input
                      value={r.title}
                      onChange={(e) => setRows((rr) => rr.map((x) => (x.key === r.key ? { ...x, title: e.target.value } : x)))}
                      className={`${input} min-w-[160px] flex-1`}
                    />
                    <select
                      value={r.side}
                      onChange={(e) => setRows((rr) => rr.map((x) => (x.key === r.key ? { ...x, side: e.target.value as Side, sideFromName: true } : x)))}
                      className="shrink-0 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-1.5 py-1.5 text-xs outline-none"
                    >
                      <option value="plaintiff">P</option>
                      <option value="defendant">D</option>
                      <option value="joint">J</option>
                    </select>
                    {r.file ? <Paperclip size={12} className="shrink-0 text-[var(--c-ink-muted)]" /> : <span className="shrink-0 text-[10px] text-amber-600">no file</span>}
                    <span className="flex shrink-0 flex-col">
                      <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded px-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)] disabled:opacity-25"><ChevronUp size={12} /></button>
                      <button onClick={() => move(i, 1)} disabled={i === numbered.length - 1} className="rounded px-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)] disabled:opacity-25"><ChevronDown size={12} /></button>
                    </span>
                    <button onClick={() => setRows((rr) => rr.filter((x) => x.key !== r.key))} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600" title="Drop from this batch"><X size={13} /></button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-[var(--c-border)] px-5 py-3">
              <p className="text-xs text-[var(--c-ink-muted)]">Numbers are assigned separately per party.</p>
              <div className="flex gap-2">
                <button onClick={onClose} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
                <button onClick={save} disabled={pending || rows.length === 0} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-50">
                  {pending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Add {rows.length} exhibit{rows.length === 1 ? "" : "s"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ single exhibit ---------------------------- */

function ExhibitForm({ caseId, existing, pending, blobReady, onCancel, onSaved, run }: {
  caseId: number; existing?: ExhibitRow; pending: boolean; blobReady: boolean;
  onCancel: () => void; onSaved: () => void; run: Run;
}) {
  const [f, setF] = useState({ ...EMPTY_E, ...(existing ?? {}) });
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<{ url: string; pathname: string; contentType?: string; size?: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");

  async function pick(file: File) {
    setUploading(true);
    try {
      const blob = await upload(`trial/${caseId}/exhibits/${file.name}`, file, { access: "public", handleUploadUrl: "/api/admin/trial-upload", clientPayload: String(caseId), multipart: true });
      setUploaded({ url: blob.url, pathname: blob.pathname, contentType: file.type || blob.contentType, size: file.size });
      setFileName(file.name);
      // Read the number and title straight off the filename, like the batch import.
      const p = parseExhibitName(file.name);
      setF((s) => ({ ...s, title: s.title.trim() || p.title, bates: s.bates || p.bates, side: p.side ?? s.side, number: s.number.trim() || (p.number !== null ? getScheme("dash").format(p.side ?? (s.side as Side), p.number) : "") }));
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
