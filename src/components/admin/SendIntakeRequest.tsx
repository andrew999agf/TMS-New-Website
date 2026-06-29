"use client";

import { useState, useTransition } from "react";
import { Send, X, Check, Loader2, Mail } from "lucide-react";
import { sendIntakeRequest } from "@/app/admin/(panel)/intake/send-actions";

type BranchOpt = { id: string; label: string };

export function SendIntakeRequest({ branches }: { branches: BranchOpt[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const input =
    "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm text-[var(--c-ink)] outline-none focus:border-[var(--c-accent)]";

  function reset() {
    setName("");
    setEmail("");
    setSelected([]);
    setNote("");
    setError(null);
    setSent(false);
  }

  function close() {
    setOpen(false);
    reset();
  }

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
      setError("Choose at least one intake to send.");
      return;
    }
    start(async () => {
      const res = await sendIntakeRequest({ name, email, branchIds: selected, note });
      if (res.ok) setSent(true);
      else setError(res.error ?? "Something went wrong.");
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-accent text-sm py-2 px-4">
        <Send size={15} /> Send intake request
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto px-3 py-[8vh]">
          <button aria-label="Close" onClick={close} className="absolute inset-0 bg-[var(--c-dark-bg)]/55 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--c-border)] px-5 py-4">
              <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--c-ink)]">Send an intake request</h2>
              <button onClick={close} aria-label="Close" className="rounded-md p-1 text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)]">
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
                <div className="mt-6 flex justify-center gap-2">
                  <button onClick={reset} className="rounded-lg border border-[var(--c-border)] px-4 py-2 text-sm hover:bg-[var(--c-surface2)]">Send another</button>
                  <button onClick={close} className="btn btn-accent text-sm py-2 px-4">Done</button>
                </div>
              </div>
            ) : (
              <div className="px-5 py-4 space-y-4">
                <p className="text-sm text-[var(--c-ink-muted)]">
                  Email someone a branded link to the right intake — for example, if they submitted the wrong one, send them the correct practice area to complete.
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

                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--c-ink-muted)]">Personal note (optional)</label>
                  <textarea className={input} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="A short message that appears above the button in the email." />
                </div>

                {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button onClick={close} className="rounded-lg border border-[var(--c-border)] px-4 py-2 text-sm hover:bg-[var(--c-surface2)]">Cancel</button>
                  <button onClick={submit} disabled={pending} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-50">
                    {pending ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} {pending ? "Sending…" : "Send request"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
