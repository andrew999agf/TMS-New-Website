"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, Handshake } from "lucide-react";

export type PartnerTab = { slug: string; name: string; website: string; url: string; total: number; fresh: number };

/** Intake sub-tabs: every lead, and one tab per partner office. A partner's
 *  tab shows the SAME leads filtered to that partner — not copies — so a
 *  status change made in either tab is the one change. */
export function PartnerIntakeTabs({ partners, active, allCount }: { partners: PartnerTab[]; active: string | null; allCount: number }) {
  const tab = "inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors";
  const on = "border-[var(--c-accent)] font-semibold text-[var(--c-accent)]";
  const off = "border-transparent text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]";
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-[var(--c-border)]" aria-label="Intake views" data-testid="intake-tabs">
      <Link href="/admin/intake" className={`${tab} ${active ? off : on}`} data-testid="tab-all">All leads <span className="rounded-full bg-[var(--c-surface2)] px-1.5 text-[11px]">{allCount}</span></Link>
      {partners.map((p) => (
        <Link key={p.slug} href={`/admin/intake?partner=${p.slug}`} className={`${tab} ${active === p.slug ? on : off}`} data-testid={`tab-${p.slug}`}>
          <Handshake size={14} /> {p.name} <span className="rounded-full bg-[var(--c-surface2)] px-1.5 text-[11px]">{p.total}</span>
          {p.fresh > 0 && <span className="rounded-full bg-[var(--c-accent)] px-1.5 text-[11px] font-semibold text-white" title="Not yet contacted">{p.fresh} new</span>}
        </Link>
      ))}
    </nav>
  );
}

/** The card at the top of a partner's tab: the link to give them. */
export function PartnerLinkCard({ partner }: { partner: PartnerTab }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mb-6 rounded-lg border border-[var(--c-accent)]/40 bg-[var(--c-accent)]/5 p-5" data-testid="partner-card">
      <p className="text-sm font-semibold">{partner.name} — intake link</p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--c-ink-muted)]">Give them this link. Their staff can fill it out with a walk-in or send the person to it. It is not in the website&apos;s menus, sitemap or search, and search engines are told to stay out. Everything submitted lands here and in All leads, and the intake team is emailed the same way as any other lead.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="break-all rounded bg-[var(--c-bg)] px-3 py-2 font-mono text-sm" data-testid="partner-url">{partner.url}</code>
        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(partner.url); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* select it by hand */ } }}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-xs hover:border-[var(--c-accent)]" data-testid="partner-copy">{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy link"}</button>
        <a href={partner.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-xs hover:border-[var(--c-accent)]"><ExternalLink size={13} /> Open it</a>
      </div>
      <p className="mt-3 text-[11px] text-[var(--c-ink-muted)]">{partner.total} lead{partner.total === 1 ? "" : "s"} so far{partner.fresh ? ` · ${partner.fresh} not yet contacted` : ""}. Processing a lead here is the same as processing it in All leads — it is one record.</p>
    </div>
  );
}
