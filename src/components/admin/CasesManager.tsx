"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Loader2, Scale, X, ChevronRight, Search, Archive, CircleDollarSign } from "lucide-react";
import { MatterPicker, type MatterOption } from "./MatterPicker";
import { useCaseLookup, lookupNote } from "./useCaseLookup";
import { createCase, setCaseRetainer } from "@/app/admin/(panel)/cases/actions";
import type { CaseParty } from "@/db/schema";

export type CaseRow = {
  id: number; matter: string; name: string; causeNumber: string; court: string;
  parties: CaseParty[]; archived: boolean;
  /** Has the retainer been paid? null = nobody has answered yet. */
  retainerPaid: boolean | null;
};

const input = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";

export function CasesManager({ cases, matters }: { cases: CaseRow[]; matters: MatterOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [f, setF] = useState({ matter: "", name: "", causeNumber: "", court: "" });

  const [showClosed, setShowClosed] = useState(false);
  // Already on file? Snap to its key and show what we have, so "creating" it
  // just opens the existing record instead of retyping it.
  const lookup = useCaseLookup(f.matter, (c) => {
    setF((prev) => ({ ...prev, matter: c.matter || prev.matter, name: prev.name || c.name, causeNumber: prev.causeNumber || c.causeNumber, court: prev.court || c.court }));
  });
  const note = lookupNote(lookup);

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return cases;
    return cases.filter((c) => {
      const hay = `${c.matter} ${c.name} ${c.causeNumber} ${c.court}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [cases, q]);
  const open = shown.filter((c) => !c.archived);
  const closed = shown.filter((c) => c.archived);
  const closedTotal = cases.filter((c) => c.archived).length;

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
              {note && <span className={`mt-1 block text-[11px] ${note.tone === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--c-ink-muted)]"}`}>{lookup.status === "found" ? "This case is already on file — saving opens it." : note.text}</span>}
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

      {open.length === 0 && !adding && (
        <p className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6 text-center text-sm text-[var(--c-ink-muted)]">
          {cases.length === 0
            ? "No case records yet. They're also created automatically when you set up a discovery case or exhibit set with a matter number."
            : "No open case matches that search."}
        </p>
      )}

      <div className="space-y-2">
        {open.map((c) => (
          <CaseListRow key={c.id} c={c} />
        ))}
      </div>

      {/* Closed cases stay reachable, but out of the way. Closing/reopening
          happens inside the case itself — no destructive buttons out here. */}
      {closedTotal > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowClosed((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"
          >
            <Archive size={13} />
            {showClosed ? "Hide closed cases" : `Closed cases (${closedTotal})`}
          </button>
          {showClosed && (
            <div className="mt-2 space-y-2 opacity-75">
              {closed.length === 0 ? (
                <p className="text-xs text-[var(--c-ink-muted)]">No closed case matches that search.</p>
              ) : (
                closed.map((c) => <CaseListRow key={c.id} c={c} closed />)
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CaseListRow({ c, closed = false }: { c: CaseRow; closed?: boolean }) {
  return (
    <div className="relative flex items-center gap-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4 pt-5">
      {!closed && <RetainerBubble c={c} />}
      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${closed ? "bg-[var(--c-bg)] text-[var(--c-ink-muted)]" : "bg-[var(--c-accent)]/10 text-[var(--c-accent)]"}`}>
        <Scale size={18} />
      </span>
      <Link href={`/admin/cases/${c.id}`} className="min-w-0 flex-1 group">
        <div className="truncate font-semibold group-hover:text-[var(--c-accent)] transition-colors">{c.name || `Matter ${c.matter}`}</div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-[var(--c-ink-muted)]">
          <span>Matter {c.matter}</span>
          {c.causeNumber && <span>{c.causeNumber}</span>}
          {c.parties.length > 0 && <span>{c.parties.length} part{c.parties.length === 1 ? "y" : "ies"}</span>}
        </div>
      </Link>
      {closed && <span className="rounded bg-[var(--c-bg)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--c-ink-muted)]">Closed</span>}
      <Link href={`/admin/cases/${c.id}`} className="rounded p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"><ChevronRight size={16} /></Link>
    </div>
  );
}

/** The half-bubble riding the top edge of a case card: has the retainer been
 *  paid? Click it and answer yes or no — a standing reminder until payment
 *  tracking is fully coordinated. */
function RetainerBubble({ c }: { c: CaseRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const look =
    c.retainerPaid === true
      ? { label: "Retainer paid", cls: "border-emerald-600/50 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300" }
      : c.retainerPaid === false
        ? { label: "Retainer NOT paid", cls: "border-red-600/50 bg-red-600/10 text-red-600" }
        : { label: "Retainer paid?", cls: "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300" };

  function answer(paid: boolean) {
    start(async () => {
      await setCaseRetainer(c.id, paid);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="absolute -top-2.5 right-4 z-10">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Has the retainer been paid? Click to answer."
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium shadow-sm ${look.cls}`}
      >
        <CircleDollarSign size={11} /> {look.label}
      </button>
      {open && (
        <>
          <button aria-label="Close" onClick={() => setOpen(false)} className="fixed inset-0 z-10 cursor-default" />
          <div className="absolute right-0 z-20 mt-1.5 w-56 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-3 shadow-xl">
            <p className="mb-2 text-sm font-medium">Has the retainer been paid?</p>
            <div className="flex gap-2">
              <button onClick={() => answer(true)} disabled={pending}
                className="flex-1 rounded-md border border-emerald-600/50 bg-emerald-600/10 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-600/20 disabled:opacity-50 dark:text-emerald-300">
                Yes
              </button>
              <button onClick={() => answer(false)} disabled={pending}
                className="flex-1 rounded-md border border-red-600/50 bg-red-600/10 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-600/20 disabled:opacity-50">
                No
              </button>
            </div>
            <p className="mt-2 text-[11px] text-[var(--c-ink-muted)]">Just a team reminder for now — it doesn&apos;t touch billing.</p>
          </div>
        </>
      )}
    </div>
  );
}