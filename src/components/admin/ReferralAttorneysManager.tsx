"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Plus, Pencil, Trash2, X, Check, Loader2, Scale } from "lucide-react";
import { saveReferralAttorney, deleteReferralAttorney } from "@/app/admin/(panel)/intake/referral-actions";

export type ReferralAttorneyRow = {
  id: number;
  name: string;
  firm: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  practiceArea: string;
};

const EMPTY: ReferralAttorneyRow = { id: 0, name: "", firm: "", address: "", phone: "", email: "", website: "", practiceArea: "" };

export function ReferralAttorneysManager({ initial }: { initial: ReferralAttorneyRow[] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ReferralAttorneyRow | null>(null);

  return (
    <section className="mb-6 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-5 py-3.5 text-left">
        <span className="inline-flex items-center gap-2 font-[family-name:var(--font-ui)] font-semibold">
          <Scale size={16} className="text-[var(--c-accent)]" /> Referral attorneys <span className="text-sm font-normal text-[var(--c-ink-muted)]">({initial.length})</span>
        </span>
        <ChevronDown size={18} className={`text-[var(--c-ink-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-[var(--c-border)] p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-[var(--c-ink-muted)]">The stable of attorneys you can include in a turn-back email. Add, edit, or remove them here.</p>
            <button onClick={() => setEditing(EMPTY)} className="btn btn-accent shrink-0 text-sm py-1.5 px-3"><Plus size={15} /> Add attorney</button>
          </div>

          {initial.length === 0 ? (
            <p className="rounded-md border border-dashed border-[var(--c-border)] px-4 py-6 text-center text-sm text-[var(--c-ink-muted)]">No referral attorneys yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--c-border)] rounded-lg border border-[var(--c-border)]">
              {initial.map((a) => (
                <li key={a.id} className="flex items-start gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[var(--c-ink)]">{a.name}{a.practiceArea && <span className="ml-2 text-xs font-normal text-[var(--c-ink-muted)]">· {a.practiceArea}</span>}</p>
                    {a.firm && <p className="text-xs text-[var(--c-ink-muted)]">{a.firm}</p>}
                    <p className="text-xs text-[var(--c-ink-muted)]">
                      {[a.address, a.phone, a.email, a.website].filter(Boolean).join("  ·  ") || <span className="italic">No contact details</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button onClick={() => setEditing(a)} title="Edit" className="rounded p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"><Pencil size={15} /></button>
                    <DeleteButton id={a.id} name={a.name} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {editing && <EditDialog row={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function DeleteButton({ id, name }: { id: number; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => { if (confirm(`Remove ${name} from the referral list?`)) start(async () => { await deleteReferralAttorney(id); }); }}
      disabled={pending}
      title="Delete"
      className="rounded p-1.5 text-[var(--c-ink-muted)] hover:text-red-600 disabled:opacity-50"
    >
      {pending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
    </button>
  );
}

function EditDialog({ row, onClose }: { row: ReferralAttorneyRow; onClose: () => void }) {
  const [f, setF] = useState(row);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ReferralAttorneyRow>) => setF((c) => ({ ...c, ...patch }));
  const field = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";

  function save() {
    if (!f.name.trim()) { setError("Enter the attorney or firm name."); return; }
    start(async () => {
      const res = await saveReferralAttorney(f);
      if (res.ok) onClose();
      else setError(res.error ?? "Save failed.");
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-[var(--c-surface)] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-[family-name:var(--font-display)] text-lg">{f.id ? "Edit referral attorney" : "Add referral attorney"}</h3>
          <button onClick={onClose} className="text-[var(--c-ink-muted)]"><X size={18} /></button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs sm:col-span-2"><span className="mb-1 block text-[var(--c-ink-muted)]">Name *</span><input value={f.name} onChange={(e) => set({ name: e.target.value })} className={field} autoFocus /></label>
          <label className="text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Firm</span><input value={f.firm} onChange={(e) => set({ firm: e.target.value })} className={field} /></label>
          <label className="text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Practice area</span><input value={f.practiceArea} onChange={(e) => set({ practiceArea: e.target.value })} className={field} /></label>
          <label className="text-xs sm:col-span-2"><span className="mb-1 block text-[var(--c-ink-muted)]">Address</span><input value={f.address} onChange={(e) => set({ address: e.target.value })} className={field} /></label>
          <label className="text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Telephone</span><input value={f.phone} onChange={(e) => set({ phone: e.target.value })} className={field} /></label>
          <label className="text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Email</span><input value={f.email} onChange={(e) => set({ email: e.target.value })} className={field} /></label>
          <label className="text-xs sm:col-span-2"><span className="mb-1 block text-[var(--c-ink-muted)]">Website</span><input value={f.website} onChange={(e) => set({ website: e.target.value })} placeholder="example.com" className={field} /></label>
        </div>
        {error && <p className="mt-3 text-sm text-[var(--c-error)]">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
          <button onClick={save} disabled={pending} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-50">{pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save</button>
        </div>
      </div>
    </div>
  );
}
