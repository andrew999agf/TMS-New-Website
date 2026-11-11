import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { sbLines, sbReconciliations } from "@/db/schema";
import { accountLedger, balances, clientTrustBalances, LedgerError, natural, type Account } from "./ledger";
import { isIsoDate } from "./money";

/**
 * Reconciliation: tie the ledger to the statement, to the penny.
 *
 *   beginning balance (the last finished statement)
 * + everything checked off as cleared on this statement
 * = must equal the statement's ending balance.
 *
 * What is left unchecked is outstanding (checks not yet cashed, deposits not
 * yet credited). For the IOLTA account this is the three-way reconciliation:
 * the statement adjusted for outstanding items, the trust bank ledger, and
 * the total of the client ledgers must all be the same number.
 */
export type RecLine = { lineId: number; entryId: number; date: string; description: string; amount: number; cleared: boolean; fromBank: boolean };
export type RecView = {
  id: number; accountId: number; statementDate: string; statementBalance: number; status: string; beginning: number;
  lines: RecLine[]; bookBalance: number; trust: null | { clientTotal: number; negatives: { name: string; balance: number }[] };
};

export async function listReconciliations(companyId: number, accountId: number) {
  if (!db) return [];
  return db.select().from(sbReconciliations).where(and(eq(sbReconciliations.companyId, companyId), eq(sbReconciliations.accountId, accountId))).orderBy(desc(sbReconciliations.statementDate), desc(sbReconciliations.id));
}

export async function startReconciliation(companyId: number, account: Account, statementDate: string, statementBalance: number, by: string): Promise<number> {
  if (!db) throw new LedgerError("Database not configured.");
  if (!isIsoDate(statementDate)) throw new LedgerError("Enter the statement's ending date.");
  if (!Number.isSafeInteger(statementBalance)) throw new LedgerError("Enter the statement's ending balance.");
  const all = await listReconciliations(companyId, account.id);
  if (all.some((r) => r.status === "open")) throw new LedgerError("Finish the reconciliation that is already open for this account first.");
  const lastFinal = all.find((r) => r.status === "final");
  if (lastFinal && statementDate <= lastFinal.statementDate) throw new LedgerError(`The last finished statement ended ${lastFinal.statementDate}. This one must end after that.`);
  const [row] = await db.insert(sbReconciliations).values({ companyId, accountId: account.id, statementDate, statementBalance, createdBy: by }).returning({ id: sbReconciliations.id });
  // Lines that came from the bank's own file have, by definition, cleared the bank.
  await db.execute(sql`update sb_lines l set reconcile_id = ${row.id} from sb_entries e
    where e.id = l.entry_id and l.company_id = ${companyId} and l.account_id = ${account.id} and l.reconcile_id is null and e.status = 'posted' and e.entry_date <= ${statementDate}
      and exists (select 1 from sb_bank_txns b where b.line_id = l.id and b.txn_date <= ${statementDate})`);
  return row.id;
}

export async function reconciliationView(companyId: number, account: Account, recId: number): Promise<RecView | null> {
  if (!db) return null;
  const [rec] = await db.select().from(sbReconciliations).where(and(eq(sbReconciliations.companyId, companyId), eq(sbReconciliations.id, recId), eq(sbReconciliations.accountId, account.id))).limit(1);
  if (!rec) return null;
  const [prior] = await db.select().from(sbReconciliations).where(and(eq(sbReconciliations.companyId, companyId), eq(sbReconciliations.accountId, account.id), eq(sbReconciliations.status, "final"), sql`${sbReconciliations.statementDate} < ${rec.statementDate}`)).orderBy(desc(sbReconciliations.statementDate)).limit(1);
  const led = await accountLedger(companyId, account, { to: rec.statementDate });
  const sign = account.type === "asset" || account.type === "expense" ? 1 : -1;
  const lines: RecLine[] = led.lines.filter((l) => l.reconcileId === null || l.reconcileId === rec.id).map((l) => ({
    lineId: l.lineId, entryId: l.entryId, date: l.date, description: [l.memo, l.payee, l.ref ? `#${l.ref}` : ""].filter(Boolean).join(" · "), amount: sign * (l.debit - l.credit), cleared: l.reconcileId === rec.id, fromBank: l.bankLinked,
  }));
  let trust: RecView["trust"] = null;
  if (account.isTrust) {
    const clients = await clientTrustBalances(companyId, rec.statementDate);
    trust = { clientTotal: clients.reduce((s, c) => s + c.balance, 0), negatives: clients.filter((c) => c.balance < 0).map((c) => ({ name: c.name, balance: c.balance })) };
  }
  return { id: rec.id, accountId: account.id, statementDate: rec.statementDate, statementBalance: rec.statementBalance, status: rec.status, beginning: prior?.statementBalance ?? 0, lines, bookBalance: led.closing, trust };
}

/** Replace the set of lines checked off on an open reconciliation. */
export async function saveCleared(companyId: number, account: Account, recId: number, lineIds: number[]): Promise<void> {
  if (!db) throw new LedgerError("Database not configured.");
  const view = await reconciliationView(companyId, account, recId);
  if (!view) throw new LedgerError("That reconciliation no longer exists.");
  if (view.status !== "open") throw new LedgerError("That reconciliation is finished. Reopen it to change it.");
  const allowed = new Set(view.lines.map((l) => l.lineId));
  const want = [...new Set(lineIds.map(Number))].filter((id) => allowed.has(id));
  await db.transaction(async (tx) => {
    await tx.update(sbLines).set({ reconcileId: null }).where(and(eq(sbLines.companyId, companyId), eq(sbLines.reconcileId, recId)));
    if (want.length) await tx.update(sbLines).set({ reconcileId: recId }).where(and(eq(sbLines.companyId, companyId), inArray(sbLines.id, want)));
  });
}

export const recMath = (v: RecView) => {
  const cleared = v.lines.filter((l) => l.cleared), open = v.lines.filter((l) => !l.cleared);
  const clearedBalance = v.beginning + cleared.reduce((s, l) => s + l.amount, 0);
  const outstanding = open.reduce((s, l) => s + l.amount, 0);
  return { clearedBalance, difference: v.statementBalance - clearedBalance, outstanding, adjustedBank: v.statementBalance + outstanding, openCount: open.length, clearedCount: cleared.length };
};

export async function finalizeReconciliation(companyId: number, account: Account, recId: number, by: string): Promise<void> {
  if (!db) throw new LedgerError("Database not configured.");
  const v = await reconciliationView(companyId, account, recId);
  if (!v) throw new LedgerError("That reconciliation no longer exists.");
  if (v.status !== "open") throw new LedgerError("That reconciliation is already finished.");
  const m = recMath(v);
  if (m.difference !== 0) throw new LedgerError(`It is still off by ${(Math.abs(m.difference) / 100).toFixed(2)}. It can only be finished at zero.`);
  if (v.trust) {
    if (v.trust.negatives.length) throw new LedgerError(`${v.trust.negatives[0].name}'s trust ledger is below zero. Correct that before finishing.`);
    if (m.adjustedBank !== v.bookBalance || v.bookBalance !== v.trust.clientTotal) throw new LedgerError("The three numbers don't agree: the adjusted bank balance, the trust bank ledger and the total of the client ledgers must be equal.");
  }
  const snapshot = {
    beginning: v.beginning, statementBalance: v.statementBalance, clearedCount: m.clearedCount, outstanding: v.lines.filter((l) => !l.cleared).map((l) => ({ date: l.date, description: l.description, amount: l.amount })),
    outstandingTotal: m.outstanding, adjustedBank: m.adjustedBank, bookBalance: v.bookBalance, ...(v.trust ? { clientTotal: v.trust.clientTotal, clients: (await clientTrustBalances(companyId, v.statementDate)).filter((c) => c.balance !== 0).map((c) => ({ name: c.name, matter: c.matter, balance: c.balance })) } : {}),
  };
  await db.update(sbReconciliations).set({ status: "final", snapshot, finalizedBy: by, finalizedAt: new Date() }).where(eq(sbReconciliations.id, recId));
}

/** Only the most recent finished reconciliation can be reopened, so earlier ones stay as they were signed off. */
export async function reopenReconciliation(companyId: number, account: Account, recId: number): Promise<void> {
  if (!db) throw new LedgerError("Database not configured.");
  const all = await listReconciliations(companyId, account.id);
  if (all.some((r) => r.status === "open")) throw new LedgerError("Another reconciliation is open for this account. Finish or discard it first.");
  const latest = all.find((r) => r.status === "final");
  if (!latest || latest.id !== recId) throw new LedgerError("Only the most recent finished reconciliation can be reopened.");
  await db.update(sbReconciliations).set({ status: "open", finalizedBy: null, finalizedAt: null }).where(eq(sbReconciliations.id, recId));
}

/** Throw away an open reconciliation (nothing in the ledger changes; the check marks are cleared). */
export async function discardReconciliation(companyId: number, account: Account, recId: number): Promise<void> {
  if (!db) throw new LedgerError("Database not configured.");
  const [rec] = await db.select().from(sbReconciliations).where(and(eq(sbReconciliations.companyId, companyId), eq(sbReconciliations.id, recId), eq(sbReconciliations.accountId, account.id))).limit(1);
  if (!rec) return;
  if (rec.status !== "open") throw new LedgerError("A finished reconciliation is kept. Reopen it if it needs to change.");
  await db.transaction(async (tx) => {
    await tx.update(sbLines).set({ reconcileId: null }).where(and(eq(sbLines.companyId, companyId), eq(sbLines.reconcileId, recId)));
    await tx.delete(sbReconciliations).where(eq(sbReconciliations.id, recId));
  });
}

/** The balance the books show for an account today. */
export async function bookBalance(companyId: number, account: Account, asOf?: string): Promise<number> {
  return natural(account, (await balances(companyId, asOf ? { to: asOf } : {})).get(account.id));
}
