import "server-only";
import { accountLedger, balanceSheet, clientTrustBalances, listAccounts, listEntries, profitAndLoss, trialBalance } from "./ledger";
import { fmtCents, TYPE_LABEL } from "./money";

/** One report as a table: used by the Reports screen and by the spreadsheet export, so the two always agree. */
export type ReportTable = { title: string; subtitle: string; columns: { label: string; num?: boolean }[]; rows: { cells: (string | number)[]; kind?: "head" | "total" | "grand" | "note" }[]; ok?: { good: boolean; text: string } };
export const REPORTS = [
  ["pl", "Profit and loss"], ["bs", "Balance sheet"], ["tb", "Trial balance"], ["gl", "Account detail"], ["trust", "Trust balances by client"], ["journal", "Journal (all entries)"],
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
