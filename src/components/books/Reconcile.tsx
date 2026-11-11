"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { discardRec, reopenRec, saveRec, startRec } from "@/app/books/(app)/reconcile-actions";
import { fmtCents } from "@/lib/books/money";

export type RecLineRow = { lineId: number; entryId: number; date: string; description: string; amount: number; cleared: boolean; fromBank: boolean };
export type RecOpen = { id: number; statementDate: string; statementBalance: number; beginning: number; lines: RecLineRow[]; bookBalance: number; trust: null | { clientTotal: number; negatives: { name: string; balance: number }[] } };
export type RecPast = { id: number; statementDate: string; statementBalance: number; finalizedBy: string | null; finalizedAt: string | null; outstandingTotal: number | null; clientTotal: number | null };

const $ = (n: number) => fmtCents(n, { paren: true, dollar: true });

/**
 * Reconcile an account to its statement. Used for the operating account and
 * cards (Banking) and, with the three-way check, for the IOLTA account (Trust).
 */
export function Reconcile({ accountId, accountLabel, open, past, canEdit, isOwner, isCard, today }: { accountId: number; accountLabel: string; open: RecOpen | null; past: RecPast[]; canEdit: boolean; isOwner: boolean; isCard?: boolean; today: string }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [bal, setBal] = useState("");
  const [cleared, setCleared] = useState<Set<number>>(() => new Set(open?.lines.filter((l) => l.cleared).map((l) => l.lineId)));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText?: string) => { setMsg(null); start(async () => { const r = await fn(); if (r.ok) { if (okText) setMsg({ ok: true, text: okText }); router.refresh(); } else setMsg({ ok: false, text: r.error }); }); };
  const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]";

  const math = useMemo(() => {
    if (!open) return null;
    const c = open.lines.filter((l) => cleared.has(l.lineId)), o = open.lines.filter((l) => !cleared.has(l.lineId));
    const clearedBalance = open.beginning + c.reduce((s, l) => s + l.amount, 0), outstanding = o.reduce((s, l) => s + l.amount, 0);
    return { clearedBalance, difference: open.statementBalance - clearedBalance, outstanding, adjustedBank: open.statementBalance + outstanding, openCount: o.length };
  }, [open, cleared]);
  const threeWayOk = !open?.trust || (math !== null && math.adjustedBank === open.bookBalance && open.bookBalance === open.trust.clientTotal && open.trust.negatives.length === 0);
  const canFinish = math !== null && math.difference === 0 && threeWayOk;

  return (
    <div data-testid="reconcile">
      {!open && canEdit && (
        <form className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4" onSubmit={(e) => { e.preventDefault(); run(() => startRec({ accountId, statementDate: date, statementBalance: bal })); }} data-testid="rec-start-form">
          <p className="text-sm font-semibold">Reconcile {accountLabel} to a statement</p>
          <p className="mt-0.5 text-xs text-[var(--c-ink-muted)]">Enter the ending date and ending balance printed on the statement{isCard ? " (the amount owed)" : ""}. You then check off what appears on it; it is finished only when the difference is zero.</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-xs">Statement ending date<input type="date" className={`${input} mt-1 block`} value={date} onChange={(e) => setDate(e.target.value)} data-testid="rec-date" /></label>
            <label className="text-xs">Statement ending balance<input className={`${input} mt-1 block w-40 text-right font-mono`} value={bal} onChange={(e) => setBal(e.target.value)} placeholder="0.00" inputMode="decimal" data-testid="rec-balance" /></label>
            <button type="submit" disabled={pending} className="rounded-md bg-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-[var(--c-on-accent)] disabled:opacity-50" data-testid="rec-start">Start</button>
          </div>
        </form>
      )}

      {open && math && (
        <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4" data-testid="rec-open">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Statement ending {open.statementDate}</p>
              <p className="text-xs text-[var(--c-ink-muted)]">Check off each line that appears on the statement. Lines that came from the bank&apos;s own file are already checked.</p>
            </div>
            {canEdit && <button type="button" disabled={pending} onClick={() => { if (window.confirm("Discard this unfinished reconciliation? Nothing in the ledger changes.")) run(() => discardRec({ accountId, recId: open.id })); }} className="text-xs text-[var(--c-ink-muted)] hover:text-red-700" data-testid="rec-discard">Discard</button>}
          </div>
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div className="flex justify-between"><dt className="text-[var(--c-ink-muted)]">Beginning balance (last statement)</dt><dd className="font-mono" data-testid="rec-beginning">{$(open.beginning)}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--c-ink-muted)]">Statement ending balance</dt><dd className="font-mono" data-testid="rec-statement">{$(open.statementBalance)}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--c-ink-muted)]">Cleared balance (beginning + checked)</dt><dd className="font-mono" data-testid="rec-cleared">{$(math.clearedBalance)}</dd></div>
            <div className={`flex justify-between font-semibold ${math.difference === 0 ? "text-emerald-700" : "text-red-700"}`}><dt>Difference</dt><dd className="font-mono" data-testid="rec-difference">{$(math.difference)}</dd></div>
          </dl>

          {open.trust && (
            <div className={`mt-4 rounded-md border p-3 ${threeWayOk && math.difference === 0 ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`} data-testid="three-way">
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1c1917]">{threeWayOk && math.difference === 0 ? <CheckCircle2 size={15} className="text-emerald-700" /> : <CircleAlert size={15} className="text-amber-700" />} Three-way reconciliation</p>
              <dl className="mt-2 space-y-1 text-sm text-[#1c1917]">
                <div className="flex justify-between"><dt>1. Statement balance, adjusted for {math.openCount} outstanding item{math.openCount === 1 ? "" : "s"}</dt><dd className="font-mono" data-testid="tw-bank">{$(math.adjustedBank)}</dd></div>
                <div className="flex justify-between"><dt>2. Trust bank account in the ledger</dt><dd className="font-mono" data-testid="tw-book">{$(open.bookBalance)}</dd></div>
                <div className="flex justify-between"><dt>3. Total of all client ledgers</dt><dd className="font-mono" data-testid="tw-clients">{$(open.trust.clientTotal)}</dd></div>
              </dl>
              {open.trust.negatives.map((n) => <p key={n.name} className="mt-1 text-xs font-semibold text-red-800">{n.name}&apos;s ledger is below zero ({$(n.balance)}).</p>)}
              <p className="mt-2 text-xs text-[#44403c]">All three must be the same number before this can be finished.</p>
            </div>
          )}

          <table className="mt-4 w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-[var(--c-ink-muted)]"><th className="w-8 pb-1" /><th className="w-24 pb-1 font-medium">Date</th><th className="pb-1 font-medium">Description</th><th className="w-32 pb-1 text-right font-medium">Amount</th></tr></thead>
            <tbody>
              {open.lines.length === 0 && <tr><td colSpan={4} className="py-3 text-sm text-[var(--c-ink-muted)]">Nothing in the ledger for this account through {open.statementDate}.</td></tr>}
              {open.lines.map((l) => (
                <tr key={l.lineId} className="border-t border-[var(--c-border)]" data-testid={`rec-line-${l.lineId}`}>
                  <td className="py-1.5"><input type="checkbox" disabled={!canEdit} checked={cleared.has(l.lineId)} onChange={(e) => setCleared((s) => { const n = new Set(s); if (e.target.checked) n.add(l.lineId); else n.delete(l.lineId); return n; })} aria-label={`Cleared: ${l.description}`} data-testid={`rec-check-${l.lineId}`} /></td>
                  <td className="py-1.5 font-mono text-xs">{l.date}</td>
                  <td className="py-1.5">{l.description || `Entry #${l.entryId}`}{l.fromBank && <span className="ml-2 rounded bg-[var(--c-bg)] px-1.5 py-0.5 text-[10px] uppercase text-[var(--c-ink-muted)]">from statement file</span>}</td>
                  <td className="py-1.5 text-right font-mono text-xs">{fmtCents(l.amount, { paren: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {canEdit && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" disabled={pending} onClick={() => run(() => saveRec({ accountId, recId: open.id, lineIds: [...cleared] }), "Progress saved.")} className="rounded-md border border-[var(--c-border)] px-3 py-2 text-sm hover:border-[var(--c-accent)] disabled:opacity-50" data-testid="rec-save">Save progress</button>
              <button type="button" disabled={pending || !canFinish} onClick={() => run(() => saveRec({ accountId, recId: open.id, lineIds: [...cleared], finish: true }))} className="rounded-md bg-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-[var(--c-on-accent)] disabled:opacity-50" data-testid="rec-finish">Finish reconciliation</button>
              {!canFinish && <span className="text-xs text-[var(--c-ink-muted)]">{math.difference !== 0 ? `Off by ${$(Math.abs(math.difference))}.` : "The three numbers must agree."}</span>}
            </div>
          )}
        </div>
      )}
      {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-emerald-700" : "text-red-700"}`} role="status" data-testid="rec-msg">{msg.text}</p>}

      <h3 className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--c-ink-muted)]">Finished reconciliations</h3>
      {past.length === 0 ? <p className="mt-2 text-sm text-[var(--c-ink-muted)]" data-testid="rec-none">None yet.</p> : (
        <table className="mt-2 w-full text-sm" data-testid="rec-history">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-[var(--c-ink-muted)]"><th className="pb-1 font-medium">Statement ending</th><th className="pb-1 text-right font-medium">Statement balance</th><th className="pb-1 text-right font-medium">Outstanding</th>{past.some((p) => p.clientTotal !== null) && <th className="pb-1 text-right font-medium">Client ledgers</th>}<th className="pb-1 pl-4 font-medium">Finished</th><th /></tr></thead>
          <tbody>
            {past.map((p, i) => (
              <tr key={p.id} className="border-t border-[var(--c-border)]" data-testid={`rec-past-${p.id}`}>
                <td className="py-1.5 font-mono text-xs">{p.statementDate}</td>
                <td className="py-1.5 text-right font-mono text-xs">{$(p.statementBalance)}</td>
                <td className="py-1.5 text-right font-mono text-xs">{p.outstandingTotal === null ? "" : $(p.outstandingTotal)}</td>
                {past.some((x) => x.clientTotal !== null) && <td className="py-1.5 text-right font-mono text-xs">{p.clientTotal === null ? "" : $(p.clientTotal)}</td>}
                <td className="py-1.5 pl-4 text-xs text-[var(--c-ink-muted)]">{p.finalizedAt?.slice(0, 10)} · {p.finalizedBy}</td>
                <td className="py-1.5 text-right text-xs">{i === 0 && isOwner && !open && <button type="button" disabled={pending} onClick={() => { if (window.confirm("Reopen this finished reconciliation?")) run(() => reopenRec({ accountId, recId: p.id })); }} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]" data-testid={`rec-reopen-${p.id}`}>Reopen</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
