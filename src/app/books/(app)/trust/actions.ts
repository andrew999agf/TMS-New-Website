"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sbClients } from "@/db/schema";
import { requireBooks, sbAudit_ } from "@/lib/books/auth";
import { canWrite, clientTrustBalances, LedgerError } from "@/lib/books/ledger";
import { recordFromStatement, trustDeposit, trustDisbursement, trustFeeTransfer } from "@/lib/books/trust";
import { accountByKey } from "@/lib/books/ledger";
import { importRows } from "@/lib/books/banking";
import { readBankCsv } from "@/lib/books/bank-csv";
import { fmtCents, toCents } from "@/lib/books/money";

type R = { ok: true; id?: number } | { ok: false; error: string };
const reval = () => { for (const p of ["/books", "/books/trust", "/books/banking", "/books/journal", "/books/accounts", "/books/reports"]) revalidatePath(p); };
const wrap = async (fn: () => Promise<R>): Promise<R> => { try { return await fn(); } catch (e) { if (e instanceof LedgerError) return { ok: false, error: e.message }; throw e; } };
async function writer() {
  const s = await requireBooks();
  if (!canWrite(s.role)) throw new LedgerError("Your login can view the books but not change them.");
  if (!db) throw new LedgerError("Database not configured.");
  return s;
}
const t = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export async function addClient(input: { name: string; matter: string; reference: string }): Promise<R> {
  return wrap(async () => {
    const s = await writer();
    const name = t(input.name, 191);
    if (!name) return { ok: false, error: "Enter the client's name." };
    const [row] = await db!.insert(sbClients).values({ companyId: s.companyId, name, matter: t(input.matter, 255), reference: t(input.reference, 64) }).returning({ id: sbClients.id });
    await sbAudit_(s.companyId, s.email, "create", "client", String(row.id), `Added client ${name}`);
    reval();
    return { ok: true, id: row.id };
  });
}

export async function setClientActive(input: { id: number; active: boolean }): Promise<R> {
  return wrap(async () => {
    const s = await writer();
    const [c] = await db!.select().from(sbClients).where(and(eq(sbClients.companyId, s.companyId), eq(sbClients.id, Number(input.id)))).limit(1);
    if (!c) return { ok: false, error: "That client no longer exists." };
    if (!input.active) {
      const bal = (await clientTrustBalances(s.companyId)).find((x) => x.clientId === c.id)?.balance ?? 0;
      if (bal !== 0) return { ok: false, error: `${c.name} still has ${fmtCents(bal, { dollar: true })} in trust. Disburse it before closing the ledger.` };
    }
    await db!.update(sbClients).set({ active: !!input.active }).where(eq(sbClients.id, c.id));
    await sbAudit_(s.companyId, s.email, "update", "client", String(c.id), `${input.active ? "Reopened" : "Closed"} the ledger for ${c.name}`);
    reval();
    return { ok: true };
  });
}

export async function recordDeposit(input: { clientId: number; date: string; amount: string; payor: string; memo: string; ref: string }): Promise<R> {
  return wrap(async () => {
    const s = await writer();
    const e = await trustDeposit(s.companyId, { clientId: Number(input.clientId), date: input.date, amount: toCents(input.amount), payor: t(input.payor, 191), memo: t(input.memo, 255), ref: t(input.ref, 64) }, s.email);
    await sbAudit_(s.companyId, s.email, "create", "trust", String(e.id), `Trust deposit ${fmtCents(toCents(input.amount) ?? 0, { dollar: true })} for client #${input.clientId} from ${t(input.payor, 80)}`);
    reval();
    return { ok: true, id: e.id };
  });
}

export async function recordDisbursement(input: { clientId: number; date: string; amount: string; payee: string; ref: string; memo: string }): Promise<R> {
  return wrap(async () => {
    const s = await writer();
    const e = await trustDisbursement(s.companyId, { clientId: Number(input.clientId), date: input.date, amount: toCents(input.amount), payee: t(input.payee, 191), ref: t(input.ref, 64), memo: t(input.memo, 255) }, s.email);
    await sbAudit_(s.companyId, s.email, "create", "trust", String(e.id), `Trust disbursement ${fmtCents(toCents(input.amount) ?? 0, { dollar: true })} for client #${input.clientId} to ${t(input.payee, 80)}`);
    reval();
    return { ok: true, id: e.id };
  });
}

export async function recordFeeTransfer(input: { clientId: number; date: string; amount: string; invoice: string; purpose: string }): Promise<R> {
  return wrap(async () => {
    const s = await writer();
    const e = await trustFeeTransfer(s.companyId, { clientId: Number(input.clientId), date: input.date, amount: toCents(input.amount), invoice: t(input.invoice, 120), purpose: String(input.purpose) }, s.email);
    await sbAudit_(s.companyId, s.email, "create", "trust", String(e.id), `Trust to operating ${fmtCents(toCents(input.amount) ?? 0, { dollar: true })} for client #${input.clientId}, invoice ${t(input.invoice, 60)}`);
    reval();
    return { ok: true, id: e.id };
  });
}

/** Bring the IOLTA account's statement file in. Rows wait under Trust → Bank statement; nothing is recorded until each is assigned to a client. */
export async function importTrustStatement(input: { filename: string; text: string; flip: boolean }): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const s = await writer();
    const bank = await accountByKey(s.companyId, "iolta_bank");
    if (!bank) return { ok: false, error: "The IOLTA bank account is missing from the chart of accounts." };
    if (typeof input.text !== "string" || input.text.length > 1_500_000) return { ok: false, error: "That file is too large. Export a shorter date range and import it in pieces." };
    const parsed = readBankCsv(input.text, { flip: !!input.flip });
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const r = await importRows(s.companyId, bank, String(input.filename ?? "statement.csv"), parsed.rows, s.email);
    await sbAudit_(s.companyId, s.email, "import", "trust", String(bank.id), `Imported IOLTA statement ${input.filename}: ${r.added} new, ${r.duplicates} already on file`);
    reval();
    return { ok: true, message: `${r.added} new transaction${r.added === 1 ? "" : "s"} added${r.duplicates ? `; ${r.duplicates} were already on file and skipped` : ""}${parsed.skipped ? `; ${parsed.skipped} line${parsed.skipped === 1 ? "" : "s"} without a date or amount ignored` : ""}. Read from columns: ${parsed.columns.date}, ${parsed.columns.description}, ${parsed.columns.amount}.` };
  } catch (e) { if (e instanceof LedgerError) return { ok: false, error: e.message }; throw e; }
}

export async function recordStatementRow(input: { txnId: number; clientId: number; kind: string; who: string; ref: string; memo: string; invoice: string; purpose: string }): Promise<R> {
  return wrap(async () => {
    const s = await writer();
    if (!input.clientId) return { ok: false, error: "Choose the client this money belongs to." };
    const e = await recordFromStatement(s.companyId, Number(input.txnId), { clientId: Number(input.clientId), kind: String(input.kind), who: t(input.who, 191), ref: t(input.ref, 64), memo: t(input.memo, 255), invoice: t(input.invoice, 120), purpose: String(input.purpose) }, s.email);
    await sbAudit_(s.companyId, s.email, "create", "trust", String(e.entryId), `Recorded an IOLTA statement row as a ${String(input.kind)} for client #${input.clientId} (entry #${e.entryId})`);
    reval();
    return { ok: true, id: e.entryId };
  });
}
