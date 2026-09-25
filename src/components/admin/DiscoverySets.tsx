"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Loader2, FileStack, Archive, ArchiveRestore, Trash2, X, ChevronRight, Link2 } from "lucide-react";
import { MatterPicker, type MatterOption } from "./MatterPicker";
import { createDiscoverySet, setDiscoverySetArchived, deleteDiscoverySet } from "@/app/admin/(panel)/discovery-reviewer/actions";

export type DiscoverySetRow = {
  id: number; name: string; matter: string; causeNumber: string; court: string; archived: boolean;
  docs: number; pages: number; plaintiff: number; defendant: number; linked: boolean;
};

const input = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";

export function DiscoverySets({ sets, matters, exhibitMatters, hub = {} }: { sets: DiscoverySetRow[]; matters: MatterOption[]; exhibitMatters: string[]; hub?: Record<string, { name: string; causeNumber: string; court: string }> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", matter: "", causeNumber: "", court: "" });
  const [alsoExhibit, setAlsoExhibit] = useState(true);

  const exhibitExists = !!f.matter.trim() && exhibitMatters.includes(f.matter.trim());

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      router.refresh();
    });
  };

  function submit() {
    if (!f.name.trim()) { setError("Enter a case name."); return; }
    start(async () => {
      const r = await createDiscoverySet(f, alsoExhibit && !exhibitExists);
      if (r.ok) { setF({ name: "", matter: "", causeNumber: "", court: "" }); setAdding(false); router.push(`/admin/discovery-reviewer/${r.id}`); }
      else setError(r.error ?? "Couldn't create the case.");
    });
  }

  const active = sets.filter((s) => !s.archived);
  const archived = sets.filter((s) => s.archived);

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}

      {adding ? (
        <div className="rounded-lg border-2 border-dashed border-[var(--c-accent)]/40 bg-[var(--c-surface)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-[family-name:var(--font-display)] text-lg">New discovery case</h3>
            <button onClick={() => setAdding(false)} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={18} /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">Case name *</span>
              <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Smith v. Morgan" autoFocus className={input} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">Case code (matter) — links the two reviewers</span>
              <MatterPicker matters={matters} value={f.matter} onChange={(v) => {
                // Known case? Pull its info from the central record so nothing
                // needs retyping — but never overwrite what's already typed.
                const known = hub[v.trim()];
                setF((prev) => ({
                  ...prev, matter: v,
                  name: prev.name || known?.name || prev.name,
                  causeNumber: prev.causeNumber || known?.causeNumber || prev.causeNumber,
                  court: prev.court || known?.court || prev.court,
                }));
              }} placeholder="Search by code, client, or description…" inputClass={input} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">Cause number</span>
              <input value={f.causeNumber} onChange={(e) => setF({ ...f, causeNumber: e.target.value })} placeholder="e.g. CV24-162" className={input} />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">Court (optional)</span>
              <input value={f.court} onChange={(e) => setF({ ...f, court: e.target.value })} placeholder="e.g. 220th District Court, Bosque County" className={input} />
            </label>
          </div>
          <div className="mt-3">
            {exhibitExists ? (
              <p className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                <Link2 size={13} /> An exhibit set for matter {f.matter.trim()} already exists — this case will link to it.
              </p>
            ) : (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={alsoExhibit} onChange={(e) => setAlsoExhibit(e.target.checked)} className="accent-[var(--c-accent)]" />
                Also set up the matching <strong>exhibit set</strong> for this case
              </label>
            )}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
            <button onClick={submit} disabled={pending || !f.name.trim()} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-50">
              {pending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Create case
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-[var(--c-border)] px-3 py-3 text-sm font-medium text-[var(--c-ink-muted)] transition-colors hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]">
          <Plus size={16} /> New discovery case
        </button>
      )}

      {active.length === 0 && !adding && (
        <p className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6 text-center text-sm text-[var(--c-ink-muted)]">
          No discovery cases yet. Create one, then drop the other side&apos;s productions in.
        </p>
      )}

      <div className="space-y-2">
        {active.map((s) => <SetCard key={s.id} s={s} onArchive={() => run(() => setDiscoverySetArchived(s.id, true))} onDelete={() => { if (confirm(`Delete "${s.name}" and all ${s.docs} document${s.docs === 1 ? "" : "s"}? Exhibits already filed in the Exhibit Reviewer are kept. This cannot be undone.`)) run(() => deleteDiscoverySet(s.id)); }} />)}
      </div>

      {archived.length > 0 && (
        <div className="pt-2">
          <button onClick={() => setShowArchived((v) => !v)} className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">
            <ChevronRight size={15} className={`transition-transform ${showArchived ? "rotate-90" : ""}`} /> {archived.length} archived
          </button>
          {showArchived && (
            <div className="mt-2 space-y-2">
              {archived.map((s) => <SetCard key={s.id} s={s} archived onRestore={() => run(() => setDiscoverySetArchived(s.id, false))} onDelete={() => { if (confirm(`Delete "${s.name}" and all its documents? This cannot be undone.`)) run(() => deleteDiscoverySet(s.id)); }} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SetCard({ s, archived, onArchive, onRestore, onDelete }: {
  s: DiscoverySetRow; archived?: boolean; onArchive?: () => void; onRestore?: () => void; onDelete: () => void;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4 ${archived ? "opacity-70" : ""}`}>
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--c-accent)]/10 text-[var(--c-accent)]"><FileStack size={18} /></span>
      <Link href={`/admin/discovery-reviewer/${s.id}`} className="min-w-0 flex-1 group">
        <div className="truncate font-semibold group-hover:text-[var(--c-accent)] transition-colors">{s.name}</div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-[var(--c-ink-muted)]">
          {s.causeNumber && <span>{s.causeNumber}</span>}
          {s.matter && (
            <span className={s.linked ? "text-emerald-600 dark:text-emerald-400" : ""}>
              Matter {s.matter}{s.linked ? " · linked to exhibit set" : ""}
            </span>
          )}
          <span>{s.docs} doc{s.docs === 1 ? "" : "s"}{s.pages > 0 ? ` · ${s.pages} pages` : ""}</span>
          {(s.plaintiff > 0 || s.defendant > 0) && <span>{s.plaintiff} P / {s.defendant} D exhibits</span>}
        </div>
      </Link>
      <div className="flex shrink-0 items-center gap-1">
        {onArchive && <button onClick={onArchive} title="Archive" className="rounded p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"><Archive size={15} /></button>}
        {onRestore && <button onClick={onRestore} title="Restore" className="rounded p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"><ArchiveRestore size={15} /></button>}
        <button onClick={onDelete} title="Delete" className="rounded p-1.5 text-[var(--c-ink-muted)] hover:text-red-600"><Trash2 size={15} /></button>
        <Link href={`/admin/discovery-reviewer/${s.id}`} className="rounded p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"><ChevronRight size={16} /></Link>
      </div>
    </div>
  );
}
