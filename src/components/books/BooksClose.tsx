"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { setClosedThrough } from "@/app/books/(app)/settings/actions";

/** Close the books through a date: nothing on or before it can be added or voided until an owner moves the date. */
export function BooksClose({ closedThrough, owner }: { closedThrough: string; owner: boolean }) {
  const router = useRouter();
  const [date, setDate] = useState(closedThrough);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = (d: string) => { setMsg(null); start(async () => { const r = await setClosedThrough({ date: d }); if (r.ok) { setDate(d); setMsg({ ok: true, text: d ? `Closed through ${d}.` : "The books are open: no closing date." }); router.refresh(); } else setMsg({ ok: false, text: r.error }); }); };
  return (
    <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5" data-testid="books-close">
      <h2 className="inline-flex items-center gap-2 text-sm font-semibold"><Lock size={14} /> Close the books</h2>
      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--c-ink-muted)]">After a month or year has been reconciled and reviewed, close the books through its last day. Nothing dated on or before that day can then be added or voided, so reports for a finished period don&apos;t change. An owner can move or remove the date.</p>
      <p className="mt-3 text-sm" data-testid="close-current">{closedThrough ? <>Closed through <span className="font-mono font-semibold">{closedThrough}</span>.</> : "Not closed: any date can be posted to."}</p>
      {owner && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs">Close through<input type="date" className="mt-1 block rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-2.5 py-1.5 text-sm" value={date} onChange={(e) => setDate(e.target.value)} data-testid="close-date" /></label>
          <button type="button" disabled={pending || !date} onClick={() => save(date)} className="rounded-md bg-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-[var(--c-on-accent)] disabled:opacity-50" data-testid="close-save">Set closing date</button>
          {closedThrough && <button type="button" disabled={pending} onClick={() => { if (window.confirm("Remove the closing date? Earlier periods can then be changed again.")) save(""); }} className="rounded-md border border-[var(--c-border)] px-3 py-2 text-sm hover:border-[var(--c-accent)] disabled:opacity-50" data-testid="close-clear">Reopen</button>}
        </div>
      )}
      {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-emerald-700" : "text-red-700"}`} role="status" data-testid="close-msg">{msg.text}</p>}
    </section>
  );
}
