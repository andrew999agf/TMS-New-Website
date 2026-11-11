"use server";

import { revalidatePath } from "next/cache";
import { requireBooks, sbAudit_ } from "@/lib/books/auth";
import { canWrite, LedgerError, postEntry, voidEntry } from "@/lib/books/ledger";
import { fmtCents, toCents } from "@/lib/books/money";

type R = { ok: true; id?: number } | { ok: false; error: string };
const reval = () => { for (const p of ["/books", "/books/journal", "/books/accounts", "/books/reports", "/books/banking", "/books/trust", "/books/payroll"]) revalidatePath(p); };

/** A hand-written journal entry: opening balances, adjustments, depreciation, owner draws. */
export async function createManualEntry(input: { date: string; memo: string; lines: { accountId: number; debit: string; credit: string; memo: string }[] }): Promise<R> {
  const s = await requireBooks();
  if (!canWrite(s.role)) return { ok: false, error: "Your login can view the books but not change them." };
  const lines = [];
  for (const l of input.lines ?? []) {
    const d = l.debit?.trim() ? toCents(l.debit) : 0, c = l.credit?.trim() ? toCents(l.credit) : 0;
    if (d === null || c === null) return { ok: false, error: "One of the amounts isn't a number." };
    if (!d && !c) continue;
    if (!l.accountId) return { ok: false, error: "Pick an account for every line that has an amount." };
    lines.push({ accountId: Number(l.accountId), debit: d, credit: c, memo: l.memo ?? "" });
  }
  if (!(input.memo ?? "").trim()) return { ok: false, error: "Say what this entry is for." };
  try {
    const e = await postEntry(s.companyId, { date: input.date, memo: input.memo, source: "manual", lines }, s.email);
    await sbAudit_(s.companyId, s.email, "create", "entry", String(e.id), `Journal entry ${input.date}: ${input.memo.trim().slice(0, 120)} (${fmtCents(lines.reduce((t, l) => t + (l.debit ?? 0), 0), { dollar: true })})`);
    reval();
    return { ok: true, id: e.id };
  } catch (err) {
    if (err instanceof LedgerError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function voidEntryAction(input: { id: number; reason: string }): Promise<R> {
  const s = await requireBooks();
  if (!canWrite(s.role)) return { ok: false, error: "Your login can view the books but not change them." };
  try {
    await voidEntry(s.companyId, Number(input.id), input.reason, s.email);
    await sbAudit_(s.companyId, s.email, "void", "entry", String(input.id), `Voided entry #${input.id}: ${String(input.reason).trim().slice(0, 200)}`);
    reval();
    return { ok: true };
  } catch (err) {
    if (err instanceof LedgerError) return { ok: false, error: err.message };
    throw err;
  }
}
