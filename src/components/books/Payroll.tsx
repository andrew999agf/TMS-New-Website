"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { postPayrollAction } from "@/app/books/(app)/payroll/actions";
import { fmtCents } from "@/lib/books/money";

export type PayrollCard = {
  externalId: string; checkDate: string; periodStart: string; periodEnd: string; offCycle: boolean; entryId: number | null; postedBy: string | null;
  proposal: { ok: true; lines: { number: string; name: string; debit: number; credit: number; memo: string }[]; figures: { label: string; amount: number }[]; note: string } | { ok: false; error: string };
};

export function PayrollList({ rows, practice, canEdit }: { rows: PayrollCard[]; practice: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(rows.find((r) => !r.entryId)?.externalId ?? null);
  const [msg, setMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (rows.length === 0) return <p className="mt-4 rounded-lg border border-dashed border-[var(--c-border)] p-5 text-sm text-[var(--c-ink-muted)]" data-testid="payroll-empty">Gusto has no processed payrolls in the last year.</p>;
  return (
    <div className="mt-4 space-y-3" data-testid="payroll-list">
      {rows.map((r) => {
        const gross = r.proposal.ok ? r.proposal.figures.find((f) => f.label === "Gross pay")?.amount ?? 0 : 0;
        const isOpen = open === r.externalId;
        return (
          <div key={r.externalId} className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]" data-testid={`payroll-${r.checkDate}`}>
            <button type="button" onClick={() => setOpen(isOpen ? null : r.externalId)} className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={isOpen}>
              <span className="text-sm"><span className="font-semibold">Paid {r.checkDate}</span>{r.periodStart ? <span className="text-[var(--c-ink-muted)]"> · period {r.periodStart} to {r.periodEnd}</span> : null}{r.offCycle ? <span className="text-[var(--c-ink-muted)]"> · off-cycle</span> : null}</span>
              <span className="flex items-center gap-3 text-sm">
                <span className="font-mono">{fmtCents(gross, { dollar: true })} gross</span>
                {r.entryId ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900" data-testid={`payroll-posted-${r.checkDate}`}><CheckCircle2 size={12} /> In the books · entry #{r.entryId}</span>
                  : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">{practice ? "Preview only" : "Not posted"}</span>}
              </span>
            </button>
            {isOpen && (
              <div className="border-t border-[var(--c-border)] px-4 py-3">
                {r.proposal.ok ? (
                  <>
                    <p className="text-xs text-[var(--c-ink-muted)]">{r.proposal.figures.map((f) => `${f.label} ${fmtCents(f.amount, { dollar: true })}`).join(" · ")}</p>
                    <table className="mt-3 w-full text-sm" data-testid={`payroll-entry-${r.checkDate}`}>
                      <thead><tr className="text-left text-[11px] uppercase tracking-wide text-[var(--c-ink-muted)]"><th className="pb-1 font-medium">{r.entryId ? "Entry as posted from these figures" : "The entry this would post"}</th><th className="w-28 pb-1 text-right font-medium">Debit</th><th className="w-28 pb-1 text-right font-medium">Credit</th></tr></thead>
                      <tbody>
                        {r.proposal.lines.map((l, i) => (
                          <tr key={i} className="border-t border-[var(--c-border)]">
                            <td className={`py-1.5 ${l.credit ? "pl-6" : ""}`}><span className="font-mono text-xs text-[var(--c-ink-muted)]">{l.number}</span> {l.name} <span className="text-xs text-[var(--c-ink-muted)]">— {l.memo}</span></td>
                            <td className="py-1.5 text-right font-mono text-xs">{fmtCents(l.debit, { blankZero: true })}</td>
                            <td className="py-1.5 text-right font-mono text-xs">{fmtCents(l.credit, { blankZero: true })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {r.proposal.note && <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="payroll-note">{r.proposal.note}</p>}
                    {!r.entryId && canEdit && (
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <button type="button" disabled={pending || practice} onClick={() => { setMsg(null); start(async () => { const res = await postPayrollAction({ externalId: r.externalId }); if (res.ok) { setMsg({ id: r.externalId, ok: true, text: `Posted as entry #${res.entryId}.` }); router.refresh(); } else setMsg({ id: r.externalId, ok: false, text: res.error }); }); }} className="rounded-md bg-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-[var(--c-on-accent)] disabled:opacity-50" data-testid={`payroll-post-${r.checkDate}`}>Post to the books</button>
                        {practice && <span className="text-xs text-[var(--c-ink-muted)]" data-testid="payroll-practice-note">Practice data from Gusto&apos;s demo company can be previewed but not posted.</span>}
                      </div>
                    )}
                  </>
                ) : <p className="text-sm text-red-700">{r.proposal.error}</p>}
                {msg?.id === r.externalId && <p className={`mt-2 text-xs ${msg.ok ? "text-emerald-700" : "text-red-700"}`} role="status" data-testid="payroll-msg">{msg.text}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
