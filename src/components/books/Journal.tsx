"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Plus, Trash2 } from "lucide-react";
import { createManualEntry, voidEntryAction } from "@/app/books/(app)/journal/actions";
import { fmtCents, toCents } from "@/lib/books/money";

export type AccountOption = { id: number; number: string; name: string; type: string; isTrust: boolean; active: boolean };
export type EntryRow = { id: number; date: string; memo: string; source: string; kind: string; status: string; createdBy: string; voidReason: string; lines: { number: string; name: string; debit: number; credit: number; memo: string; clientName: string; payee: string; ref: string }[] };

const SOURCE_LABEL: Record<string, string> = { manual: "Journal", bank: "Banking", trust: "Trust", payroll: "Payroll" };
const blank = () => ({ accountId: 0, debit: "", credit: "", memo: "" });

/** Hand-written entries. Trust accounts are left out on purpose: they are only changed from the Trust screen. */
export function JournalForm({ accounts, today }: { accounts: AccountOption[]; today: string }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState([blank(), blank()]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (i: number, patch: Partial<ReturnType<typeof blank>>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const dr = lines.reduce((s, l) => s + (toCents(l.debit) ?? 0), 0), cr = lines.reduce((s, l) => s + (toCents(l.credit) ?? 0), 0);
  const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]";
  const usable = accounts.filter((a) => a.active && !a.isTrust);

  return (
    <form className="mt-5 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4" data-testid="je-form"
      onSubmit={(e) => { e.preventDefault(); setMsg(null); start(async () => { const r = await createManualEntry({ date, memo, lines }); if (r.ok) { setMemo(""); setLines([blank(), blank()]); setMsg({ ok: true, text: `Entry #${r.id} posted.` }); router.refresh(); } else setMsg({ ok: false, text: r.error }); }); }}>
      <p className="text-sm font-semibold">New journal entry</p>
      <p className="mt-0.5 text-xs text-[var(--c-ink-muted)]">For opening balances, adjustments, depreciation and owner draws. Bank activity is entered under Banking; client money under Trust.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="text-xs">Date<input type="date" className={`${input} mt-1 block`} value={date} onChange={(e) => setDate(e.target.value)} data-testid="je-date" /></label>
        <label className="min-w-[16rem] flex-1 text-xs">What it is for<input className={`${input} mt-1 block w-full`} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Opening balances as of January 1" data-testid="je-memo" /></label>
      </div>
      <table className="mt-3 w-full text-sm">
        <thead><tr className="text-left text-[11px] uppercase tracking-wide text-[var(--c-ink-muted)]"><th className="pb-1 font-medium">Account</th><th className="w-32 pb-1 text-right font-medium">Debit</th><th className="w-32 pb-1 text-right font-medium">Credit</th><th className="pb-1 pl-2 font-medium">Note</th><th className="w-8" /></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="py-1 pr-2"><select className={`${input} w-full`} value={l.accountId} onChange={(e) => set(i, { accountId: Number(e.target.value) })} data-testid={`je-account-${i}`}><option value={0}>Choose an account…</option>{usable.map((a) => <option key={a.id} value={a.id}>{a.number} · {a.name}</option>)}</select></td>
              <td className="py-1"><input className={`${input} w-full text-right font-mono`} value={l.debit} onChange={(e) => set(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} inputMode="decimal" data-testid={`je-debit-${i}`} /></td>
              <td className="py-1 pl-1"><input className={`${input} w-full text-right font-mono`} value={l.credit} onChange={(e) => set(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} inputMode="decimal" data-testid={`je-credit-${i}`} /></td>
              <td className="py-1 pl-2"><input className={`${input} w-full`} value={l.memo} onChange={(e) => set(i, { memo: e.target.value })} /></td>
              <td className="py-1 text-right">{lines.length > 2 && <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="rounded p-1 text-[var(--c-ink-muted)] hover:bg-[var(--c-bg)]" aria-label="Remove line"><Trash2 size={13} /></button>}</td>
            </tr>
          ))}
          <tr className="border-t border-[var(--c-border)] text-xs">
            <td className="py-2"><button type="button" onClick={() => setLines((ls) => [...ls, blank()])} className="inline-flex items-center gap-1 text-[var(--c-accent)] hover:underline" data-testid="je-add-line"><Plus size={12} /> Add a line</button></td>
            <td className="py-2 text-right font-mono" data-testid="je-total-debit">{fmtCents(dr)}</td>
            <td className="py-2 text-right font-mono" data-testid="je-total-credit">{fmtCents(cr)}</td>
            <td className="py-2 pl-2" colSpan={2}>{dr === cr ? (dr > 0 ? <span className="text-emerald-700">Balanced</span> : null) : <span className="text-red-700" data-testid="je-diff">Out of balance by {fmtCents(Math.abs(dr - cr))}</span>}</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-3">
        <button type="submit" disabled={pending || dr !== cr || dr === 0} className="rounded-md bg-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-[var(--c-on-accent)] disabled:opacity-50" data-testid="je-post">{pending ? "Posting…" : "Post entry"}</button>
        {msg && <span className={`text-xs ${msg.ok ? "text-emerald-700" : "text-red-700"}`} role="status" data-testid="je-msg">{msg.text}</span>}
      </div>
    </form>
  );
}

export function EntryList({ entries, canEdit }: { entries: EntryRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const doVoid = (id: number) => {
    const reason = window.prompt(`Void entry #${id}? It stays on the record, marked void. Why is it being voided?`);
    if (reason === null) return;
    setErr(null);
    start(async () => { const r = await voidEntryAction({ id, reason }); if (r.ok) router.refresh(); else setErr(r.error); });
  };
  if (entries.length === 0) return <p className="mt-6 rounded-lg border border-dashed border-[var(--c-border)] p-5 text-sm text-[var(--c-ink-muted)]" data-testid="entries-empty">No entries in this period.</p>;
  return (
    <div className="mt-6 space-y-3" data-testid="entries">
      {err && <p className="text-xs text-red-700" role="alert" data-testid="entry-error">{err}</p>}
      {entries.map((e) => (
        <div key={e.id} className={`rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-3 ${e.status === "void" ? "opacity-60" : ""}`} data-testid={`entry-${e.id}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <p><span className="font-mono">{e.date}</span> · <span className="font-semibold">#{e.id}</span> · {SOURCE_LABEL[e.source] ?? e.source}{e.kind ? ` (${e.kind.replace(/_/g, " ")})` : ""} · <span className="text-[var(--c-ink-muted)]">{e.createdBy}</span>{e.status === "void" && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-800">VOID</span>}</p>
            {canEdit && e.status !== "void" && <button type="button" disabled={pending} onClick={() => doVoid(e.id)} className="inline-flex items-center gap-1 text-[var(--c-ink-muted)] hover:text-red-700" data-testid={`entry-void-${e.id}`}><Ban size={11} /> Void</button>}
          </div>
          <p className={`mt-1 text-sm ${e.status === "void" ? "line-through" : ""}`}>{e.memo || "(no description)"}</p>
          {e.status === "void" && e.voidReason && <p className="text-xs text-red-800">Voided: {e.voidReason}</p>}
          <table className="mt-2 w-full text-xs">
            <tbody>
              {e.lines.map((l, i) => (
                <tr key={i} className="border-t border-[var(--c-border)]">
                  <td className={`py-1 ${l.credit ? "pl-6" : ""}`}><span className="font-mono text-[var(--c-ink-muted)]">{l.number}</span> {l.name}{l.clientName ? <span className="text-[var(--c-ink-muted)]"> · {l.clientName}</span> : null}{l.payee ? <span className="text-[var(--c-ink-muted)]"> · {l.payee}</span> : null}{l.ref ? <span className="text-[var(--c-ink-muted)]"> · #{l.ref}</span> : null}{l.memo ? <span className="text-[var(--c-ink-muted)]"> — {l.memo}</span> : null}</td>
                  <td className="w-28 py-1 text-right font-mono">{fmtCents(l.debit, { blankZero: true })}</td>
                  <td className="w-28 py-1 text-right font-mono">{fmtCents(l.credit, { blankZero: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
