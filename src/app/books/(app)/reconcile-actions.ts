"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sbAccounts } from "@/db/schema";
import { requireBooks, sbAudit_ } from "@/lib/books/auth";
import { canWrite, LedgerError } from "@/lib/books/ledger";
import { discardReconciliation, finalizeReconciliation, reopenReconciliation, saveCleared, startReconciliation } from "@/lib/books/reconcile";
import { fmtCents, toCents } from "@/lib/books/money";

type R = { ok: true; id?: number } | { ok: false; error: string };
const reval = () => { for (const p of ["/books", "/books/banking", "/books/trust", "/books/reports"]) revalidatePath(p); };

async function ctx(accountId: number) {
  const s = await requireBooks();
  if (!canWrite(s.role)) throw new LedgerError("Your login can view the books but not change them.");
  if (!db) throw new LedgerError("Database not configured.");
  const [a] = await db.select().from(sbAccounts).where(and(eq(sbAccounts.companyId, s.companyId), eq(sbAccounts.id, Number(accountId)))).limit(1);
  if (!a || !["bank", "credit_card", "trust_bank"].includes(a.subtype)) throw new LedgerError("That isn't a bank or card account.");
  return { s, a };
}
const wrap = async (fn: () => Promise<R>): Promise<R> => { try { return await fn(); } catch (e) { if (e instanceof LedgerError) return { ok: false, error: e.message }; throw e; } };

export async function startRec(input: { accountId: number; statementDate: string; statementBalance: string }): Promise<R> {
  return wrap(async () => {
    const { s, a } = await ctx(input.accountId);
    const bal = toCents(input.statementBalance);
    if (bal === null) return { ok: false, error: "Enter the statement's ending balance." };
    const id = await startReconciliation(s.companyId, a, input.statementDate, bal, s.email);
    await sbAudit_(s.companyId, s.email, "create", "reconciliation", String(id), `Started reconciling ${a.number} ${a.name} to the statement ending ${input.statementDate} (${fmtCents(bal, { dollar: true })})`);
    reval();
    return { ok: true, id };
  });
}

export async function saveRec(input: { accountId: number; recId: number; lineIds: number[]; finish?: boolean }): Promise<R> {
  return wrap(async () => {
    const { s, a } = await ctx(input.accountId);
    await saveCleared(s.companyId, a, Number(input.recId), input.lineIds ?? []);
    if (input.finish) {
      await finalizeReconciliation(s.companyId, a, Number(input.recId), s.email);
      await sbAudit_(s.companyId, s.email, "finalize", "reconciliation", String(input.recId), `Finished the reconciliation of ${a.number} ${a.name}`);
    }
    reval();
    return { ok: true };
  });
}

export async function reopenRec(input: { accountId: number; recId: number }): Promise<R> {
  return wrap(async () => {
    const { s, a } = await ctx(input.accountId);
    if (s.role !== "owner") return { ok: false, error: "Only an owner can reopen a finished reconciliation." };
    await reopenReconciliation(s.companyId, a, Number(input.recId));
    await sbAudit_(s.companyId, s.email, "reopen", "reconciliation", String(input.recId), `Reopened a finished reconciliation of ${a.number} ${a.name}`);
    reval();
    return { ok: true };
  });
}

export async function discardRec(input: { accountId: number; recId: number }): Promise<R> {
  return wrap(async () => {
    const { s, a } = await ctx(input.accountId);
    await discardReconciliation(s.companyId, a, Number(input.recId));
    await sbAudit_(s.companyId, s.email, "delete", "reconciliation", String(input.recId), `Discarded an unfinished reconciliation of ${a.number} ${a.name}`);
    reval();
    return { ok: true };
  });
}
