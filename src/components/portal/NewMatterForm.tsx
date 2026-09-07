"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, X } from "lucide-react";
import { clientCreateMatter } from "@/app/portal/[token]/actions";

/** Client-side "open a new matter" — only rendered when the firm has switched
 *  that on for the group. Creates the matter and takes the client straight in;
 *  the office is emailed for triage. */
export function NewMatterForm({ token }: { token: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function create() {
    setError(null);
    start(async () => {
      const r = await clientCreateMatter(token, { title, details });
      if (!r.ok || !r.id) { setError(r.error ?? "Couldn't open the matter — try again."); return; }
      setOpen(false); setTitle(""); setDetails("");
      router.push(`/portal/${token}/m/${r.id}`);
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-[var(--c-accent)] px-3 py-2 text-sm font-semibold text-[var(--c-accent)] hover:bg-[var(--c-accent)] hover:text-white">
        <Plus size={15} /> Open a new matter
      </button>
    );
  }
  return (
    <div className="mt-4 rounded-lg border border-[var(--c-accent)]/40 bg-[var(--c-surface)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">Open a new matter</p>
        <button onClick={() => setOpen(false)} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={16} /></button>
      </div>
      <label className="block text-xs">
        <span className="mb-1 block text-[var(--c-ink-muted)]">What is it? (a short name)</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., New supply agreement with Acme" className="w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]" />
      </label>
      <label className="mt-3 block text-xs">
        <span className="mb-1 block text-[var(--c-ink-muted)]">Tell us a little about it (optional)</span>
        <textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="A few sentences is plenty — the office will follow up." className="w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]" />
      </label>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button onClick={create} disabled={pending || !title.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-[var(--c-accent)] px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Open matter
        </button>
        <span className="text-[11px] text-[var(--c-ink-muted)]">The office is notified right away.</span>
      </div>
    </div>
  );
}
