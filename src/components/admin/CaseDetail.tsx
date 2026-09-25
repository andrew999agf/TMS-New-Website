"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { updateCaseInfo, addCaseParty, updateCaseParty, removeCaseParty } from "@/app/admin/(panel)/cases/actions";
import type { CaseParty } from "@/db/schema";

const input = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";
const roleSel = "rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-2 text-sm outline-none focus:border-[var(--c-accent)]";

export const PARTY_ROLES = [
  "Plaintiff", "Defendant", "Intervenor Plaintiff", "Intervenor Defendant", "Intervenor",
  "Third-Party Plaintiff", "Third-Party Defendant", "Counter-Plaintiff", "Counter-Defendant",
  "Cross-Claimant", "Garnishee", "Other",
];

type CaseRow = { id: number; matter: string; name: string; causeNumber: string; court: string; county: string; notes: string; parties: CaseParty[] };

export function CaseDetail({ caseRow }: { caseRow: CaseRow }) {
  return (
    <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-2">
      <CaseInfoCard caseRow={caseRow} />
      <PartiesCard caseRow={caseRow} />
    </div>
  );
}

/* ---------------------- case information (pencil-gated) ------------------ */

function CaseInfoCard({ caseRow }: { caseRow: CaseRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ name: caseRow.name, causeNumber: caseRow.causeNumber, court: caseRow.court, county: caseRow.county, notes: caseRow.notes });
  const [error, setError] = useState<string | null>(null);

  function beginEdit() {
    setF({ name: caseRow.name, causeNumber: caseRow.causeNumber, court: caseRow.court, county: caseRow.county, notes: caseRow.notes });
    setError(null);
    setEditing(true);
  }

  function save() {
    start(async () => {
      const r = await updateCaseInfo(caseRow.id, f);
      if (r.ok) { setEditing(false); router.refresh(); }
      else setError(r.error ?? "Couldn't save.");
    });
  }

  return (
    <section className="min-w-0 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--c-accent)]">Case information</h2>
        {!editing && (
          <button onClick={beginEdit} className="rounded p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Edit case information" aria-label="Edit case information">
            <Pencil size={15} />
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold">Case name / style</span>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={input} autoFocus />
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
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={save} disabled={pending} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-60">
              {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save case info
            </button>
            <button onClick={() => setEditing(false)} disabled={pending} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
          </div>
        </div>
      ) : (
        <dl className="space-y-3">
          <InfoRow label="Case name / style" value={caseRow.name} />
          <div className="grid grid-cols-2 gap-3">
            <InfoRow label="Cause number" value={caseRow.causeNumber} />
            <InfoRow label="County" value={caseRow.county} />
          </div>
          <InfoRow label="Court" value={caseRow.court} />
          {caseRow.notes && <InfoRow label="Notes" value={caseRow.notes} />}
        </dl>
      )}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-[var(--c-ink-muted)]">{label}</dt>
      <dd className={`mt-0.5 break-words text-sm ${value ? "" : "text-[var(--c-ink-muted)]"}`}>{value || "—"}</dd>
    </div>
  );
}

/* ------------------------------- parties --------------------------------- */

function PartiesCard({ caseRow }: { caseRow: CaseRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [eName, setEName] = useState("");
  const [eRole, setERole] = useState("Plaintiff");
  const [pName, setPName] = useState("");
  const [pRole, setPRole] = useState("Plaintiff");

  function beginEdit(i: number) {
    setEditIdx(i);
    setEName(caseRow.parties[i].name);
    setERole(caseRow.parties[i].role || "Other");
    setError(null);
  }

  function saveEdit() {
    if (editIdx == null || !eName.trim()) return;
    start(async () => {
      const r = await updateCaseParty(caseRow.id, editIdx, eName, eRole);
      if (r.ok) { setEditIdx(null); router.refresh(); }
      else setError(r.error ?? "Couldn't save the party.");
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
    <section className="min-w-0 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--c-accent)]">Parties</h2>
      {error && <p className="mb-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="divide-y divide-[var(--c-border)]">
        {caseRow.parties.length === 0 && <p className="py-2 text-sm text-[var(--c-ink-muted)]">No parties yet.</p>}
        {caseRow.parties.map((p, i) =>
          editIdx === i ? (
            <div key={`edit-${i}`} className="flex flex-wrap items-center gap-2 py-2">
              <input value={eName} onChange={(e) => setEName(e.target.value)} autoFocus
                className={`${input} min-w-[10rem] flex-1`} onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditIdx(null); }} />
              <select value={eRole} onChange={(e) => setERole(e.target.value)} className={`${roleSel} shrink-0`}>
                {PARTY_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                {!PARTY_ROLES.includes(eRole) && <option value={eRole}>{eRole}</option>}
              </select>
              <button onClick={saveEdit} disabled={pending || !eName.trim()} className="shrink-0 rounded p-1.5 text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-50" title="Save">
                {pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              </button>
              <button onClick={() => setEditIdx(null)} className="shrink-0 rounded p-1.5 text-[var(--c-ink-muted)]" title="Cancel"><X size={15} /></button>
            </div>
          ) : (
            <div key={`${p.name}-${i}`} className="flex items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1 break-words font-medium">{p.name}</span>
              <span className="shrink-0 rounded-full border border-[var(--c-border)] px-2 py-0.5 text-xs text-[var(--c-ink-muted)]">{p.role || "Party"}</span>
              <button onClick={() => beginEdit(i)} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Edit party" aria-label={`Edit ${p.name}`}><Pencil size={13} /></button>
              <button onClick={() => { if (confirm(`Remove ${p.name}?`)) start(async () => { await removeCaseParty(caseRow.id, i); router.refresh(); }); }}
                className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600" title="Remove party" aria-label={`Remove ${p.name}`}><Trash2 size={13} /></button>
            </div>
          ),
        )}
      </div>

      {/* add — wraps instead of spilling past the card on narrow screens */}
      <div className="mt-3 flex flex-wrap gap-2">
        <input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Party name" className={`${input} min-w-[10rem] flex-1`}
          onKeyDown={(e) => { if (e.key === "Enter") addParty(); }} />
        <select value={pRole} onChange={(e) => setPRole(e.target.value)} className={`${roleSel} shrink-0`}>
          {PARTY_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button onClick={addParty} disabled={pending || !pName.trim()} className="btn btn-outline inline-flex shrink-0 items-center gap-1 text-sm py-2 px-3 disabled:opacity-50">
          <Plus size={14} /> Add
        </button>
      </div>
      <p className="mt-2 text-xs text-[var(--c-ink-muted)]">Parties added here (or from the Discovery Reviewer&apos;s upload dialog) are available in every tool for this case.</p>
    </section>
  );
}