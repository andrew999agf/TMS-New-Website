"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { updateCaseInfo, addCaseParty, removeCaseParty } from "@/app/admin/(panel)/cases/actions";
import type { CaseParty } from "@/db/schema";

const input = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";

export const PARTY_ROLES = ["Plaintiff", "Defendant", "Intervenor", "Third-Party Plaintiff", "Third-Party Defendant", "Counter-Plaintiff", "Counter-Defendant", "Cross-Claimant", "Garnishee", "Other"];

export function CaseDetail({ caseRow }: {
  caseRow: { id: number; matter: string; name: string; causeNumber: string; court: string; county: string; notes: string; parties: CaseParty[] };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ name: caseRow.name, causeNumber: caseRow.causeNumber, court: caseRow.court, county: caseRow.county, notes: caseRow.notes });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pName, setPName] = useState("");
  const [pRole, setPRole] = useState("Plaintiff");

  function save() {
    start(async () => {
      const r = await updateCaseInfo(caseRow.id, f);
      if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); router.refresh(); }
      else setError(r.error ?? "Couldn't save.");
    });
  }

  function addParty() {
    if (!pName.trim()) return;
    start(async () => {
      const r = await addCaseParty(caseRow.matter, pName, pRole);
      if (r.ok) { setPName(""); router.refresh(); }
      else setError(r.error ?? "Couldn't add the party.");
    });
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      {error && <p className="lg:col-span-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}

      {/* case information */}
      <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--c-accent)]">Case information</h2>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold">Case name / style</span>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={input} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold">Cause number</span>
              <input value={f.causeNumber} onChange={(e) => setF({ ...f, causeNumber: e.target.value })} className={input} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold">County</span>
              <input value={f.county} onChange={(e) => setF({ ...f, county: e.target.value })} className={input} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold">Court</span>
            <input value={f.court} onChange={(e) => setF({ ...f, court: e.target.value })} className={input} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold">Notes</span>
            <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={3} className={input} />
          </label>
          <button onClick={save} disabled={pending} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-60">
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {saved ? "Saved" : "Save case info"}
          </button>
        </div>
      </section>

      {/* parties */}
      <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--c-accent)]">Parties</h2>
        <div className="divide-y divide-[var(--c-border)]">
          {caseRow.parties.length === 0 && <p className="py-2 text-sm text-[var(--c-ink-muted)]">No parties yet.</p>}
          {caseRow.parties.map((p, i) => (
            <div key={`${p.name}-${i}`} className="flex items-center gap-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
              <span className="rounded-full border border-[var(--c-border)] px-2 py-0.5 text-xs text-[var(--c-ink-muted)]">{p.role || "Party"}</span>
              <button onClick={() => start(async () => { await removeCaseParty(caseRow.id, i); router.refresh(); })}
                className="rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600" title="Remove party"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Party name" className={input}
            onKeyDown={(e) => { if (e.key === "Enter") addParty(); }} />
          <select value={pRole} onChange={(e) => setPRole(e.target.value)} className={`${input} w-44 shrink-0`}>
            {PARTY_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={addParty} disabled={pending || !pName.trim()} className="btn btn-outline shrink-0 inline-flex items-center gap-1 text-sm py-2 px-3 disabled:opacity-50">
            <Plus size={14} /> Add
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--c-ink-muted)]">Parties added here (or from the Discovery Reviewer&apos;s upload dialog) are available in every tool for this case.</p>
      </section>
    </div>
  );
}