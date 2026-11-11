"use server";

import { revalidatePath } from "next/cache";
import { requireBooks, sbAudit_ } from "@/lib/books/auth";
import { canWrite, LedgerError } from "@/lib/books/ledger";
import { postPayroll } from "@/lib/books/payroll";

export async function postPayrollAction(input: { externalId: string }): Promise<{ ok: true; entryId: number } | { ok: false; error: string }> {
  const s = await requireBooks();
  if (!canWrite(s.role)) return { ok: false, error: "Your login can view the books but not change them." };
  try {
    const r = await postPayroll(s.companyId, String(input.externalId), s.email);
    await sbAudit_(s.companyId, s.email, "create", "payroll", String(r.entryId), `Posted a Gusto payroll as entry #${r.entryId}`);
    for (const p of ["/books", "/books/payroll", "/books/banking", "/books/journal", "/books/accounts", "/books/reports"]) revalidatePath(p);
    return { ok: true, entryId: r.entryId };
  } catch (e) {
    if (e instanceof LedgerError) return { ok: false, error: e.message };
    throw e;
  }
}
