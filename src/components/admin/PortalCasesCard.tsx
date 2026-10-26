"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Scale, Loader2, Check } from "lucide-react";
import { createCasesFromPortal } from "@/app/admin/(panel)/case-portal/actions";

export type PortalCaseGap = { matterId: number; title: string; clioMatter: string; groupId: number; groupName: string; companyName: string | null };

/**
 * "These Client Case Portal matters have no case record yet" — one click
 * creates them in Matters / Cases, keyed by Clio number, the same way the
 * portal set-up card populated the portal. Matters without a Clio number are
 * listed so they can be fixed, never guessed.
 */
export function PortalCasesCard({ missing, noClio, groupId, compact }: { missing: PortalCaseGap[]; noClio: PortalCaseGap[]; groupId?: number; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!missing.length && !noClio.length && !done) return null;
  const run = () => start(async () => {
    setError(null);
    const r = await createCasesFromPortal(groupId ?? null);
    if (!r.ok) { setError(r.error ?? "Couldn't create the cases."); return; }
    setDone(`${r.created} case record${r.created === 1 ? "" : "s"} created${r.existing ? `, ${r.existing} already existed` : ""}${r.noClio ? `, ${r.noClio} skipped (no Clio number)` : ""}.`);
    router.refresh();
  });
  const where = (m: PortalCaseGap) => [groupId ? null : m.groupName, m.companyName].filter(Boolean).join(" · ");
  return (
    <section className="rounded-lg border border-[var(--c-accent)]/40 bg-[var(--c-accent)]/5 p-4" data-testid="portal-cases-card">
      <div className="flex flex-wrap items-center gap-3">
        <Scale size={18} className="shrink-0 text-[var(--c-accent)]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--c-ink)]">
            {missing.length ? `${missing.length} Client Case Portal matter${missing.length === 1 ? " has" : "s have"} no case record in Matters / Cases yet` : "Every portal matter with a Clio number has a case record"}
          </p>
          <p className="text-[11px] leading-relaxed text-[var(--c-ink-muted)]">
            One click creates them, keyed by Clio matter number, with the style, parties, cause number, court, and county read from the portal title. Existing cases are never changed.
          </p>
        </div>
        {missing.length > 0 && (
          <button onClick={run} disabled={pending} className="btn btn-accent text-sm disabled:opacity-50" data-testid="portal-cases-create">
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Scale size={14} />} Create {missing.length} case record{missing.length === 1 ? "" : "s"}
          </button>
        )}
      </div>
      {done && <p className="mt-2 inline-flex items-center gap-1 text-xs text-green-700"><Check size={13} /> {done} <Link href="/admin/cases" className="ml-1 underline">Open Matters / Cases</Link></p>}
      {error && <p className="mt-2 text-xs text-[var(--c-error)]">{error}</p>}
      {!compact && missing.length > 0 && (
        <ul className="mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          {missing.map((m) => (
            <li key={m.matterId} className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 font-mono text-[11px] font-semibold text-[var(--c-accent)]">{m.clioMatter.split("-")[0]}</span>
              <Link href={`/admin/case-portal/${m.groupId}/matter/${m.matterId}`} className="min-w-0 truncate hover:text-[var(--c-accent)] hover:underline" title={m.title}>{m.title}</Link>
              {where(m) && <span className="shrink-0 text-[11px] text-[var(--c-ink-muted)]">{where(m)}</span>}
            </li>
          ))}
        </ul>
      )}
      {noClio.length > 0 && (
        <p className="mt-3 text-[11px] text-amber-800" data-testid="portal-cases-noclio">
          {noClio.length} matter{noClio.length === 1 ? "" : "s"} can&apos;t get a case record until it has a Clio matter number (set it on the matter&apos;s Dashboard):{" "}
          {noClio.map((m, i) => <span key={m.matterId}>{i ? ", " : ""}<Link href={`/admin/case-portal/${m.groupId}/matter/${m.matterId}`} className="underline">{m.title.slice(0, 60)}{m.title.length > 60 ? "…" : ""}</Link></span>)}
        </p>
      )}
    </section>
  );
}
