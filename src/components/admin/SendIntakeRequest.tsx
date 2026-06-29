"use client";

import { useState, useTransition } from "react";
import { Send, X, Check, Loader2, Mail } from "lucide-react";
import { sendIntakeRequest } from "@/app/admin/(panel)/intake/send-actions";
import { ESTATE_DOCS, ESTATE_DOC_GROUPS } from "@/lib/intake/config";

type BranchOpt = { id: string; label: string };

/**
 * Controlled dialog to email someone a branded link to the right intake.
 * Mount it (parent conditionally renders) to open; it initializes from the
 * optional preset name/email so a per-row send is one step.
 *  - kind "branch": pick a practice area (top-of-page button, e.g. phone call).
 *  - kind "estate": check the estate-planning documents to send; the link
 *    pre-checks them in the client's intake so they go straight to the details.
 */
export function SendIntakeDialog({
  onClose,
  kind = "branch",
  branches = [],
  presetName = "",
  presetEmail = "",
}: {
  onClose: () => void;
  kind?: "branch" | "estate";
  branches?: BranchOpt[];
  presetName?: string;
  presetEmail?: string;
}) {
  const [name, setName] = useState(presetName);
  const [email, setEmail] = useState(presetEmail);
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const isEstate = kind === "estate";
  const input =
    "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm text-[var(--c-ink)] outline-none focus:border-[var(--c-accent)]";

  function toggle(id: string, on: boolean) {
    setSelected((s) => (on ? [...new Set([...s, id])] : s.filter((x) => x !== id)));
  }

  function submit() {
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (selected.length === 0) {
      setError(isEstate ? "Check at least one document to send." : "Choose at least one intake to send.");
      return;
    }
    start(async () => {
      const res = await sendIntakeRequest(
        isEstate ? { name, email, estateDocs: selected, note } : { name, email, branchIds: selected, note },
      );
      if (res.ok) setSent(true);
      else setError(res.error ?? "Something went wrong.");
    });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto px-3 py-[8vh]">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[var(--c-dark-bg)]/55 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--c-border)] px-5 py-4">
          <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--c-ink)]">
            {isEstate ? "Send estate-planning intake" : "Send an intake request"}
          </h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)]">
            <X size={18} />
          </button>
        </div>

        {sent ? (
          <div className="px-5 py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--c-success)] text-white">
              <Check size={28} />
            </div>
            <p className="mt-4 font-medium text-[var(--c-ink)]">Intake request sent to {email}.</p>
            <p className="mt-1 text-sm text-[var(--c-ink-muted)]">They&apos;ll get a branded email with a button to fill out the form.</p>
            <div className="mt-6 flex justify-center">
              <button onClick={onClose} className="btn btn-accent text-sm py-2 px-4">Done</button>
            </div>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            <p className="text-sm text-[var(--c-ink-muted)]">
              {isEstate
                ? "Check the documents this client needs. They'll get a branded email with a button that opens their intake with these already selected — they just fill in the details."
                : "Email this person a branded link to the right intake — e.g. if they filled out the wrong one, send them the correct practice area to complete."}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--c-ink-muted)]">Recipient name (optional)</label>
                <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="First Last" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--c-ink-muted)]">Recipient email</label>
                <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@email.com" />
              </div>
            </div>

            {isEstate ? (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--c-ink-muted)]">Which documents do they need?</label>
                <div className="max-h-72 space-y-3 overflow-y-auto rounded-md border border-[var(--c-border)] p-3">
                  {ESTATE_DOC_GROUPS.map((group) => (
                    <div key={group}>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--c-accent)]">{group}</p>
                      <div className="space-y-0.5">
                        {ESTATE_DOCS.filter((d) => d.group === group).map((d) => {
                          const checked = selected.includes(d.id);
                          return (
                            <label key={d.id} className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 text-sm hover:bg-[var(--c-surface2)]">
                              <input type="checkbox" className="accent-[var(--c-accent)]" checked={checked} onChange={(e) => toggle(d.id, e.target.checked)} />
                              <span className="text-[var(--c-ink)]">{d.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--c-ink-muted)]">Which intake should they fill out?</label>
                <div className="max-h-52 overflow-y-auto rounded-md border border-[var(--c-border)] divide-y divide-[var(--c-border)]">
                  {branches.map((b) => {
                    const checked = selected.includes(b.id);
                    return (
                      <label key={b.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-[var(--c-surface2)]">
                        <input type="checkbox" className="accent-[var(--c-accent)]" checked={checked} onChange={(e) => toggle(b.id, e.target.checked)} />
                        <span className="text-[var(--c-ink)]">{b.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--c-ink-muted)]">Personal note (optional)</label>
              <textarea className={input} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="A short message that appears above the button in the email." />
            </div>

            {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={onClose} className="rounded-lg border border-[var(--c-border)] px-4 py-2 text-sm hover:bg-[var(--c-surface2)]">Cancel</button>
              <button onClick={submit} disabled={pending} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-50">
                {pending ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} {pending ? "Sending…" : "Send request"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Header button — opens the dialog with no preset recipient. */
export function SendIntakeRequest({ branches }: { branches: BranchOpt[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-accent text-sm py-2 px-4">
        <Send size={15} /> Send intake request
      </button>
      {open && <SendIntakeDialog onClose={() => setOpen(false)} branches={branches} />}
    </>
  );
}
