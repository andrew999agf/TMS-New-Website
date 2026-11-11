import Link from "next/link";
import { Download } from "lucide-react";
import { requireBooks, booksCompany, requestHost } from "@/lib/books/auth";
import { booksBase } from "@/lib/books/host";
import { ledgerSpan, listAccounts } from "@/lib/books/ledger";
import { waitingSummary } from "@/lib/books/banking";
import { fmtCents } from "@/lib/books/money";
import { buildReport, REPORTS, type ReportId } from "@/lib/books/reports";
import { isIsoDate, todayIso } from "@/lib/books/money";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireBooks();
  const sp = await searchParams;
  const base = booksBase(await requestHost());
  const company = await booksCompany(session.companyId);
  const today = todayIso();
  const id = (REPORTS.some(([k]) => k === sp.r) ? sp.r : "pl") as ReportId;
  const from = isIsoDate(sp.from) ? sp.from : `${today.slice(0, 4)}-01-01`;
  const to = isIsoDate(sp.to) ? sp.to : today;
  const accounts = await listAccounts(session.companyId);
  const accountId = Number(sp.account) || undefined;
  const report = await buildReport(session.companyId, id, { from, to, accountId, fiscalStartMonth: company?.fiscalYearStartMonth ?? 1, companyName: company?.legalName || company?.name || "" });
  const [waiting, span] = await Promise.all([waitingSummary(session.companyId, { from, to }), ledgerSpan(session.companyId)]);
  const outside = span.entries > 0 && id !== "audit" && (span.last < from || span.first > to);
  const asOfOnly = id === "bs" || id === "tb" || id === "trust";
  const qs = new URLSearchParams({ r: id, from, to, ...(accountId ? { account: String(accountId) } : {}) }).toString();
  const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-2.5 py-1.5 text-sm";
  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-2xl">Reports</h1>
      <p className="mt-1 text-sm text-[var(--c-ink-muted)]">Read straight from the ledger. Each one downloads as a spreadsheet for the CPA.</p>
      <nav className="mt-4 flex flex-wrap gap-1 border-b border-[var(--c-border)]" aria-label="Reports">
        {REPORTS.map(([k, label]) => <Link key={k} href={`${base}/reports?${new URLSearchParams({ r: k, from, to }).toString()}`} className={`border-b-2 px-3 py-2 text-sm ${k === id ? "border-[var(--c-accent)] font-semibold text-[var(--c-accent)]" : "border-transparent text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"}`} data-testid={`report-tab-${k}`}>{label}</Link>)}
      </nav>
      <form className="mt-4 flex flex-wrap items-end gap-2 text-xs" method="get">
        <input type="hidden" name="r" value={id} />
        {id === "gl" && <label>Account<select name="account" defaultValue={accountId ?? ""} className={`${input} mt-1 block max-w-xs`} data-testid="report-account"><option value="">Choose an account…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.number} · {a.name}</option>)}</select></label>}
        {asOfOnly ? <input type="hidden" name="from" value={from} /> : <label>From<input type="date" name="from" defaultValue={from} className={`${input} mt-1 block`} data-testid="report-from" /></label>}
        <label>{asOfOnly ? "As of" : "To"}<input type="date" name="to" defaultValue={to} className={`${input} mt-1 block`} data-testid="report-to" /></label>
        <button className="rounded-md border border-[var(--c-border)] px-3 py-2 text-sm hover:border-[var(--c-accent)]" data-testid="report-show">Show</button>
        <a href={`${base}/reports/export?${qs}`} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-3 py-2 text-sm hover:border-[var(--c-accent)]" data-testid="report-download"><Download size={14} /> Download spreadsheet</a>
      </form>
      {waiting.rows > 0 && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-[#1c1917]" data-testid="report-waiting">
          <span className="font-semibold">{waiting.rows.toLocaleString("en-US")} imported statement row{waiting.rows === 1 ? " is" : "s are"} not in these reports yet</span> ({fmtCents(waiting.moneyIn, { dollar: true })} in, {fmtCents(waiting.moneyOut, { dollar: true })} out, dated {waiting.first} to {waiting.last}). A row counts once it has been given an account and posted.{" "}
          <Link href={`${base}/banking`} className="font-semibold underline">Go to Banking to post them</Link>
        </div>
      )}
      <p className="mt-3 text-xs text-[var(--c-ink-muted)]" data-testid="report-span">{span.entries === 0 ? "The books are empty: nothing has been posted yet." : `The books hold ${span.entries.toLocaleString("en-US")} posted entr${span.entries === 1 ? "y" : "ies"}, dated ${span.first} through ${span.last}.`}{outside ? <span className="font-semibold text-amber-800"> None of them fall in the dates chosen above — change the dates to see them.</span> : null}</p>
      <section className="mt-5 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5" data-testid="report">
        <h2 className="font-[family-name:var(--font-display)] text-lg" data-testid="report-title">{report.title}</h2>
        <p className="text-xs text-[var(--c-ink-muted)]">{report.subtitle}</p>
        {report.columns.length > 0 && (
          <div className="overflow-x-auto"><table className={`mt-4 w-full text-sm ${report.columns.length > 6 ? "min-w-[60rem]" : ""}`}>
            <thead><tr className="text-[11px] uppercase tracking-wide text-[var(--c-ink-muted)]">{report.columns.map((c) => <th key={c.label} className={`pb-1 font-medium ${c.num ? "text-right" : "text-left"}`}>{c.label}</th>)}</tr></thead>
            <tbody>
              {report.rows.map((r, i) => (
                <tr key={i} className={r.kind === "head" ? "" : "border-t border-[var(--c-border)]"} data-row={r.kind ?? "line"}>
                  {r.cells.map((c, j) => <td key={j} className={`py-1.5 ${report.columns[j]?.num ? "text-right font-mono text-xs" : ""} ${r.kind === "head" ? "pt-4 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--c-ink-muted)]" : ""} ${r.kind === "total" || r.kind === "grand" ? "font-semibold" : ""} ${r.kind === "grand" ? "border-t-2 border-[var(--c-ink)]" : ""} ${r.kind === "note" ? "text-[var(--c-ink-muted)]" : ""} ${!r.kind && j === 0 && (report.columns.length === 2 || id === "plm") ? "pl-4" : ""} ${id === "plm" && j > 0 ? "whitespace-nowrap pl-3" : ""}`}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {report.columns.length > 0 && report.rows.length === 0 && <p className="mt-3 text-sm text-[var(--c-ink-muted)]">Nothing in this period.</p>}
        {report.ok && <p className={`mt-3 text-xs ${report.ok.good ? "text-emerald-700" : "text-red-700"}`} data-testid="report-check">{report.ok.text}</p>}
      </section>
      <p className="mt-4 text-xs leading-relaxed text-[var(--c-ink-muted)]">Not built yet: cash-flow statement, aged receivables, income by matter or attorney, and a 1099 summary. The trial balance, the journal and each account&apos;s detail are what a CPA needs to prepare the return.</p>
    </div>
  );
}
