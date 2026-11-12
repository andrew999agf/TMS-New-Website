import Link from "next/link";
import { FileSignature } from "lucide-react";

export type LetterRow = { leadId: number; name: string; matter: string; received: string; blanks: number | null };

/** On the partner's tab: each lead's engagement letter and how far along it is. */
export function PartnerLetters({ rows, partnerName }: { rows: LetterRow[]; partnerName: string }) {
  return (
    <div id="letters" className="mb-6 scroll-mt-6 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]" data-testid="partner-letters">
      <div className="p-5 pb-3">
        <p className="inline-flex items-center gap-2 text-sm font-semibold"><FileSignature size={15} /> Engagement letters</p>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--c-ink-muted)]">Your Word letter for {partnerName} cases (English and Spanish). Each one opens already filled in with what the person entered on the intake form; finish the remaining blanks and download it as Word or PDF.</p>
      </div>
      {rows.length === 0 ? <p className="mx-5 mb-5 rounded-md border border-dashed border-[var(--c-border)] px-4 py-3 text-xs text-[var(--c-ink-muted)]">No leads yet.</p> : (
        <ul className="divide-y divide-[var(--c-border)] border-t border-[var(--c-border)]">
          {rows.map((r) => (
            <li key={r.leadId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5" data-testid={`letter-${r.leadId}`}>
              <p className="text-sm"><span className="font-medium">{r.name || "(no name)"}</span>{r.matter ? <span className="text-[var(--c-ink-muted)]"> · {r.matter}</span> : null}<span className="text-[var(--c-ink-muted)]"> · {r.received}</span></p>
              <span className="flex items-center gap-3">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.blanks === null ? "bg-[var(--c-bg)] text-[var(--c-ink-muted)]" : r.blanks === 0 ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`} data-testid={`letter-status-${r.leadId}`}>{r.blanks === null ? "Not started" : r.blanks === 0 ? "Every blank filled" : `${r.blanks} blank${r.blanks === 1 ? "" : "s"} left`}</span>
                <Link href={`/admin/intake/contract/${r.leadId}`} className="rounded-md border border-[var(--c-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--c-accent)] hover:bg-[var(--c-accent)] hover:text-white" data-testid={`letter-open-${r.leadId}`}>{r.blanks === null ? "Start the letter" : "Open the letter"}</Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
