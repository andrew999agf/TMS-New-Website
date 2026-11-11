import "server-only";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { sbAudit } from "@/db/schema";
import { accountLedger, balanceSheet, clientTrustBalances, listAccounts, listEntries, monthlyNets, profitAndLoss, trialBalance } from "./ledger";
import { fmtCents, TYPE_LABEL } from "./money";

/** One report as a table: used by the Reports screen and by the spreadsheet export, so the two always agree. */
export type ReportTable = { title: string; subtitle: string; columns: { label: string; num?: boolean }[]; rows: { cells: (string | number)[]; kind?: "head" | "total" | "grand" | "note" }[]; ok?: { good: boolean; text: string } };
export const REPORTS = [
  ["pl", "Profit and loss"], ["plm", "Profit and loss by month"], ["bs", "Balance sheet"], ["tb", "Trial balance"], ["gl", "Account detail"], ["trust", "Trust balances by client"], ["journal", "Journal (all entries)"], ["audit", "Activity log"],
] as const;
export type ReportId = (typeof REPORTS)[number][0];

const money = (n: number) => fmtCents(n, { paren: true });

export async function buildReport(companyId: number, id: ReportId, p: { from: string; to: string; accountId?: number; fiscalStartMonth: number; companyName: string }): Promise<ReportTable> {
  if (id === "pl") {
    const r = await profitAndLoss(companyId, p.from, p.to);
    return {
      title: "Profit and loss", subtitle: `${p.companyName} · ${p.from} through ${p.to}`, columns: [{ label: "Account" }, { label: "Amount", num: true }],
      rows: [
        { cells: ["Income", ""], kind: "head" }, ...r.income.map((x) => ({ cells: [`${x.number} ${x.name}`, money(x.amount)] })), { cells: ["Total income", money(r.totalIncome)], kind: "total" as const },
        { cells: ["Expenses", ""], kind: "head" }, ...r.expense.map((x) => ({ cells: [`${x.number} ${x.name}`, money(x.amount)] })), { cells: ["Total expenses", money(r.totalExpense)], kind: "total" as const },
        { cells: ["Net income", money(r.net)], kind: "grand" },
      ],
    };
  }
  if (id === "plm") {
    const [accts, nets] = await Promise.all([listAccounts(companyId), monthlyNets(companyId, p.from, p.to)]);
    const months: string[] = [];
    for (let y = Number(p.from.slice(0, 4)), m = Number(p.from.slice(5, 7)); `${y}-${String(m).padStart(2, "0")}` <= p.to.slice(0, 7) && months.length < 24; m === 12 ? (y++, m = 1) : m++) months.push(`${y}-${String(m).padStart(2, "0")}`);
    const cell = new Map(nets.map((n) => [`${n.accountId}|${n.month}`, n.net]));
    const label = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
    const block = (type: "income" | "expense") => {
      const sign = type === "income" ? -1 : 1; // income is a credit balance
      const lines = accts.filter((a) => a.type === type).map((a) => ({ a, v: months.map((mo) => sign * (cell.get(`${a.id}|${mo}`) ?? 0)) })).filter((x) => x.v.some((n) => n !== 0));
      return { lines, totals: months.map((_, i) => lines.reduce((t, x) => t + x.v[i], 0)) };
    };
    const inc = block("income"), exp = block("expense");
    const sum = (v: number[]) => v.reduce((t, n) => t + n, 0);
    const row = (name: string, v: number[], kind?: "total" | "grand") => ({ cells: [name, ...v.map((n) => (n === 0 && !kind ? "" : money(n))), money(sum(v))], kind });
    return {
      title: "Profit and loss by month", subtitle: `${p.companyName} · ${p.from} through ${p.to}`,
      columns: [{ label: "Account" }, ...months.map((mo) => ({ label: label(mo), num: true })), { label: "Total", num: true }],
      rows: [
        { cells: ["Income", ...months.map(() => ""), ""], kind: "head" }, ...inc.lines.map((x) => row(`${x.a.number} ${x.a.name}`, x.v)), row("Total income", inc.totals, "total"),
        { cells: ["Expenses", ...months.map(() => ""), ""], kind: "head" }, ...exp.lines.map((x) => row(`${x.a.number} ${x.a.name}`, x.v)), row("Total expenses", exp.totals, "total"),
        row("Net income", months.map((_, i) => inc.totals[i] - exp.totals[i]), "grand"),
      ],
    };
  }
  if (id === "audit") {
    const end = new Date(`${p.to}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 2); // through the end of the day, Central time
    const rows = db ? await db.select().from(sbAudit).where(and(eq(sbAudit.companyId, companyId), gte(sbAudit.createdAt, new Date(`${p.from}T00:00:00Z`)), lt(sbAudit.createdAt, end))).orderBy(asc(sbAudit.id)).limit(5000) : [];
    const when = (d: Date) => d.toLocaleString("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit" });
    const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(d);
    return {
      title: "Activity log", subtitle: `${p.companyName} · ${p.from} through ${p.to} · who did what, oldest first`,
      columns: [{ label: "When (Central)" }, { label: "Who" }, { label: "Action" }, { label: "What" }],
      rows: rows.filter((r) => day(r.createdAt) >= p.from && day(r.createdAt) <= p.to).map((r) => ({ cells: [when(r.createdAt), r.userEmail, `${r.action} ${r.entity}`.trim(), r.detail] })),
    };
  }
  if (id === "bs") {
    const r = await balanceSheet(companyId, p.to, p.fiscalStartMonth);
    return {
      title: "Balance sheet", subtitle: `${p.companyName} · as of ${p.to}`, columns: [{ label: "Account" }, { label: "Amount", num: true }],
      rows: [
        { cells: [TYPE_LABEL.asset, ""], kind: "head" }, ...r.assets.map((x) => ({ cells: [`${x.number} ${x.name}${x.isTrust ? " (trust)" : ""}`, money(x.amount)] })), { cells: ["Total assets", money(r.totalAssets)], kind: "total" as const },
        { cells: [TYPE_LABEL.liability, ""], kind: "head" }, ...r.liabilities.map((x) => ({ cells: [`${x.number} ${x.name}${x.isTrust ? " (trust)" : ""}`, money(x.amount)] })), { cells: ["Total liabilities", money(r.totalLiabilities)], kind: "total" as const },
        { cells: [TYPE_LABEL.equity, ""], kind: "head" }, ...r.equity.map((x) => ({ cells: [`${x.number} ${x.name}`, money(x.amount)] })),
        { cells: [`Earnings before ${r.fyStart}`, money(r.priorEarnings)] }, { cells: [`Earnings since ${r.fyStart}`, money(r.currentEarnings)] },
        { cells: ["Total equity", money(r.totalEquity)], kind: "total" }, { cells: ["Total liabilities and equity", money(r.totalLiabilities + r.totalEquity)], kind: "grand" },
      ],
      ok: { good: r.balanced, text: r.balanced ? "Assets equal liabilities plus equity." : "Assets do not equal liabilities plus equity — tell the developer; this should not be possible." },
    };
  }
  if (id === "tb") {
    const r = await trialBalance(companyId, p.to);
    return {
      title: "Trial balance", subtitle: `${p.companyName} · as of ${p.to}`, columns: [{ label: "Account" }, { label: "Debit", num: true }, { label: "Credit", num: true }],
      rows: [...r.rows.map((x) => ({ cells: [`${x.number} ${x.name}`, x.debit ? fmtCents(x.debit) : "", x.credit ? fmtCents(x.credit) : ""] })), { cells: ["Total", fmtCents(r.debit), fmtCents(r.credit)], kind: "grand" as const }],
      ok: { good: r.debit === r.credit, text: r.debit === r.credit ? "Debits equal credits." : "Debits do not equal credits — tell the developer; this should not be possible." },
    };
  }
  if (id === "gl") {
    const accts = await listAccounts(companyId);
    const a = accts.find((x) => x.id === p.accountId);
    if (!a) return { title: "Account detail", subtitle: "Choose an account above.", columns: [], rows: [] };
    const r = await accountLedger(companyId, a, { from: p.from, to: p.to });
    return {
      title: `Account detail — ${a.number} ${a.name}`, subtitle: `${p.companyName} · ${p.from} through ${p.to}`,
      columns: [{ label: "Date" }, { label: "Entry" }, { label: "Description" }, { label: "Debit", num: true }, { label: "Credit", num: true }, { label: "Balance", num: true }],
      rows: [
        { cells: ["", "", "Balance brought forward", "", "", money(r.opening)], kind: "note" },
        ...r.lines.map((l) => ({ cells: [l.date, `#${l.entryId}`, [l.memo, l.payee, l.ref ? `#${l.ref}` : "", l.lineMemo].filter(Boolean).join(" · "), l.debit ? fmtCents(l.debit) : "", l.credit ? fmtCents(l.credit) : "", money(l.balance)] })),
        { cells: ["", "", "Ending balance", "", "", money(r.closing)], kind: "grand" },
      ],
    };
  }
  if (id === "trust") {
    const rows = (await clientTrustBalances(companyId, p.to)).filter((c) => c.balance !== 0 || c.active);
    const total = rows.reduce((s, c) => s + c.balance, 0);
    return {
      title: "Trust balances by client", subtitle: `${p.companyName} · as of ${p.to}`, columns: [{ label: "Client" }, { label: "Matter" }, { label: "Held in trust", num: true }],
      rows: [...rows.map((c) => ({ cells: [c.name, c.matter, money(c.balance)] })), { cells: ["Total held in trust", "", money(total)], kind: "grand" as const }],
    };
  }
  const entries = await listEntries(companyId, { from: p.from, to: p.to, limit: 5000 });
  return {
    title: "Journal", subtitle: `${p.companyName} · ${p.from} through ${p.to}`,
    columns: [{ label: "Date" }, { label: "Entry" }, { label: "Status" }, { label: "Source" }, { label: "Description" }, { label: "Account" }, { label: "Client / payee" }, { label: "Debit", num: true }, { label: "Credit", num: true }],
    rows: entries.slice().reverse().flatMap((e) => e.lines.map((l) => ({ cells: [e.date, `#${e.id}`, e.status, e.source, e.memo, `${l.number} ${l.name}`, [l.clientName, l.payee].filter(Boolean).join(" · "), l.debit ? fmtCents(l.debit) : "", l.credit ? fmtCents(l.credit) : ""] }))),
  };
}
