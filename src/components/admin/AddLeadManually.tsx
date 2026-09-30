"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Phone, X } from "lucide-react";
import { addManualLead } from "@/app/admin/(panel)/intake/actions";

type BranchOpt = { id: string; label: string };

/** Keep in sync with the referralSource options in src/lib/intake/config.ts —
 *  matching strings keep the lead-source analytics in one bucket per source.
 *  "Phone call" is the manual-entry default when the caller wasn't asked. */
const SOURCE_OPTIONS = [
  "Phone call",
  "Web search — Google",
  "Web search — Yahoo",
  "Web search — DuckDuckGo",
  "Web search — other",
  "AI — ChatGPT",
  "AI — Claude",
  "AI — other",
  "Facebook",
  "Instagram",
  "Referred by friend or family",
  "Referred by another attorney",
  "Referred by a past client",
  "Other",
];

const input = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";
const lbl = "mb-1 block text-xs font-medium text-[var(--c-ink-muted)]";

/** Header button + dialog: the receptionist types in a caller who never
 *  filled out the web form. Creates an ordinary lead — status flow,
 *  referrals, and engagement letters all work from there. */
export function AddLeadManually({ branches }: { branches: BranchOpt[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const blank = {
    name: "", phone: "", email: "", county: "", branch: "",
    isUrgent: false, deadline: "", referralSource: "Phone call", referrerName: "", notes: "",
  };
  const [f, setF] = useState(blank);

  const askReferrer =
    f.referralSource === "Referred by another attorney" ||
    f.referralSource === "Referred by friend or family" ||
    f.referralSource === "Referred by a past client";

  function submit() {
    setError(null);
    start(async () => {
      const r = await addManualLead(f);
      if (r.ok) {
        setOpen(false);
        setF(blank);
        router.refresh();
      } else setError(r.error ?? "Couldn't save the lead.");
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-outline inline-flex items-center gap-1.5 text-sm py-2 px-4">
        <Phone size={15} /> Add lead manually
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 bg-[var(--c-dark-bg)]/55 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border border-[var(--c-accent)] bg-[var(--c-surface)] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-[family-name:var(--font-ui)] font-semibold">Add a lead manually</h3>
                <p className="mt-0.5 text-xs text-[var(--c-ink-muted)]">For a caller who hasn&apos;t filled out the intake form. No notification emails are sent.</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-1 text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)]"><X size={17} /></button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={lbl}>Caller&apos;s name *</label>
                <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={input} autoFocus />
              </div>
              <div>
                <label className={lbl}>Phone</label>
                <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={input} />
              </div>
              <div>
                <label className={lbl}>Email</label>
                <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={input} />
              </div>
              <div>
                <label className={lbl}>County</label>
                <input value={f.county} onChange={(e) => setF({ ...f, county: e.target.value })} className={input} placeholder="e.g. Bosque" />
              </div>
              <div>
                <label className={lbl}>What are they calling about? *</label>
                <select value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })} className={input}>
                  <option value="">Pick one…</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>How did they hear about us?</label>
                <select value={f.referralSource} onChange={(e) => setF({ ...f, referralSource: e.target.value })} className={input}>
                  {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {askReferrer && (
                <div>
                  <label className={lbl}>Who referred them?</label>
                  <input value={f.referrerName} onChange={(e) => setF({ ...f, referrerName: e.target.value })} className={input} placeholder="Name to thank" />
                </div>
              )}
              <div className="col-span-2 flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={f.isUrgent} onChange={(e) => setF({ ...f, isUrgent: e.target.checked })} className="accent-[var(--c-accent)]" />
                  Urgent
                </label>
                <div className="flex-1">
                  <input value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} className={input} placeholder="Deadline, if any (e.g. answer due 10/14)" />
                </div>
              </div>
              <div className="col-span-2">
                <label className={lbl}>Call notes</label>
                <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={3} className={input} placeholder="What's going on, who's the other side, what do they want…" />
              </div>
            </div>

            {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-[var(--c-border)] px-4 py-2 text-sm hover:bg-[var(--c-surface2)]">Cancel</button>
              <button onClick={submit} disabled={pending || !f.name.trim() || !f.branch} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-50">
                {pending ? <Loader2 size={15} className="animate-spin" /> : null} Save lead
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
