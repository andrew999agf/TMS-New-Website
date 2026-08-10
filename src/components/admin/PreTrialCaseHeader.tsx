"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Trash2 } from "lucide-react";
import { MatterCombobox, type MatterOption } from "./MatterCombobox";
import { updateTrialCase, deleteTrialCase } from "@/app/admin/(panel)/pre-trial/actions";

type Form = { name: string; matter: string; causeNumber: string; court: string; trialDate: string; pretrialDate: string; notes: string };

const input = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";

/**
 * Collapsed case details with an inline editor. Note the trial date is edited in
 * the checklist below (via "reset date & slide schedule") so changing it always
 * moves the deadlines with it — this form leaves the date alone.
 */
export function PreTrialCaseHeader({ id, initial, matters }: { id: number; initial: Form; matters: MatterOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function save() {
    if (!form.name.trim()) { setError("Enter a case name."); return; }
    setError(null);
    start(async () => {
      // trialDate is intentionally passed through unchanged.
      const res = await updateTrialCase(id, form);
      if (!res.ok) { setError(res.error ?? "Couldn't save."); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setOpen(false);
      router.refresh();
    });
  }

  function remove() {
    if (!confirm(`Delete “${initial.name}” and its entire checklist? This can't be undone.`)) return;
    start(async () => {
      const res = await deleteTrialCase(id);
      if (!res.ok) { setError(res.error ?? "Couldn't delete."); return; }
      router.push("/admin/pre-trial");
    });
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-3 py-1.5 text-sm hover:bg-[var(--c-surface2)]">
          <Pencil size={14} /> Edit case details
        </button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
        {initial.notes && <p className="w-full text-sm text-[var(--c-ink-muted)]">{initial.notes}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">Case name *</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">Matter</label>
          <MatterCombobox value={form.matter} onChange={(v) => setForm({ ...form, matter: v })} matters={matters} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">Cause number</label>
          <input value={form.causeNumber} onChange={(e) => setForm({ ...form, causeNumber: e.target.value })} className={input} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">Court</label>
          <input value={form.court} onChange={(e) => setForm({ ...form, court: e.target.value })} className={input} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">Pretrial hearing date</label>
          <input type="date" value={form.pretrialDate} onChange={(e) => setForm({ ...form, pretrialDate: e.target.value })} className={input} />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">Notes</label>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={input} />
        </div>
      </div>
      <p className="text-[11px] text-[var(--c-ink-muted)]">The trial date is changed in the checklist below, so the deadlines move with it.</p>
      {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button onClick={save} disabled={pending} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-50">
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save
        </button>
        <button onClick={() => { setOpen(false); setForm(initial); setError(null); }} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
        <button onClick={remove} disabled={pending} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-red-500/40 px-3 py-2 text-sm text-red-600 hover:bg-red-500/10 disabled:opacity-50">
          <Trash2 size={15} /> Delete case
        </button>
      </div>
    </div>
  );
}
