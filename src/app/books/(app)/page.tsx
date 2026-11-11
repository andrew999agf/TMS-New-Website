import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { sbAccounts, sbAudit, sbMemberships, sbTaxRules } from "@/db/schema";
import { requireBooks, booksCompany, requestHost } from "@/lib/books/auth";
import { booksBase } from "@/lib/books/host";
import { balances, clientTrustBalances, closedThrough, ledgerSpan, listAccounts, natural, profitAndLoss } from "@/lib/books/ledger";
import { sbReconciliations } from "@/db/schema";
import { txnCounts } from "@/lib/books/banking";
import { upcomingDeadlines } from "@/lib/books/payroll";
import { fmtCents, todayIso } from "@/lib/books/money";

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
  const today = todayIso();
  const [chart, bal, counts, trustClients, ytd, deadlines] = await Promise.all([listAccounts(company.id), balances(company.id), txnCounts(company.id), clientTrustBalances(company.id), profitAndLoss(company.id, `${today.slice(0, 4)}-01-01`, today), upcomingDeadlines(4)]);
  const sumOf = (pred: (a: (typeof chart)[number]) => boolean) => chart.filter(pred).reduce((t, a) => t + natural(a, bal.get(a.id)), 0);
  const cash = sumOf((a) => a.subtype === "bank" && !a.isTrust), cards = sumOf((a) => a.subtype === "credit_card"), trustBank = sumOf((a) => a.subtype === "trust_bank");
  const trustHeld = trustClients.reduce((t, c) => t + c.balance, 0);
  const trustIds = new Set(chart.filter((a) => a.subtype === "trust_bank").map((a) => a.id));
  const toReview = [...counts.entries()].filter(([id]) => !trustIds.has(id)).reduce((t, [, c]) => t + c.new, 0);
  const trustToAssign = [...counts.entries()].filter(([id]) => trustIds.has(id)).reduce((t, [, c]) => t + c.new, 0);
  const [span, closed, recs] = await Promise.all([ledgerSpan(company.id), closedThrough(company.id), db.select({ id: sbReconciliations.id }).from(sbReconciliations).where(eq(sbReconciliations.companyId, company.id)).limit(1)]);
  const imported = [...counts.values()].reduce((t, c) => t + c.new + c.posted + c.excluded, 0);
  const tiles: { label: string; value: string; href: string; warn?: string; id: string }[] = [
    { id: "cash", label: "Operating cash", value: fmtCents(cash, { paren: true, dollar: true }), href: `${base}/banking` },
    { id: "cards", label: "Credit cards owed", value: fmtCents(cards, { paren: true, dollar: true }), href: `${base}/banking` },
    { id: "trust", label: "Held in trust for clients", value: fmtCents(trustHeld, { paren: true, dollar: true }), href: `${base}/trust`, warn: trustBank !== trustHeld || trustClients.some((c) => c.balance < 0) ? "Does not agree with the IOLTA account" : trustToAssign ? `${trustToAssign} statement row${trustToAssign === 1 ? "" : "s"} to assign` : undefined },
    { id: "review", label: "Statement rows to review", value: String(toReview), href: `${base}/banking`, warn: toReview ? "Not in the books or reports until posted" : undefined },
    { id: "net", label: `Net income, ${today.slice(0, 4)} to date`, value: fmtCents(ytd.net, { paren: true, dollar: true }), href: `${base}/reports?r=pl` },
  ];
  const steps = [
    { done: !!company.ein, label: "Company profile: EIN, entity type, tax election", href: `${base}/settings` },
    { done: !!company.operatingBankName && !!company.ioltaBankName, label: "Name the operating and IOLTA bank accounts", href: `${base}/settings` },
    { done: accounts.length > 0, label: `Chart of accounts (${accounts.length} accounts)`, href: `${base}/accounts` },
    { done: rules.length > 0 && rules.every((r) => r.verified), label: `Tax rules for ${new Date().getFullYear()} reviewed (${rules.filter((r) => r.verified).length} of ${rules.length} confirmed)`, href: `${base}/settings#tax-rules` },
    { done: members.length > 1, label: "A second login for the bookkeeper", href: `${base}/settings#users` },
    { done: span.entries > 0, label: "Opening balances entered (Journal), and each client's trust balance (Trust)", href: `${base}/journal` },
    { done: imported > 0, label: "First bank statement file brought in", href: `${base}/banking` },
    { done: imported > 0 && toReview === 0 && trustToAssign === 0, label: toReview + trustToAssign > 0 ? `Statement rows posted (${toReview + trustToAssign} still waiting)` : "Statement rows posted", href: `${base}/banking` },
    { done: recs.length > 0, label: "First reconciliation to a statement", href: `${base}/banking?view=reconcile` },
  ];
  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-2xl">{company.name}</h1>
      {closed && <p className="mt-1 text-xs text-[var(--c-ink-muted)]" data-testid="dash-closed">Books closed through <span className="font-mono">{closed}</span>.</p>}
      <p className="mt-1 text-sm text-[var(--c-ink-muted)]">{company.legalName}{company.ein ? ` · EIN ${company.ein}` : ""} · {company.state} · {company.entityType.toUpperCase()} taxed as {company.taxElection.replace("_", " ")} · fiscal year starts month {company.fiscalYearStartMonth}</p>
      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="dash-tiles">
        {tiles.map((t) => (
          <Link key={t.id} href={t.href} className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4 hover:border-[var(--c-accent)]" data-testid={`dash-${t.id}`}>
            <p className="text-[11px] uppercase tracking-wide text-[var(--c-ink-muted)]">{t.label}</p>
            <p className="mt-1 font-mono text-lg font-semibold">{t.value}</p>
            {t.warn && <p className="mt-1 text-[11px] font-semibold text-red-700">{t.warn}</p>}
          </Link>
        ))}
      </section>
      {deadlines.length > 0 && (
        <section className="mt-4 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5" data-testid="dash-deadlines">
          <h2 className="text-sm font-semibold">Coming up</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {deadlines.slice(0, 4).map((d, i) => <li key={i}><span className="font-mono text-xs">{d.date}</span> · {d.label}</li>)}
          </ul>
          <Link href={`${base}/payroll`} className="mt-2 inline-block text-xs text-[var(--c-accent)] hover:underline">All filing dates</Link>
        </section>
      )}
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
