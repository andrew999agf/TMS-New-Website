"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Loader2, Scale, Trash2, X, ChevronRight, Search } from "lucide-react";
import { MatterPicker, type MatterOption } from "./MatterPicker";
import { createCase, deleteCase } from "@/app/admin/(panel)/cases/actions";
import type { CaseParty } from "@/db/schema";

export type CaseRow = {
  id: number; matter: string; name: string; causeNumber: string; court: string;
  parties: CaseParty[]; archived: boolean;
};

const input = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";

export function CasesManager({ cases, matters }: { cases: CaseRow[]; matters: MatterOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [f, setF] = useState({ matter: "", name: "", causeNumber: "", court: "" });

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return cases;
    return cases.filter((c) => {
      const hay = `${c.matter} ${c.name} ${c.causeNumber} ${c.court}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [cases, q]);

  function submit() {
    if (!f.matter.trim()) { setError("Pick the matter number — it's the case's ID across every tool."); return; }
    start(async () => {
      const r = await createCase(f);
      if (r.ok) { setF({ matter: "", name: "", causeNumber: "", court: "" }); setAdding(false); router.push(`/admin/cases/${r.id}`); }
      else setError(r.error ?? "Couldn't create the case.");
    });
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}

      {adding ? (
        <div className="rounded-lg border-2 border-dashed border-[var(--c-accent)]/40 bg-[var(--c-surface)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-[family-name:var(--font-display)] text-lg">New case record</h3>
            <button onClick={() => setAdding(false)} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={18} /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">Matter (case ID) *</span>
              <MatterPicker matters={matters} value={f.matter} onChange={(v) => setF({ ...f, matter: v })} placeholder="Search by code, client, or description…" inputClass={input} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">Cause number</span>
              <input value={f.causeNumber} onChange={(e) => setF({ ...f, causeNumber: e.target.value })} placeholder="e.g. CV26-182" className={input} />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">Case name / style</span>
              <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Dellert v. Pierce" className={input} />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">Court</span>
              <input value={f.court} onChange={(e) => setF({ ...f, court: e.target.value })} placeholder="e.g. 220th District Court, Bosque County" className={input} />
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
            <button onClick={submit} disabled={pending || !f.matter.trim()} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-50">
              {pending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Create case
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-ink-muted)]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a case by matter number, name, or cause number…" className={`${input} pl-9`} />
          </div>
          <button onClick={() => setAdding(true)} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4">
            <Plus size={15} /> New case
          </button>
        </div>
      )}

      {shown.length === 0 && !adding && (
        <p className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6 text-center text-sm text-[var(--c-ink-muted)]">
          {cases.length === 0
            ? "No case records yet. They're also created automatically when you set up a discovery case or exhibit set with a matter number."
            : "No case matches that search."}
        </p>
      )}

      <div className="space-y-2">
        {shown.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--c-accent)]/10 text-[var(--c-accent)]"><Scale size={18} /></span>
            <Link href={`/admin/cases/${c.id}`} className="min-w-0 flex-1 group">
              <div className="truncate font-semibold group-hover:text-[var(--c-accent)] transition-colors">{c.name || `Matter ${c.matter}`}</div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-[var(--c-ink-muted)]">
                <span>Matter {c.matter}</span>
                {c.causeNumber && <span>{c.causeNumber}</span>}
                {c.parties.length > 0 && <span>{c.parties.length} part{c.parties.length === 1 ? "y" : "ies"}</span>}
              </div>
            </Link>
            <button
              onClick={() => { if (confirm(`Delete the case record for matter ${c.matter}? The work in the other tools is not touched.`)) start(async () => { await deleteCase(c.id); router.refresh(); }); }}
              className="rounded p-1.5 text-[var(--c-ink-muted)] hover:text-red-600" title="Delete case record"><Trash2 size={15} /></button>
            <Link href={`/admin/cases/${c.id}`} className="rounded p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"><ChevronRight size={16} /></Link>
          </div>
        ))}
      </div>
    </div>
  );
}