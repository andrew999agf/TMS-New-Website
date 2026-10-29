import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { sbAccounts, sbAudit, sbMemberships, sbTaxRules } from "@/db/schema";
import { requireBooks, booksCompany, requestHost } from "@/lib/books/auth";
import { booksBase } from "@/lib/books/host";

export default async function BooksDashboard() {
  const session = await requireBooks();
  const base = booksBase(await requestHost());
  const company = await booksCompany(session.companyId);
  if (!company || !db) return null;
  const [accounts, members, rules, recent] = await Promise.all([
    db.select({ id: sbAccounts.id }).from(sbAccounts).where(eq(sbAccounts.companyId, company.id)),
    db.select({ id: sbMemberships.id }).from(sbMemberships).where(eq(sbMemberships.companyId, company.id)),
    db.select({ verified: sbTaxRules.verified }).from(sbTaxRules).where(eq(sbTaxRules.year, new Date().getFullYear())),
    db.select().from(sbAudit).where(eq(sbAudit.companyId, company.id)).orderBy(desc(sbAudit.id)).limit(8),
  ]);
  const steps = [
    { done: !!company.ein, label: "Company profile: EIN, entity type, tax election", href: `${base}/settings` },
    { done: !!company.operatingBankName && !!company.ioltaBankName, label: "Name the operating and IOLTA bank accounts", href: `${base}/settings` },
    { done: accounts.length > 0, label: `Chart of accounts (${accounts.length} accounts)`, href: `${base}/accounts` },
    { done: rules.length > 0 && rules.every((r) => r.verified), label: `Tax rules for ${new Date().getFullYear()} reviewed (${rules.filter((r) => r.verified).length} of ${rules.length} confirmed)`, href: `${base}/settings#tax-rules` },
    { done: members.length > 1, label: "A second login for the bookkeeper", href: `${base}/settings#users` },
  ];
  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-2xl">{company.name}</h1>
      <p className="mt-1 text-sm text-[var(--c-ink-muted)]">{company.legalName}{company.ein ? ` · EIN ${company.ein}` : ""} · {company.state} · {company.entityType.toUpperCase()} taxed as {company.taxElection.replace("_", " ")} · fiscal year starts month {company.fiscalYearStartMonth}</p>
      <section className="mt-6 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5">
        <h2 className="text-sm font-semibold">Set-up</h2>
        <ul className="mt-3 space-y-2">
          {steps.map((s) => (
            <li key={s.label} className="flex items-center gap-2 text-sm">
              {s.done ? <CheckCircle2 size={16} className="text-emerald-600" /> : <Circle size={16} className="text-[var(--c-ink-muted)]" />}
              <Link href={s.href} className={s.done ? "text-[var(--c-ink-muted)]" : "hover:underline"}>{s.label}</Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5">
          <h2 className="text-sm font-semibold">What this is</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--c-ink-muted)]">The firm&apos;s books, trust ledgers, payroll records and reports, under one company record with its own login and two-factor sign-in. It can look at bank activity and prepare every filing; it never moves money. Built to be lifted into another company as-is.</p>
        </div>
        <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5">
          <h2 className="text-sm font-semibold">Recent activity</h2>
          {recent.length === 0 ? <p className="mt-2 text-sm text-[var(--c-ink-muted)]">Nothing yet.</p> : (
            <ul className="mt-2 space-y-1 text-xs text-[var(--c-ink-muted)]">
              {recent.map((a) => <li key={a.id}><span className="font-mono">{a.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span> · {a.userEmail} · {a.action}{a.detail ? ` — ${a.detail}` : ""}</li>)}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
