"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sbAccounts } from "@/db/schema";
import { requireBooks, sbAudit_ } from "@/lib/books/auth";
import { canWrite, LedgerError } from "@/lib/books/ledger";
import { BANK_SUBTYPES, categorize, categorizeMany, deleteRule, importRows, matchTxn, postSuggested, setExcluded, undoTxn } from "@/lib/books/banking";
import { readBankCsv } from "@/lib/books/bank-csv";

type R = { ok: true; message?: string } | { ok: false; error: string };
const reval = () => { for (const p of ["/books", "/books/banking", "/books/journal", "/books/accounts", "/books/reports"]) revalidatePath(p); };
const wrap = async (fn: () => Promise<R>): Promise<R> => { try { return await fn(); } catch (e) { if (e instanceof LedgerError) return { ok: false, error: e.message }; throw e; } };
async function writer() {
  const s = await requireBooks();
  if (!canWrite(s.role)) throw new LedgerError("Your login can view the books but not change them.");
  return s;
}

/** Read a statement file the user chose and add its rows to an account's "to review" list. */
export async function importStatement(input: { accountId: number; filename: string; text: string; flip: boolean }): Promise<R> {
  return wrap(async () => {
    const s = await writer();
    if (!db) return { ok: false, error: "Database not configured." };
    const [a] = await db.select().from(sbAccounts).where(and(eq(sbAccounts.companyId, s.companyId), eq(sbAccounts.id, Number(input.accountId)))).limit(1);
    if (!a || !BANK_SUBTYPES.includes(a.subtype) || a.isTrust) return { ok: false, error: "Choose the operating account or a credit card. The IOLTA account is kept under Trust." };
    if (typeof input.text !== "string" || input.text.length > 1_500_000) return { ok: false, error: "That file is too large. Export a shorter date range and import it in pieces." };
    const parsed = readBankCsv(input.text, { flip: !!input.flip });
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const r = await importRows(s.companyId, a, String(input.filename ?? "statement.csv"), parsed.rows, s.email);
    await sbAudit_(s.companyId, s.email, "import", "bank", String(a.id), `Imported ${input.filename}: ${r.added} new, ${r.duplicates} already on file (${a.number} ${a.name})`);
    reval();
    return { ok: true, message: `${r.added} new transaction${r.added === 1 ? "" : "s"} added${r.duplicates ? `; ${r.duplicates} were already on file and skipped` : ""}${parsed.skipped ? `; ${parsed.skipped} line${parsed.skipped === 1 ? "" : "s"} without a date or amount ignored` : ""}. Read from columns: ${parsed.columns.date}, ${parsed.columns.description}, ${parsed.columns.amount}.` };
  });
}

export async function categorizeRow(input: { txnId: number; categoryId: number; memo?: string; clientId?: number | null; applyToSame?: boolean; remember?: string }): Promise<R> {
  return wrap(async () => {
    const s = await writer();
    if (!input.categoryId) return { ok: false, error: "Choose an account for this row." };
    const r = await categorize(s.companyId, Number(input.txnId), { categoryId: Number(input.categoryId), memo: input.memo, clientId: input.clientId ? Number(input.clientId) : null, applyToSame: !!input.applyToSame, remember: typeof input.remember === "string" ? input.remember : undefined }, s.email);
    await sbAudit_(s.companyId, s.email, "create", "bank", String(input.txnId), `Categorized ${r.posted} statement row${r.posted === 1 ? "" : "s"}`);
    reval();
    return { ok: true, message: r.posted > 1 ? `Posted ${r.posted} rows.` : undefined };
  });
}

export async function matchRow(input: { txnId: number; lineId: number }): Promise<R> {
  return wrap(async () => { const s = await writer(); await matchTxn(s.companyId, Number(input.txnId), Number(input.lineId)); await sbAudit_(s.companyId, s.email, "update", "bank", String(input.txnId), "Matched a statement row to an existing entry"); reval(); return { ok: true }; });
}

export async function excludeRow(input: { txnId: number; excluded: boolean }): Promise<R> {
  return wrap(async () => { const s = await writer(); await setExcluded(s.companyId, Number(input.txnId), !!input.excluded); await sbAudit_(s.companyId, s.email, "update", "bank", String(input.txnId), input.excluded ? "Set a statement row aside" : "Returned a statement row to review"); reval(); return { ok: true }; });
}

export async function undoRow(input: { txnId: number }): Promise<R> {
  return wrap(async () => { const s = await writer(); await undoTxn(s.companyId, Number(input.txnId), s.email); await sbAudit_(s.companyId, s.email, "update", "bank", String(input.txnId), "Sent a posted statement row back to review"); reval(); return { ok: true }; });
}

const tally = (r: { posted: number; skipped: number; firstError: string }): R => r.posted === 0 && r.skipped > 0 ? { ok: false, error: r.firstError || "Nothing could be posted." }
  : { ok: true, message: `Posted ${r.posted} row${r.posted === 1 ? "" : "s"}.${r.skipped ? ` ${r.skipped} could not be posted: ${r.firstError}` : ""}` };

/** Post the checked rows to one account. */
export async function categorizeSelected(input: { txnIds: number[]; categoryId: number }): Promise<R> {
  return wrap(async () => {
    const s = await writer();
    if (!input.categoryId) return { ok: false, error: "Choose an account for the selected rows." };
    if (!Array.isArray(input.txnIds) || input.txnIds.length === 0) return { ok: false, error: "Check the rows to post first." };
    const r = await categorizeMany(s.companyId, input.txnIds, Number(input.categoryId), s.email);
    await sbAudit_(s.companyId, s.email, "create", "bank", "", `Categorized ${r.posted} statement rows at once`);
    reval();
    return tally(r);
  });
}

/** Post every waiting row in the account that already has a suggested account. */
export async function postAllSuggested(input: { accountId: number }): Promise<R> {
  return wrap(async () => {
    const s = await writer();
    const r = await postSuggested(s.companyId, Number(input.accountId), s.email);
    await sbAudit_(s.companyId, s.email, "create", "bank", String(input.accountId), `Posted ${r.posted} suggested statement rows`);
    reval();
    return tally(r);
  });
}

export async function forgetRule(input: { id: number }): Promise<R> {
  return wrap(async () => { const s = await writer(); await deleteRule(s.companyId, Number(input.id)); await sbAudit_(s.companyId, s.email, "delete", "bank", String(input.id), "Removed a remembered banking rule"); reval(); return { ok: true }; });
}
