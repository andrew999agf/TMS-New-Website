"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { debtDefenseWins, settings } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { DEBT_WINS_PUBLIC_KEY } from "@/lib/debt-wins";

async function guard() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/debt-wins", session.role, session.permissions)) throw new Error("Not allowed");
  return session;
}

/** "judgment-plaintiff" is a logged LOSS — kept for the record, never counted
 *  in the public scoreboard totals. */
const OUTCOMES = new Set(["nonsuit", "judgment", "dismissed-wp", "dismissed-wop", "dismissed-smj", "settled", "judgment-plaintiff", "other"]);

/** Validate/clean amounts per outcome: a plaintiff judgment carries none, a
 *  settlement carries claimed + paid (only the difference is claimable), and
 *  everything else carries the claimed amount alone. */
function cleanAmounts(outcome: string, amountIn: number, paidIn: number): { amount: number; settledPaid: number; error?: string } {
  if (outcome === "judgment-plaintiff") return { amount: 0, settledPaid: 0 };
  const amount = Math.round((Number(amountIn) || 0) * 100) / 100;
  if (!(amount > 0)) return { amount: 0, settledPaid: 0, error: "Enter the amount the creditor sued for." };
  if (outcome !== "settled") return { amount, settledPaid: 0 };
  const settledPaid = Math.round((Number(paidIn) || 0) * 100) / 100;
  if (settledPaid < 0) return { amount, settledPaid: 0, error: "The settlement amount can't be negative." };
  if (settledPaid > amount) return { amount, settledPaid, error: "The amount paid can't exceed the amount claimed." };
  return { amount, settledPaid };
}

/** Refresh the admin tally and the public counter on the debt-defense page. */
const reval = () => {
  revalidatePath("/admin/debt-wins");
  revalidatePath("/practice-areas/consumer-debt-defense");
};

/** A confidential settlement may only be touched by the owner or whoever
 *  logged it — mirrors the server-side redaction on the page. */
async function confidentialGuard(id: number, session: { role?: string; email: string }): Promise<string | null> {
  const [row] = await db!.select({ confidential: debtDefenseWins.confidential, createdBy: debtDefenseWins.createdBy }).from(debtDefenseWins).where(eq(debtDefenseWins.id, id));
  if (!row) return "Entry not found.";
  if (row.confidential && session.role !== "owner" && row.createdBy !== session.email) return "This confidential settlement can only be changed by the owner or the person who logged it.";
  return null;
}

export async function addDebtWin(input: { amount: number; settledPaid?: number; outcome: string; confidential?: boolean; wonAt: string; court: string; caseNumber: string; plaintiff: string; note: string }) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const outcome = OUTCOMES.has(input.outcome) ? input.outcome : "nonsuit";
  const { amount, settledPaid, error } = cleanAmounts(outcome, input.amount, input.settledPaid ?? 0);
  if (error) return { ok: false as const, error };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.wonAt)) return { ok: false as const, error: "Pick the date the case was won." };
  try {
    const [row] = await db
      .insert(debtDefenseWins)
      .values({
        amount, settledPaid, outcome, confidential: outcome === "settled" && Boolean(input.confidential), wonAt: input.wonAt,
        court: input.court.trim().slice(0, 191),
        caseNumber: input.caseNumber.trim().slice(0, 128),
        plaintiff: input.plaintiff.trim().slice(0, 191),
        note: input.note.trim(),
        createdBy: session.email,
      })
      .returning({ id: debtDefenseWins.id });
    await audit(session.email, "create", "debt-win", String(row.id), `$${amount} ${outcome}`);
    reval();
    return { ok: true as const };
  } catch (err) {
    const msg = (err as Error).message;
    return { ok: false as const, error: /does not exist/i.test(msg) ? "Run Settings → Database updates once, then try again." : msg };
  }
}

export async function setDebtWinsPublic(on: boolean) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  await db
    .insert(settings)
    .values({ key: DEBT_WINS_PUBLIC_KEY, value: on, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value: on, updatedAt: new Date() } });
  await audit(session.email, "update", "debt-win", DEBT_WINS_PUBLIC_KEY, on ? "Counter shown on site" : "Counter hidden");
  reval();
  return { ok: true as const };
}

export async function updateDebtWin(id: number, input: { amount: number; settledPaid?: number; outcome: string; confidential?: boolean; wonAt: string; court: string; caseNumber: string; plaintiff: string; note: string }) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const outcome = OUTCOMES.has(input.outcome) ? input.outcome : "nonsuit";
  const { amount, settledPaid, error } = cleanAmounts(outcome, input.amount, input.settledPaid ?? 0);
  if (error) return { ok: false as const, error };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.wonAt)) return { ok: false as const, error: "Pick the date the case was won." };
  const denied = await confidentialGuard(id, session);
  if (denied) return { ok: false as const, error: denied };
  await db
    .update(debtDefenseWins)
    .set({
      amount, settledPaid, outcome, confidential: outcome === "settled" && Boolean(input.confidential), wonAt: input.wonAt,
      court: input.court.trim().slice(0, 191),
      caseNumber: input.caseNumber.trim().slice(0, 128),
      plaintiff: input.plaintiff.trim().slice(0, 191),
      note: input.note.trim(),
    })
    .where(eq(debtDefenseWins.id, id));
  await audit(session.email, "update", "debt-win", String(id), `$${amount} ${outcome}`);
  reval();
  return { ok: true as const };
}

export async function deleteDebtWin(id: number) {
  const session = await guard();
  if (!db) return { ok: false as const };
  const denied = await confidentialGuard(id, session);
  if (denied) return { ok: false as const };
  await db.delete(debtDefenseWins).where(eq(debtDefenseWins.id, id));
  await audit(session.email, "delete", "debt-win", String(id), "Removed win entry");
  reval();
  return { ok: true as const };
}
