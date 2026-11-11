"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sbAccounts } from "@/db/schema";
import { requireBooks, sbAudit_ } from "@/lib/books/auth";
import { balances, canWrite } from "@/lib/books/ledger";
import { ACCOUNT_TYPES } from "@/lib/books/money";

type R = { ok: true } | { ok: false; error: string };
const KINDS: Record<string, { type: string; subtype: string }> = {
  bank: { type: "asset", subtype: "bank" }, asset: { type: "asset", subtype: "current_asset" }, fixed_asset: { type: "asset", subtype: "fixed_asset" },
  credit_card: { type: "liability", subtype: "credit_card" }, liability: { type: "liability", subtype: "current_liability" },
  equity: { type: "equity", subtype: "equity" }, income: { type: "income", subtype: "income" }, expense: { type: "expense", subtype: "expense" },
};

export async function addAccount(input: { number: string; name: string; kind: string }): Promise<R> {
  const s = await requireBooks();
  if (!canWrite(s.role)) return { ok: false, error: "Your login can view the books but not change them." };
  if (!db) return { ok: false, error: "Database not configured." };
  const number = String(input.number ?? "").trim(), name = String(input.name ?? "").replace(/\s+/g, " ").trim().slice(0, 191);
  const kind = KINDS[input.kind];
  if (!kind || !(ACCOUNT_TYPES as readonly string[]).includes(kind.type)) return { ok: false, error: "Pick what kind of account this is." };
  if (!/^\d{3,8}$/.test(number)) return { ok: false, error: "The account number is 3 to 8 digits." };
  if (!name) return { ok: false, error: "Give the account a name." };
  const [dup] = await db.select({ id: sbAccounts.id }).from(sbAccounts).where(and(eq(sbAccounts.companyId, s.companyId), eq(sbAccounts.number, number))).limit(1);
  if (dup) return { ok: false, error: `Account ${number} already exists.` };
  const [row] = await db.insert(sbAccounts).values({ companyId: s.companyId, number, name, type: kind.type, subtype: kind.subtype }).returning({ id: sbAccounts.id });
  await sbAudit_(s.companyId, s.email, "create", "account", String(row.id), `Added account ${number} ${name}`);
  revalidatePath("/books/accounts");
  return { ok: true };
}

export async function renameAccount(input: { id: number; name: string }): Promise<R> {
  const s = await requireBooks();
  if (!canWrite(s.role)) return { ok: false, error: "Your login can view the books but not change them." };
  if (!db) return { ok: false, error: "Database not configured." };
  const name = String(input.name ?? "").replace(/\s+/g, " ").trim().slice(0, 191);
  if (!name) return { ok: false, error: "Give the account a name." };
  const [a] = await db.select().from(sbAccounts).where(and(eq(sbAccounts.companyId, s.companyId), eq(sbAccounts.id, input.id))).limit(1);
  if (!a) return { ok: false, error: "That account no longer exists." };
  await db.update(sbAccounts).set({ name }).where(eq(sbAccounts.id, a.id));
  await sbAudit_(s.companyId, s.email, "update", "account", String(a.id), `Renamed ${a.number} "${a.name}" to "${name}"`);
  revalidatePath("/books/accounts");
  return { ok: true };
}

/** Accounts are never deleted (their history would go with them); an unused one can be made inactive. */
export async function setAccountActive(input: { id: number; active: boolean }): Promise<R> {
  const s = await requireBooks();
  if (!canWrite(s.role)) return { ok: false, error: "Your login can view the books but not change them." };
  if (!db) return { ok: false, error: "Database not configured." };
  const [a] = await db.select().from(sbAccounts).where(and(eq(sbAccounts.companyId, s.companyId), eq(sbAccounts.id, input.id))).limit(1);
  if (!a) return { ok: false, error: "That account no longer exists." };
  if (!input.active) {
    if (a.systemKey) return { ok: false, error: "The books rely on this account, so it stays active. You can rename it." };
    const b = (await balances(s.companyId)).get(a.id);
    if (b && b.debit !== b.credit) return { ok: false, error: "This account still has a balance. Move the balance out with a journal entry first." };
  }
  await db.update(sbAccounts).set({ active: input.active }).where(eq(sbAccounts.id, a.id));
  await sbAudit_(s.companyId, s.email, "update", "account", String(a.id), `${input.active ? "Reactivated" : "Made inactive"} ${a.number} ${a.name}`);
  revalidatePath("/books/accounts");
  return { ok: true };
}
