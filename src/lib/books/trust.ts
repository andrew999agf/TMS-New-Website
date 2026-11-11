import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { sbAccounts, sbClients } from "@/db/schema";
import { accountByKey, clientLowPoint, LedgerError, postEntry } from "./ledger";
import { isIsoDate } from "./money";

/**
 * Client trust money (IOLTA).
 *
 * Three movements, and only three:
 *   deposit       money received for a client goes into trust
 *   disbursement  money paid out of trust on that client's behalf
 *   fee_transfer  earned fees (or a repaid cost advance) move to operating,
 *                 against an invoice or statement the client was sent
 *
 * A client's ledger can never go below zero: a payment that would do so, on
 * its date or at any later point, is refused. One client's money is never
 * used for another.
 */
export const TRANSFER_PURPOSES = [
  { key: "fees", label: "Earned legal fees" },
  { key: "flat_fees", label: "Earned flat fee" },
  { key: "reimbursed_costs", label: "Client costs billed (reimbursed costs)" },
  { key: "client_advances", label: "Repay a cost the firm advanced" },
] as const;

async function trustAccounts(companyId: number) {
  const [bank, liability] = await Promise.all([accountByKey(companyId, "iolta_bank"), accountByKey(companyId, "trust_liability")]);
  if (!bank || !liability) throw new LedgerError("The IOLTA bank account or the client trust liability account is missing from the chart of accounts.");
  return { bank, liability };
}

async function requireClient(companyId: number, clientId: number) {
  const [c] = await db!.select().from(sbClients).where(and(eq(sbClients.companyId, companyId), eq(sbClients.id, clientId))).limit(1);
  if (!c) throw new LedgerError("Choose a client.");
  return c;
}

const checkAmount = (cents: number | null) => { if (cents === null || !Number.isSafeInteger(cents) || cents <= 0) throw new LedgerError("Enter an amount greater than zero."); return cents; };

export async function trustDeposit(companyId: number, input: { clientId: number; date: string; amount: number | null; payor: string; memo: string; ref?: string }, by: string) {
  if (!db) throw new LedgerError("Database not configured.");
  const amount = checkAmount(input.amount);
  if (!isIsoDate(input.date)) throw new LedgerError("Enter the date the money was deposited.");
  const c = await requireClient(companyId, input.clientId);
  if (!(input.payor ?? "").trim()) throw new LedgerError("Say who the money came from.");
  const { bank, liability } = await trustAccounts(companyId);
  return postEntry(companyId, {
    date: input.date, source: "trust", kind: "deposit", memo: `Trust deposit — ${c.name}${input.memo?.trim() ? `: ${input.memo.trim()}` : ""}`,
    lines: [{ accountId: bank.id, debit: amount, payee: input.payor, ref: input.ref ?? "", clientId: c.id }, { accountId: liability.id, credit: amount, clientId: c.id, payee: input.payor, ref: input.ref ?? "", memo: input.memo ?? "" }],
  }, by);
}

async function assertCovered(companyId: number, clientId: number, clientName: string, date: string, amount: number) {
  const low = await clientLowPoint(db!, companyId, clientId, { date, delta: -amount });
  if (low < 0) {
    const [{ bal }] = await db!.execute(sql`
      select coalesce(sum(l.credit - l.debit), 0)::text as bal from sb_lines l join sb_entries e on e.id = l.entry_id join sb_accounts a on a.id = l.account_id
      where l.company_id = ${companyId} and l.client_id = ${clientId} and e.status = 'posted' and a.is_trust and a.subtype = 'trust_liability' and e.entry_date <= ${date}`) as unknown as { bal: string }[];
    throw new LedgerError(`${clientName} has $${(Number(bal) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} in trust on ${date}. This would take the ledger below zero${Number(bal) >= amount ? " at a later date" : ""}, so it was not recorded.`);
  }
}

export async function trustDisbursement(companyId: number, input: { clientId: number; date: string; amount: number | null; payee: string; ref: string; memo: string }, by: string) {
  if (!db) throw new LedgerError("Database not configured.");
  const amount = checkAmount(input.amount);
  if (!isIsoDate(input.date)) throw new LedgerError("Enter the date of the payment.");
  const c = await requireClient(companyId, input.clientId);
  if (!(input.payee ?? "").trim()) throw new LedgerError("Say who was paid.");
  if (!(input.memo ?? "").trim()) throw new LedgerError("Say what the payment was for.");
  await assertCovered(companyId, c.id, c.name, input.date, amount);
  const { bank, liability } = await trustAccounts(companyId);
  return postEntry(companyId, {
    date: input.date, source: "trust", kind: "disbursement", memo: `Trust disbursement — ${c.name}: ${input.memo.trim()}`,
    lines: [{ accountId: liability.id, debit: amount, clientId: c.id, payee: input.payee, ref: input.ref ?? "", memo: input.memo }, { accountId: bank.id, credit: amount, payee: input.payee, ref: input.ref ?? "", clientId: c.id }],
  }, by);
}

/** Move earned fees (or a repaid cost advance) from trust to operating: one entry, both sides. */
export async function trustFeeTransfer(companyId: number, input: { clientId: number; date: string; amount: number | null; invoice: string; purpose: string; operatingAccountId?: number }, by: string) {
  if (!db) throw new LedgerError("Database not configured.");
  const amount = checkAmount(input.amount);
  if (!isIsoDate(input.date)) throw new LedgerError("Enter the date of the transfer.");
  const c = await requireClient(companyId, input.clientId);
  const invoice = (input.invoice ?? "").trim();
  if (!invoice) throw new LedgerError("Enter the invoice or statement number this transfer pays. Fees leave trust only against a bill the client was sent.");
  const purpose = TRANSFER_PURPOSES.find((p) => p.key === input.purpose);
  if (!purpose) throw new LedgerError("Choose what the transfer is for.");
  await assertCovered(companyId, c.id, c.name, input.date, amount);
  const { bank, liability } = await trustAccounts(companyId);
  const target = await accountByKey(companyId, purpose.key);
  let operating = await accountByKey(companyId, "operating_bank");
  if (input.operatingAccountId) {
    const [o] = await db.select().from(sbAccounts).where(and(eq(sbAccounts.companyId, companyId), eq(sbAccounts.id, input.operatingAccountId), eq(sbAccounts.subtype, "bank"), eq(sbAccounts.isTrust, false))).limit(1);
    if (o) operating = o;
  }
  if (!target || !operating) throw new LedgerError("The operating bank account or the income account is missing from the chart of accounts.");
  return postEntry(companyId, {
    date: input.date, source: "trust", kind: "fee_transfer", sourceRef: invoice.slice(0, 120), memo: `Trust to operating — ${c.name}: ${purpose.label.toLowerCase()}, invoice ${invoice}`,
    lines: [
      { accountId: liability.id, debit: amount, clientId: c.id, payee: "Transfer to operating", ref: invoice, memo: purpose.label },
      { accountId: bank.id, credit: amount, payee: "Transfer to operating", ref: invoice, clientId: c.id },
      { accountId: operating.id, debit: amount, payee: c.name, ref: invoice, memo: "From trust" },
      { accountId: target.id, credit: amount, clientId: c.id, ref: invoice, memo: `${c.name} — invoice ${invoice}` },
    ],
  }, by);
}

export type ClientLedgerLine = { entryId: number; date: string; kind: string; memo: string; payee: string; ref: string; in: number; out: number; balance: number; createdBy: string };

export async function clientLedger(companyId: number, clientId: number): Promise<ClientLedgerLine[]> {
  if (!db) return [];
  const rows = await db.execute(sql`
    select e.id as "entryId", e.entry_date::text as date, e.kind, l.memo, l.payee, l.ref, l.credit::text as "in", l.debit::text as "out", e.created_by as "createdBy"
    from sb_lines l join sb_entries e on e.id = l.entry_id join sb_accounts a on a.id = l.account_id
    where l.company_id = ${companyId} and l.client_id = ${clientId} and e.status = 'posted' and a.is_trust and a.subtype = 'trust_liability'
    order by e.entry_date, e.id, l.id`) as unknown as (Omit<ClientLedgerLine, "in" | "out" | "balance"> & { in: string; out: string })[];
  let bal = 0;
  return rows.map((r) => { const i = Number(r.in), o = Number(r.out); bal += i - o; return { ...r, entryId: Number(r.entryId), in: i, out: o, balance: bal }; });
}
