"use client";

import { useState } from "react";
import Link from "next/link";
import { FileSignature } from "lucide-react";
import { LeadOutcome, isOutcome, type CaseLink, type Referral } from "./LeadOutcome";

export type LetterRow = { leadId: number; name: string; matter: string; received: string; blanks: number | null; status: string; archived: boolean; referral?: Referral; caseLink?: CaseLink };

/** On the partner's tab: each lead's engagement letter and how far along it is. Archived leads are tucked away. */
export function PartnerLetters({ rows, partnerName, moreActive = 0, attorneys = [] }: { rows: LetterRow[]; partnerName: string; moreActive?: number; attorneys?: string[] }) {
  const [showArchived, setShowArchived] = useState(false);
  const archived = rows.filter((r) => r.archived).length;
  const unknown = rows.filter((r) => r.archived && !isOutcome(r.status)).length;
  const shown = showArchived ? rows : rows.filter((r) => !r.archived);
  return (
    <div id="letters" className="mb-6 scroll-mt-6 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]" data-testid="partner-letters">
      <div className="flex flex-wrap items-start justify-between gap-2 p-5 pb-3">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-semibold"><FileSignature size={15} /> Engagement letters</p>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--c-ink-muted)]">Your Word letter for {partnerName} cases (English and Spanish). Each one opens already filled in with what the person entered on the intake form; finish the remaining blanks and download it as Word or PDF. Record the outcome when you know it.</p>
        </div>
        {archived > 0 && <label className="flex items-center gap-2 text-xs text-[var(--c-ink-muted)]"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} data-testid="letters-show-archived" /> Show archived ({archived}{unknown > 0 ? `, ${unknown} with no outcome` : ""})</label>}
      </div>
      {shown.length === 0 ? <p className="mx-5 mb-5 rounded-md border border-dashed border-[var(--c-border)] px-4 py-3 text-xs text-[var(--c-ink-muted)]" data-testid="letters-empty">{rows.length === 0 ? "No leads yet." : "Nothing open. Every lead here has been archived."}</p> : (
        <ul className="divide-y divide-[var(--c-border)] border-t border-[var(--c-border)]">
          {shown.map((r) => (
            <li key={r.leadId} className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 py-2.5 ${r.archived ? "bg-[var(--c-bg)]" : ""}`} data-testid={`letter-${r.leadId}`}>
              <p className={`text-sm ${r.archived ? "text-[var(--c-ink-muted)]" : ""}`}><span className="font-medium">{r.name || "(no name)"}</span>{r.matter ? <span className="text-[var(--c-ink-muted)]"> · {r.matter}</span> : null}<span className="text-[var(--c-ink-muted)]"> · {r.received}</span>{r.archived && <span className="ml-2 rounded-full border border-[var(--c-border)] px-2 py-0.5 text-[11px] font-semibold text-[var(--c-ink-muted)]">Archived</span>}{r.archived && !isOutcome(r.status) && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900" data-testid={`letter-unknown-${r.leadId}`}>No outcome recorded</span>}</p>
              <span className="flex flex-wrap items-center justify-end gap-3">
                <LeadOutcome leadId={r.leadId} status={r.status} archived={r.archived} where="letter" attorneys={attorneys} referral={r.referral} caseLink={r.caseLink} />
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.blanks === null ? "bg-[var(--c-bg)] text-[var(--c-ink-muted)]" : r.blanks === 0 ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`} data-testid={`letter-status-${r.leadId}`}>{r.blanks === null ? "Not started" : r.blanks === 0 ? "Ready" : `${r.blanks} field${r.blanks === 1 ? "" : "s"} still empty`}</span>
                <Link href={`/admin/intake/contract/${r.leadId}`} className="rounded-md border border-[var(--c-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--c-accent)] hover:bg-[var(--c-accent)] hover:text-white" data-testid={`letter-open-${r.leadId}`}>{r.blanks === null ? "Start the letter" : "Open the letter"}</Link>
              </span>
            </li>
          ))}
        </ul>
      )}
      {moreActive > 0 && <p className="border-t border-[var(--c-border)] px-5 py-2 text-xs text-[var(--c-ink-muted)]" data-testid="letters-more">Showing the newest {rows.filter((r) => !r.archived).length} open leads. {moreActive} older one{moreActive === 1 ? " is" : "s are"} in the lead table below.</p>}
    </div>
  );
}
