import Link from "next/link";
import { requireBooks, requestHost } from "@/lib/books/auth";
import { booksBase } from "@/lib/books/host";
import { balances, canWrite, listAccounts, natural } from "@/lib/books/ledger";
import { payrollOverview, upcomingDeadlines } from "@/lib/books/payroll";
import { gustoConfigured } from "@/lib/books/gusto";
import { fmtCents } from "@/lib/books/money";
import { PayrollList } from "@/components/books/Payroll";

export default async function PayrollPage() {
  const session = await requireBooks();
  const base = booksBase(await requestHost());
  const cid = session.companyId;
  const [overview, deadlines, accounts, bal] = await Promise.all([payrollOverview(cid), upcomingDeadlines(), listAccounts(cid), balances(cid)]);
  const owed = accounts.filter((a) => a.subtype === "payroll_liability").reduce((s, a) => s + natural(a, bal.get(a.id)), 0);
  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-2xl">Payroll</h1>
      <p className="mt-1 text-sm text-[var(--c-ink-muted)]">Gusto runs payroll, pays the people and pays the taxes. This screen reads what Gusto ran and records each payroll in the books when you approve it. It cannot run a payroll, change one, or move money.</p>

      {overview.connected ? (
        <>
          <p className="mt-4 text-sm" data-testid="payroll-source">Reading from Gusto: <span className="font-semibold">{overview.companyName || "connected company"}</span>{overview.environment !== "production" && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-sky-900" data-testid="payroll-practice">Practice data</span>}</p>
          {owed !== 0 && <p className="mt-1 text-sm text-[var(--c-ink-muted)]">Payroll liabilities in the books (withheld or accrued, not yet paid over): <span className="font-mono font-semibold text-[var(--c-ink)]" data-testid="payroll-owed">{fmtCents(owed, { paren: true, dollar: true })}</span></p>}
          <PayrollList practice={overview.environment !== "production"} canEdit={canWrite(session.role)} rows={overview.rows.map((r) => ({ externalId: r.externalId, checkDate: r.checkDate, periodStart: r.periodStart, periodEnd: r.periodEnd, offCycle: r.offCycle, entryId: r.entryId, postedBy: r.postedBy, proposal: r.proposal }))} />
          <p className="mt-3 text-xs leading-relaxed text-[var(--c-ink-muted)]">After a payroll is posted, the money Gusto took shows up on the operating statement. Under Banking, those rows offer &quot;Match to entry&quot; so the payroll isn&apos;t counted twice.</p>
        </>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-[var(--c-border)] bg-[var(--c-surface)] p-5" data-testid="payroll-not-connected">
          <p className="text-sm font-semibold">{gustoConfigured() ? "Gusto isn't linked yet, or the link needs attention" : "Gusto isn't set up on this site yet"}</p>
          <p className="mt-1 text-sm text-[var(--c-ink-muted)]">{overview.error}</p>
          <Link href={`${base}/settings`} className="mt-3 inline-block rounded-md bg-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-[var(--c-on-accent)]">Open Settings → Connections</Link>
        </div>
      )}

      <section className="mt-8" data-testid="deadlines">
        <h2 className="text-sm font-semibold">Filing dates in the next twelve months</h2>
        <p className="mt-0.5 text-xs text-[var(--c-ink-muted)]">From the tax rules under Settings. If your payroll service files these for you, use the list to confirm each one went in. A date that falls on a weekend or holiday moves to the next business day.</p>
        <table className="mt-3 w-full text-sm">
          <tbody>
            {deadlines.map((d, i) => (
              <tr key={i} className="border-t border-[var(--c-border)]">
                <td className="w-28 py-1.5 font-mono text-xs">{d.date}</td>
                <td className="py-1.5">{d.label}{!d.verified && <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">not yet confirmed</span>}</td>
              </tr>
            ))}
            {deadlines.length === 0 && <tr><td className="py-2 text-sm text-[var(--c-ink-muted)]">No dates on file.</td></tr>}
          </tbody>
        </table>
      </section>
      <p className="mt-6 text-xs leading-relaxed text-[var(--c-ink-muted)]">Not built here, because Gusto does it: employee records, W-4s, pay stubs, tax deposits and the returns themselves.</p>
    </div>
  );
}
