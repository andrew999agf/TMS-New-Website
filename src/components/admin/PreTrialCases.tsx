"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Archive, ArchiveRestore, Gavel, ChevronRight, Search } from "lucide-react";
import { TEMPLATES, urgencyOf, duePhrase, fmtDate, URGENCY_CLASS, URGENCY_LABEL, URGENCY_RANK, type Urgency } from "@/lib/pretrial/template";
import { createTrialCase, setTrialCaseArchived } from "@/app/admin/(panel)/pre-trial/actions";
import { MatterCombobox, type MatterOption } from "./MatterCombobox";

export type CaseRow = {
  id: number;
  name: string;
  matter: string;
  causeNumber: string;
  court: string;
  trialDate: string | null;
  archived: boolean;
  openCount: number;
  overdueCount: number;
  /** Soonest open deadline, for the "next up" column. */
  nextTitle: string | null;
  nextDate: string | null;
};

const input = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";

export function PreTrialCases({ cases, matters }: { cases: CaseRow[]; matters: MatterOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showArchived, setShowArchived] = useState(false);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", matter: "", causeNumber: "", court: "", trialDate: "", templateId: TEMPLATES[0].id });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = cases
      .filter((c) => c.archived === showArchived)
      .filter((c) => !needle || `${c.name} ${c.matter} ${c.causeNumber} ${c.court}`.toLowerCase().includes(needle));
    // Most urgent case first: overdue work, then the nearest trial date.
    return out.sort((a, b) => {
      if (a.overdueCount !== b.overdueCount) return b.overdueCount - a.overdueCount;
      const ra = URGENCY_RANK[urgencyOf(a.trialDate)];
      const rb = URGENCY_RANK[urgencyOf(b.trialDate)];
      if (ra !== rb) return ra - rb;
      if (a.trialDate && b.trialDate && a.trialDate !== b.trialDate) return a.trialDate < b.trialDate ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [cases, showArchived, q]);

  const archivedCount = cases.filter((c) => c.archived).length;

  function submit() {
    if (!form.name.trim()) { setError("Enter a case name."); return; }
    setError(null);
    start(async () => {
      const res = await createTrialCase(form);
      if (!res.ok) { setError(res.error ?? "Couldn't create the case."); return; }
      setCreating(false);
      setForm({ name: "", matter: "", causeNumber: "", court: "", trialDate: "", templateId: TEMPLATES[0].id });
      router.refresh();
      if (res.id) router.push(`/admin/pre-trial/${res.id}`);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-ink-muted)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cases, matter, cause number…" className={`${input} pl-8`} />
        </div>
        <button onClick={() => setShowArchived((s) => !s)} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-3 py-2 text-sm hover:bg-[var(--c-surface2)]">
          <Archive size={15} /> Archived{archivedCount ? ` (${archivedCount})` : ""}
        </button>
        <button onClick={() => setCreating((c) => !c)} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4">
          <Plus size={15} /> New case
        </button>
      </div>

      {creating && (
        <div className="space-y-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">Case name *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Smith v. Acme Corp." className={input} autoFocus />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">Matter</label>
              <MatterCombobox value={form.matter} onChange={(v) => setForm({ ...form, matter: v })} matters={matters} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">Cause number</label>
              <input value={form.causeNumber} onChange={(e) => setForm({ ...form, causeNumber: e.target.value })} placeholder="DC-26-00123" className={input} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">Court</label>
              <input value={form.court} onChange={(e) => setForm({ ...form, court: e.target.value })} placeholder="134th District Court, Dallas County" className={input} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">Trial date</label>
              <input type="date" value={form.trialDate} onChange={(e) => setForm({ ...form, trialDate: e.target.value })} className={input} />
              <p className="mt-1 text-[11px] text-[var(--c-ink-muted)]">Every template deadline is calculated back from this date. You can add it later.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">Starting checklist</label>
              <select value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })} className={input}>
                {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-[var(--c-ink-muted)]">{TEMPLATES.find((t) => t.id === form.templateId)?.description}</p>
            </div>
          </div>
          {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}
          <div className="flex gap-2">
            <button onClick={submit} disabled={pending} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-50">
              {pending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Create case
            </button>
            <button onClick={() => { setCreating(false); setError(null); }} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6 text-center text-sm text-[var(--c-ink-muted)]">
          {showArchived ? "No archived cases." : "No cases yet. Click “New case” to set up your first pre-trial checklist."}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => {
            const u = urgencyOf(c.trialDate) as Urgency;
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
                <Gavel size={16} className="shrink-0 text-[var(--c-accent)]" />
                <Link href={`/admin/pre-trial/${c.id}`} className="min-w-0 flex-1 group">
                  <span className="block truncate font-medium text-[var(--c-ink)] group-hover:text-[var(--c-accent)]">{c.name}</span>
                  <span className="block truncate text-xs text-[var(--c-ink-muted)]">
                    {[c.causeNumber, c.court, c.matter].filter(Boolean).join("  ·  ") || "No case details yet"}
                  </span>
                  {c.nextTitle && (
                    <span className="mt-0.5 block truncate text-xs text-[var(--c-ink-muted)]">
                      Next: <span className="text-[var(--c-ink)]">{c.nextTitle}</span> — {fmtDate(c.nextDate)} ({duePhrase(c.nextDate)})
                    </span>
                  )}
                </Link>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {c.overdueCount > 0 && (
                    <span className="rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-600">{c.overdueCount} overdue</span>
                  )}
                  <span className="rounded-full border border-[var(--c-border)] bg-[var(--c-surface2)] px-2 py-0.5 text-[11px] text-[var(--c-ink-muted)]">{c.openCount} open</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${URGENCY_CLASS[u]}`}>
                    {c.trialDate ? `Trial ${fmtDate(c.trialDate)}` : URGENCY_LABEL.none}
                  </span>
                  <button
                    onClick={() => start(async () => { await setTrialCaseArchived(c.id, !c.archived); router.refresh(); })}
                    disabled={pending}
                    title={c.archived ? "Restore" : "Archive"}
                    className="rounded p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)] disabled:opacity-50"
                  >
                    {c.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                  </button>
                  <Link href={`/admin/pre-trial/${c.id}`} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"><ChevronRight size={16} /></Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
