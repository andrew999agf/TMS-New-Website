import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { sbAccounts, sbBankTxns, sbClients, sbEntries, sbLines, sbReconciliations } from "@/db/schema";
import { isDebitNormal, isIsoDate } from "./money";

/**
 * The general ledger. Double entry, whole cents.
 *
 * Rules this file enforces for every screen that posts:
 *  - an entry balances (debits = credits) or it is not saved;
 *  - trust accounts (the IOLTA bank account and the client trust liability)
 *    are only touched by entries from the Trust screen, and every trust
 *    liability line names the client it belongs to;
 *  - nothing is edited or deleted. A wrong entry is voided with a reason and
 *    stays on the record; a line cleared on a finished reconciliation cannot
 *    be voided until that reconciliation is reopened.
 */
export class LedgerError extends Error {}

export type Account = typeof sbAccounts.$inferSelect;
export type LineInput = { accountId: number; debit?: number; credit?: number; memo?: string; clientId?: number | null; payee?: string; ref?: string };
export type EntryInput = { date: string; memo: string; source: "manual" | "bank" | "trust" | "payroll"; sourceRef?: string; kind?: string; lines: LineInput[] };

type Tx = Parameters<Parameters<NonNullable<typeof db>["transaction"]>[0]>[0];
type Runner = NonNullable<typeof db> | Tx;

export const canWrite = (role: string) => role === "owner" || role === "bookkeeper";

export async function listAccounts(companyId: number): Promise<Account[]> {
  if (!db) return [];
  return db.select().from(sbAccounts).where(eq(sbAccounts.companyId, companyId)).orderBy(asc(sbAccounts.number));
}

export async function accountByKey(companyId: number, key: string): Promise<Account | null> {
  if (!db) return null;
  const [a] = await db.select().from(sbAccounts).where(and(eq(sbAccounts.companyId, companyId), eq(sbAccounts.systemKey, key))).limit(1);
  return a ?? null;
}

/** Post one balanced entry. Returns its id and the ids of its lines, in order. */
export async function postEntry(companyId: number, input: EntryInput, by: string, runner?: Runner): Promise<{ id: number; lineIds: number[] }> {
  if (!db) throw new LedgerError("Database not configured.");
  if (!isIsoDate(input.date)) throw new LedgerError("Enter a valid date.");
  const lines = input.lines.filter((l) => (l.debit ?? 0) !== 0 || (l.credit ?? 0) !== 0);
  if (lines.length < 2) throw new LedgerError("An entry needs at least two lines.");
  let debits = 0, credits = 0;
  for (const l of lines) {
    const d = Math.round(l.debit ?? 0), c = Math.round(l.credit ?? 0);
    if (!Number.isSafeInteger(d) || !Number.isSafeInteger(c) || d < 0 || c < 0) throw new LedgerError("Amounts must be positive numbers.");
    if (d > 0 && c > 0) throw new LedgerError("A line is either a debit or a credit, not both.");
    debits += d; credits += c;
  }
  if (debits !== credits) throw new LedgerError(`The entry doesn't balance: debits ${(debits / 100).toFixed(2)}, credits ${(credits / 100).toFixed(2)}.`);
  if (debits === 0) throw new LedgerError("The entry has no amount.");

  const run = runner ?? db;
  const ids = [...new Set(lines.map((l) => l.accountId))];
  const accts = await run.select().from(sbAccounts).where(and(eq(sbAccounts.companyId, companyId), inArray(sbAccounts.id, ids)));
  if (accts.length !== ids.length) throw new LedgerError("Pick an account for every line.");
  const byId = new Map(accts.map((a) => [a.id, a]));
  for (const l of lines) {
    const a = byId.get(l.accountId)!;
    if (!a.active) throw new LedgerError(`${a.number} ${a.name} is inactive.`);
    if (a.isTrust && input.source !== "trust") throw new LedgerError("Trust accounts are only changed from the Trust screen, so client money never mixes with the firm's.");
    if (a.isTrust && a.subtype === "trust_liability" && !l.clientId) throw new LedgerError("Every trust entry names the client it belongs to.");
  }
  const clientIds = [...new Set(lines.map((l) => l.clientId).filter((x): x is number => !!x))];
  if (clientIds.length) {
    const found = await run.select({ id: sbClients.id }).from(sbClients).where(and(eq(sbClients.companyId, companyId), inArray(sbClients.id, clientIds)));
    if (found.length !== clientIds.length) throw new LedgerError("Unknown client.");
  }

  const write = async (tx: Runner) => {
    const [entry] = await tx.insert(sbEntries).values({
      companyId, entryDate: input.date, memo: (input.memo ?? "").trim().slice(0, 2000), source: input.source,
      sourceRef: (input.sourceRef ?? "").slice(0, 128), kind: (input.kind ?? "").slice(0, 24), createdBy: by,
    }).returning({ id: sbEntries.id });
    const rows = await tx.insert(sbLines).values(lines.map((l) => ({
      entryId: entry.id, companyId, accountId: l.accountId, debit: Math.round(l.debit ?? 0), credit: Math.round(l.credit ?? 0),
      memo: (l.memo ?? "").trim().slice(0, 255), clientId: l.clientId ?? null, payee: (l.payee ?? "").trim().slice(0, 191), ref: (l.ref ?? "").trim().slice(0, 64),
    }))).returning({ id: sbLines.id });
    return { id: entry.id, lineIds: rows.map((r) => r.id) };
  };
  return runner ? write(runner) : db.transaction((tx) => write(tx));
}

/** Void an entry: it stays on the record, marked void, and stops counting. */
export async function voidEntry(companyId: number, entryId: number, reason: string, by: string): Promise<void> {
  if (!db) throw new LedgerError("Database not configured.");
  const why = (reason ?? "").trim();
  if (why.length < 3) throw new LedgerError("Say why this entry is being voided.");
  await db.transaction(async (tx) => {
    const [e] = await tx.select().from(sbEntries).where(and(eq(sbEntries.companyId, companyId), eq(sbEntries.id, entryId))).limit(1);
    if (!e) throw new LedgerError("That entry no longer exists.");
    if (e.status === "void") throw new LedgerError("That entry is already void.");
    const lines = await tx.select({ id: sbLines.id, reconcileId: sbLines.reconcileId }).from(sbLines).where(eq(sbLines.entryId, entryId));
    const recIds = [...new Set(lines.map((l) => l.reconcileId).filter((x): x is number => !!x))];
    if (recIds.length) {
      const finals = await tx.select({ id: sbReconciliations.id, statementDate: sbReconciliations.statementDate }).from(sbReconciliations).where(and(inArray(sbReconciliations.id, recIds), eq(sbReconciliations.status, "final")));
      if (finals.length) throw new LedgerError(`This entry was cleared on the reconciliation for ${finals[0].statementDate}. Reopen that reconciliation first.`);
      await tx.update(sbLines).set({ reconcileId: null }).where(eq(sbLines.entryId, entryId));
    }
    await tx.update(sbEntries).set({ status: "void", voidedBy: by, voidedAt: new Date(), voidReason: why.slice(0, 1000) }).where(eq(sbEntries.id, entryId));
    // Voiding a trust deposit must not leave a client's ledger below zero at any point.
    if (e.source === "trust") {
      const clients = await tx.selectDistinct({ clientId: sbLines.clientId }).from(sbLines).where(eq(sbLines.entryId, entryId));
      for (const c of clients) if (c.clientId) {
        const low = await clientLowPoint(tx, companyId, c.clientId);
        if (low < 0) throw new LedgerError("Voiding this would put the client's trust ledger below zero. Void the later disbursements first.");
      }
    }
    // Bank rows that were categorized or matched to it go back to "to review".
    await tx.update(sbBankTxns).set({ status: "new", entryId: null, lineId: null }).where(and(eq(sbBankTxns.companyId, companyId), eq(sbBankTxns.entryId, entryId)));
  });
}

/** The lowest a client's trust balance ever gets, walking the ledger in date order (optionally with one more movement added). */
export async function clientLowPoint(runner: Runner, companyId: number, clientId: number, extra?: { date: string; delta: number }): Promise<number> {
  const rows = await runner.execute(sql`
    select e.entry_date::text as date, (l.credit - l.debit)::text as delta
    from sb_lines l join sb_entries e on e.id = l.entry_id join sb_accounts a on a.id = l.account_id
    where l.company_id = ${companyId} and l.client_id = ${clientId} and e.status = 'posted' and a.is_trust and a.subtype = 'trust_liability'
    order by e.entry_date, e.id, l.id`) as unknown as { date: string; delta: string }[];
  const moves = rows.map((r) => ({ date: r.date, delta: Number(r.delta), added: false }));
  if (extra) moves.push({ ...extra, added: true });
  // Same day: money in counts before money out, the way a bank would honor it.
  moves.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.delta - a.delta));
  let bal = 0, low = 0;
  for (const m of moves) { bal += m.delta; if (bal < low) low = bal; }
  return low;
}

export type Balance = { accountId: number; debit: number; credit: number };

/** Debit and credit totals per account for posted entries in a date range (inclusive). */
export async function balances(companyId: number, range: { from?: string; to?: string } = {}): Promise<Map<number, Balance>> {
  const out = new Map<number, Balance>();
  if (!db) return out;
  const rows = await db.execute(sql`
    select l.account_id as "accountId", coalesce(sum(l.debit), 0)::text as debit, coalesce(sum(l.credit), 0)::text as credit
    from sb_lines l join sb_entries e on e.id = l.entry_id
    where l.company_id = ${companyId} and e.status = 'posted'
      ${range.from ? sql`and e.entry_date >= ${range.from}` : sql``} ${range.to ? sql`and e.entry_date <= ${range.to}` : sql``}
    group by l.account_id`);
  for (const r of rows as unknown as { accountId: number; debit: string; credit: string }[]) out.set(Number(r.accountId), { accountId: Number(r.accountId), debit: Number(r.debit), credit: Number(r.credit) });
  return out;
}

/** An account's balance on its normal side (assets/expenses: debit − credit). */
export const natural = (a: { type: string }, b: Balance | undefined) => (b ? (isDebitNormal(a.type) ? b.debit - b.credit : b.credit - b.debit) : 0);

export type ReportRow = { id: number; number: string; name: string; type: string; isTrust: boolean; amount: number };

/** The day before a YYYY-MM-DD date. */
export function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** First day of the fiscal year that contains `iso`. */
export function fiscalYearStart(iso: string, startMonth: number): string {
  const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7));
  const sm = Math.min(12, Math.max(1, startMonth || 1));
  return `${m >= sm ? y : y - 1}-${String(sm).padStart(2, "0")}-01`;
}

export async function trialBalance(companyId: number, asOf: string) {
  const [accts, bal] = await Promise.all([listAccounts(companyId), balances(companyId, { to: asOf })]);
  const rows = accts.map((a) => { const b = bal.get(a.id); const net = (b?.debit ?? 0) - (b?.credit ?? 0); return { id: a.id, number: a.number, name: a.name, type: a.type, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 }; }).filter((r) => r.debit || r.credit);
  return { rows, debit: rows.reduce((s, r) => s + r.debit, 0), credit: rows.reduce((s, r) => s + r.credit, 0) };
}

export async function profitAndLoss(companyId: number, from: string, to: string) {
  const [accts, bal] = await Promise.all([listAccounts(companyId), balances(companyId, { from, to })]);
  const rows = (t: string): ReportRow[] => accts.filter((a) => a.type === t).map((a) => ({ id: a.id, number: a.number, name: a.name, type: a.type, isTrust: a.isTrust, amount: natural(a, bal.get(a.id)) })).filter((r) => r.amount !== 0);
  const income = rows("income"), expense = rows("expense");
  const totalIncome = income.reduce((s, r) => s + r.amount, 0), totalExpense = expense.reduce((s, r) => s + r.amount, 0);
  return { income, expense, totalIncome, totalExpense, net: totalIncome - totalExpense };
}

export async function balanceSheet(companyId: number, asOf: string, fiscalStartMonth: number) {
  const fyStart = fiscalYearStart(asOf, fiscalStartMonth);
  const [accts, bal, prior] = await Promise.all([listAccounts(companyId), balances(companyId, { to: asOf }), balances(companyId, { to: dayBefore(fyStart) })]);
  const rows = (t: string): ReportRow[] => accts.filter((a) => a.type === t).map((a) => ({ id: a.id, number: a.number, name: a.name, type: a.type, isTrust: a.isTrust, amount: natural(a, bal.get(a.id)) })).filter((r) => r.amount !== 0);
  const earnings = (m: Map<number, Balance>) => accts.reduce((s, a) => s + (a.type === "income" ? natural(a, m.get(a.id)) : a.type === "expense" ? -natural(a, m.get(a.id)) : 0), 0);
  const assets = rows("asset"), liabilities = rows("liability"), equity = rows("equity");
  const allEarnings = earnings(bal), priorEarnings = earnings(prior);
  const sum = (r: ReportRow[]) => r.reduce((s, x) => s + x.amount, 0);
  const totalEquity = sum(equity) + allEarnings;
  return { fyStart, assets, liabilities, equity, priorEarnings, currentEarnings: allEarnings - priorEarnings, totalAssets: sum(assets), totalLiabilities: sum(liabilities), totalEquity, balanced: sum(assets) === sum(liabilities) + totalEquity };
}

export type LedgerLine = { lineId: number; entryId: number; date: string; memo: string; lineMemo: string; source: string; payee: string; ref: string; clientId: number | null; debit: number; credit: number; reconcileId: number | null; bankLinked: boolean };

/** Every posted line on one account in a date range, oldest first, with the balance brought forward. */
export async function accountLedger(companyId: number, account: Account, range: { from?: string; to?: string } = {}): Promise<{ opening: number; lines: (LedgerLine & { balance: number })[]; closing: number }> {
  if (!db) return { opening: 0, lines: [], closing: 0 };
  const opening = range.from ? natural(account, (await balances(companyId, { to: dayBefore(range.from) })).get(account.id)) : 0;
  const rows = await db.execute(sql`
    select l.id as "lineId", e.id as "entryId", e.entry_date::text as date, e.memo, l.memo as "lineMemo", e.source, l.payee, l.ref, l.client_id as "clientId",
           l.debit::text as debit, l.credit::text as credit, l.reconcile_id as "reconcileId",
           exists(select 1 from sb_bank_txns b where b.line_id = l.id) as "bankLinked"
    from sb_lines l join sb_entries e on e.id = l.entry_id
    where l.company_id = ${companyId} and l.account_id = ${account.id} and e.status = 'posted'
      ${range.from ? sql`and e.entry_date >= ${range.from}` : sql``} ${range.to ? sql`and e.entry_date <= ${range.to}` : sql``}
    order by e.entry_date, e.id, l.id`);
  let bal = opening;
  const lines = (rows as unknown as (Omit<LedgerLine, "debit" | "credit"> & { debit: string; credit: string })[]).map((r) => {
    const debit = Number(r.debit), credit = Number(r.credit);
    bal += isDebitNormal(account.type) ? debit - credit : credit - debit;
    return { ...r, lineId: Number(r.lineId), entryId: Number(r.entryId), debit, credit, clientId: r.clientId == null ? null : Number(r.clientId), reconcileId: r.reconcileId == null ? null : Number(r.reconcileId), bankLinked: !!r.bankLinked, balance: bal };
  });
  return { opening, lines, closing: bal };
}

/** What the firm holds in trust for each client (credit − debit on the trust liability). */
export async function clientTrustBalances(companyId: number, asOf?: string): Promise<{ clientId: number; name: string; matter: string; reference: string; active: boolean; balance: number }[]> {
  if (!db) return [];
  const rows = await db.execute(sql`
    select c.id as "clientId", c.name, c.matter, c.reference, c.active,
      coalesce((select sum(l.credit - l.debit) from sb_lines l join sb_entries e on e.id = l.entry_id join sb_accounts a on a.id = l.account_id
                where l.company_id = ${companyId} and l.client_id = c.id and e.status = 'posted' and a.is_trust and a.subtype = 'trust_liability'
                ${asOf ? sql`and e.entry_date <= ${asOf}` : sql``}), 0)::text as balance
    from sb_clients c where c.company_id = ${companyId} order by lower(c.name), c.id`);
  return (rows as unknown as { clientId: number; name: string; matter: string; reference: string; active: boolean; balance: string }[]).map((r) => ({ ...r, clientId: Number(r.clientId), balance: Number(r.balance) }));
}

export type EntryView = { id: number; date: string; memo: string; source: string; kind: string; sourceRef: string; status: string; createdBy: string; voidReason: string; voidedBy: string | null; lines: { accountId: number; number: string; name: string; debit: number; credit: number; memo: string; clientName: string; payee: string; ref: string }[] };

/** Entries, newest first, with their lines — for the Journal screen and exports. */
export async function listEntries(companyId: number, opts: { from?: string; to?: string; limit?: number; includeVoid?: boolean; ids?: number[] } = {}): Promise<EntryView[]> {
  if (!db) return [];
  if (opts.ids && opts.ids.length === 0) return [];
  const head = await db.execute(sql`
    select id, entry_date::text as date, memo, source, kind, source_ref as "sourceRef", status, created_by as "createdBy", void_reason as "voidReason", voided_by as "voidedBy"
    from sb_entries where company_id = ${companyId}
      ${opts.includeVoid === false ? sql`and status = 'posted'` : sql``}
      ${opts.from ? sql`and entry_date >= ${opts.from}` : sql``} ${opts.to ? sql`and entry_date <= ${opts.to}` : sql``}
      ${opts.ids ? sql`and id in ${opts.ids}` : sql``}
    order by entry_date desc, id desc limit ${Math.min(5000, opts.limit ?? 200)}`) as unknown as Omit<EntryView, "lines">[];
  if (head.length === 0) return [];
  const ids = head.map((h) => Number(h.id));
  const lines = await db.execute(sql`
    select l.entry_id as "entryId", l.account_id as "accountId", a.number, a.name, l.debit::text as debit, l.credit::text as credit, l.memo, coalesce(c.name, '') as "clientName", l.payee, l.ref
    from sb_lines l join sb_accounts a on a.id = l.account_id left join sb_clients c on c.id = l.client_id
    where l.entry_id in ${ids} order by l.id`) as unknown as { entryId: number; accountId: number; number: string; name: string; debit: string; credit: string; memo: string; clientName: string; payee: string; ref: string }[];
  const by = new Map<number, EntryView["lines"]>();
  for (const l of lines) (by.get(Number(l.entryId)) ?? by.set(Number(l.entryId), []).get(Number(l.entryId))!).push({ accountId: Number(l.accountId), number: l.number, name: l.name, debit: Number(l.debit), credit: Number(l.credit), memo: l.memo, clientName: l.clientName, payee: l.payee, ref: l.ref });
  return head.map((h) => ({ ...h, id: Number(h.id), lines: by.get(Number(h.id)) ?? [] }));
}

/** Minimal CSV: quotes every field, doubles embedded quotes, BOM for Excel. */
export function toCsv(rows: (string | number)[][]): string {
  return "﻿" + rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n") + "\r\n";
}
