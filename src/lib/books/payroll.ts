import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { sbEntries, sbPayrollRuns, sbTaxRules } from "@/db/schema";
import { listGustoPayrolls, type GustoPayroll } from "./gusto";
import { LedgerError, listAccounts, postEntry, type Account } from "./ledger";
import { toCents, todayIso } from "./money";

/**
 * Payroll in the books. The payroll service runs payroll and pays the taxes;
 * this module only READS what it ran and records it: one ledger entry per
 * payroll, shown to a person first and posted only when they approve it.
 * Practice (demo) payrolls can be previewed but never posted.
 */
export type ProposedLine = { key: string; number: string; name: string; debit: number; credit: number; memo: string };
export type Proposal = { ok: true; lines: ProposedLine[]; figures: { label: string; amount: number }[]; note: string } | { ok: false; error: string };

const c = (t: Record<string, string>, k: string) => Math.max(0, toCents(t[k] ?? "") ?? 0);

/**
 * Turn the payroll service's totals into a balanced entry:
 *   debit   wages (gross pay), employer payroll taxes, employer-paid benefits, owner's draw
 *   credit  the operating bank for what the service took (net pay, taxes, and so on)
 *   and whatever is left — benefit premiums and other deductions withheld but
 *   not yet paid over — sits in Payroll liabilities until it is paid.
 */
export function proposePayrollEntry(accounts: Account[], t: Record<string, string>): Proposal {
  const by = (key: string) => accounts.find((a) => a.systemKey === key && a.active);
  const wages = by("wages"), taxes = by("payroll_taxes"), benefits = by("benefits"), bank = by("operating_bank"), liab = by("payroll_liabilities"), draws = by("owner_draws");
  if (!wages || !taxes || !bank || !liab) return { ok: false, error: "The chart of accounts is missing Salaries and wages, Payroll taxes, the operating bank account or Payroll liabilities." };
  const gross = c(t, "gross_pay"), erTax = c(t, "employer_taxes"), eeTax = c(t, "employee_taxes"), net = c(t, "net_pay"), erBen = c(t, "benefits"), draw = c(t, "owners_draw"), reimb = c(t, "reimbursements");
  if (gross === 0 && net === 0) return { ok: false, error: "The payroll service returned no gross or net pay for this payroll." };
  const L = (a: Account, debit: number, credit: number, memo: string): ProposedLine => ({ key: a.systemKey ?? "", number: a.number, name: a.name, debit, credit, memo });
  const lines: ProposedLine[] = [L(wages, gross, 0, "Gross pay")];
  if (erTax) lines.push(L(taxes, erTax, 0, "Employer payroll taxes"));
  if (erBen && benefits) lines.push(L(benefits, erBen, 0, "Employer-paid benefits"));
  if (draw && draws) lines.push(L(draws, draw, 0, "Owner's draw"));
  // What left the bank. Prefer the service's own debit figures, piece by piece, so each can be matched to the statement.
  const pieces: [string, string][] = [["net_pay_debit", "Net pay"], ["tax_debit", "Payroll taxes"], ["reimbursement_debit", "Reimbursements"], ["child_support_debit", "Child support withheld"]];
  const parts = pieces.map(([k, label]) => ({ label, amount: c(t, k) })).filter((p) => p.amount > 0);
  const companyDebit = c(t, "company_debit");
  let bankLines: { label: string; amount: number }[];
  if (parts.length && (!companyDebit || parts.reduce((s, p) => s + p.amount, 0) === companyDebit)) bankLines = parts;
  else if (companyDebit) bankLines = [{ label: "Total taken by the payroll service", amount: companyDebit }];
  else bankLines = [{ label: "Net pay", amount: net }, { label: "Payroll taxes", amount: eeTax + erTax }].filter((p) => p.amount > 0);
  for (const p of bankLines) lines.push(L(bank, 0, p.amount, p.label));
  const debits = lines.reduce((s, l) => s + l.debit, 0), credits = lines.reduce((s, l) => s + l.credit, 0);
  const rest = debits - credits;
  if (rest > 0) lines.push(L(liab, 0, rest, "Withheld or accrued, not yet paid over (benefits, other deductions)"));
  else if (rest < 0) lines.push(L(liab, -rest, 0, reimb ? "Reimbursements and other amounts paid beyond wages and taxes" : "Paid beyond wages and taxes"));
  const figures = [{ label: "Gross pay", amount: gross }, { label: "Employee taxes withheld", amount: eeTax }, { label: "Employer taxes", amount: erTax }, { label: "Net pay", amount: net }, ...(companyDebit ? [{ label: "Total taken from the bank", amount: companyDebit }] : [])];
  const note = rest === 0 ? "" : rest > 0 ? "Part of this payroll was withheld or accrued but not taken from the bank with it. It is recorded as owed (Payroll liabilities) until it is paid." : "The payroll service took more from the bank than wages and taxes explain (for example reimbursements). The difference is recorded against Payroll liabilities — look at it before posting.";
  return { ok: true, lines, figures, note };
}

export type PayrollRow = GustoPayroll & { proposal: Proposal; entryId: number | null; postedBy: string | null; postedAt: string | null };

export async function payrollOverview(companyId: number): Promise<{ connected: false; error: string } | { connected: true; environment: string; companyName: string; rows: PayrollRow[] }> {
  const res = await listGustoPayrolls(companyId);
  if (!res.ok) return { connected: false, error: res.error };
  const accounts = await listAccounts(companyId);
  const ids = res.payrolls.map((p) => p.externalId);
  const runs = db && ids.length ? await db.select({ externalId: sbPayrollRuns.externalId, entryId: sbPayrollRuns.entryId, postedBy: sbPayrollRuns.postedBy, postedAt: sbPayrollRuns.postedAt, status: sbEntries.status })
    .from(sbPayrollRuns).leftJoin(sbEntries, eq(sbEntries.id, sbPayrollRuns.entryId)).where(and(eq(sbPayrollRuns.companyId, companyId), eq(sbPayrollRuns.provider, "gusto"), inArray(sbPayrollRuns.externalId, ids))) : [];
  const live = new Map(runs.filter((r) => r.entryId && r.status === "posted").map((r) => [r.externalId, r]));
  return { connected: true, environment: res.environment, companyName: res.companyName, rows: res.payrolls.map((p) => { const r = live.get(p.externalId); return { ...p, proposal: proposePayrollEntry(accounts, p.totals), entryId: r?.entryId ?? null, postedBy: r?.postedBy ?? null, postedAt: r?.postedAt?.toISOString() ?? null }; }) };
}

/** Post one payroll. The figures are read from the payroll service again here, never taken from the browser. */
export async function postPayroll(companyId: number, externalId: string, by: string): Promise<{ entryId: number }> {
  if (!db) throw new LedgerError("Database not configured.");
  const res = await listGustoPayrolls(companyId);
  if (!res.ok) throw new LedgerError(res.error);
  if (res.environment !== "production") throw new LedgerError("This is practice data from Gusto's demo company, so it can't be posted to the books. It can be posted once the connection is switched to your real Gusto account.");
  const p = res.payrolls.find((x) => x.externalId === externalId);
  if (!p) throw new LedgerError("Gusto no longer lists that payroll.");
  const accounts = await listAccounts(companyId);
  const proposal = proposePayrollEntry(accounts, p.totals);
  if (!proposal.ok) throw new LedgerError(proposal.error);
  return db.transaction(async (tx) => {
    const [run] = await tx.select().from(sbPayrollRuns).where(and(eq(sbPayrollRuns.companyId, companyId), eq(sbPayrollRuns.provider, "gusto"), eq(sbPayrollRuns.externalId, externalId))).limit(1);
    if (run?.entryId) {
      const [e] = await tx.select({ status: sbEntries.status }).from(sbEntries).where(eq(sbEntries.id, run.entryId)).limit(1);
      if (e?.status === "posted") throw new LedgerError(`That payroll is already in the books as entry #${run.entryId}.`);
    }
    const entry = await postEntry(companyId, {
      date: p.checkDate, source: "payroll", sourceRef: `gusto:${externalId}`.slice(0, 128), memo: `Payroll paid ${p.checkDate}${p.periodStart ? ` (period ${p.periodStart} to ${p.periodEnd})` : ""}${p.offCycle ? ", off-cycle" : ""}`,
      lines: proposal.lines.map((l) => ({ accountId: accounts.find((a) => a.number === l.number)!.id, debit: l.debit, credit: l.credit, memo: l.memo, payee: l.key === "operating_bank" ? "Gusto" : "" })),
    }, by, tx);
    const values = { companyId, provider: "gusto", externalId, environment: res.environment, checkDate: p.checkDate, periodStart: p.periodStart || null, periodEnd: p.periodEnd || null, totals: p.totals, entryId: entry.id, postedBy: by, postedAt: new Date() };
    if (run) await tx.update(sbPayrollRuns).set(values).where(eq(sbPayrollRuns.id, run.id)); else await tx.insert(sbPayrollRuns).values(values);
    return { entryId: entry.id };
  });
}

export type Deadline = { date: string; label: string; verified: boolean; note: string; source: string };

/** The next year of filing dates, read from the tax-rules table (Settings), soonest first. */
export async function upcomingDeadlines(months = 12): Promise<Deadline[]> {
  if (!db) return [];
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const rules = await db.select().from(sbTaxRules).where(inArray(sbTaxRules.key, ["form_941_due", "form_940_due", "w2_due", "nec_1099_due", "sui_report_due", "franchise_due"]));
  const latest = new Map<string, (typeof rules)[number]>();
  for (const r of rules) { const cur = latest.get(r.key); if (!cur || (r.year <= year && r.year > cur.year) || (cur.year > year && r.year < cur.year)) latest.set(r.key, r); }
  const end = new Date(`${today}T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + months);
  const endIso = end.toISOString().slice(0, 10);
  const SHORT: Record<string, string> = { form_941_due: "Form 941 (quarterly federal payroll return)", form_940_due: "Form 940 (annual federal unemployment return)", w2_due: "W-2s to employees and W-3 to the SSA", nec_1099_due: "1099-NEC to contractors and the IRS", sui_report_due: "Texas Workforce Commission quarterly wage report", franchise_due: "Texas franchise tax report" };
  const out: Deadline[] = [];
  for (const r of latest.values()) {
    const days = (Array.isArray(r.value) ? r.value : [r.value]).filter((v): v is string => typeof v === "string" && /^\d{2}-\d{2}$/.test(v));
    for (const md of days) for (const y of [year, year + 1]) { const d = `${y}-${md}`; if (d >= today && d <= endIso) out.push({ date: d, label: SHORT[r.key] ?? r.label, verified: r.verified, note: r.note, source: r.source }); }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
