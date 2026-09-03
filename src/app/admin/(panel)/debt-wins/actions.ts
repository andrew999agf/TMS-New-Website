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
const OUTCOMES = new Set(["nonsuit", "judgment", "dismissed-wop", "judgment-plaintiff", "other"]);

/** Refresh the admin tally and the public counter on the debt-defense page. */
const reval = () => {
  revalidatePath("/admin/debt-wins");
  revalidatePath("/practice-areas/consumer-debt-defense");
};

export async function addDebtWin(input: { amount: number; outcome: string; wonAt: string; court: string; caseNumber: string; plaintiff: string; note: string }) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const outcome = OUTCOMES.has(input.outcome) ? input.outcome : "nonsuit";
  // A plaintiff judgment carries no amount — it never joins any calculation.
  const amount = outcome === "judgment-plaintiff" ? 0 : Math.round((Number(input.amount) || 0) * 100) / 100;
  if (outcome !== "judgment-plaintiff" && !(amount > 0)) return { ok: false as const, error: "Enter the amount the creditor sued for." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.wonAt)) return { ok: false as const, error: "Pick the date the case was won." };
  try {
    const [row] = await db
      .insert(debtDefenseWins)
      .values({
        amount, outcome, wonAt: input.wonAt,
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

export async function updateDebtWin(id: number, input: { amount: number; outcome: string; wonAt: string; court: string; caseNumber: string; plaintiff: string; note: string }) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const outcome = OUTCOMES.has(input.outcome) ? input.outcome : "nonsuit";
  const amount = outcome === "judgment-plaintiff" ? 0 : Math.round((Number(input.amount) || 0) * 100) / 100;
  if (outcome !== "judgment-plaintiff" && !(amount > 0)) return { ok: false as const, error: "Enter the amount the creditor sued for." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.wonAt)) return { ok: false as const, error: "Pick the date the case was won." };
  await db
    .update(debtDefenseWins)
    .set({
      amount, outcome, wonAt: input.wonAt,
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
  await db.delete(debtDefenseWins).where(eq(debtDefenseWins.id, id));
  await audit(session.email, "delete", "debt-win", String(id), "Removed win entry");
  reval();
  return { ok: true as const };
}
