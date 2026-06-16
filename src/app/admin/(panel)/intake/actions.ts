"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { intakeSubmissions, referralAttorneys } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";

export async function updateIntakeStatus(
  id: number,
  status: "new" | "contacted" | "scheduled" | "declined" | "referred-out",
) {
  const session = await requireAdmin();
  if (!db) return { ok: false };
  // Moving away from referred-out clears the referral details.
  const extra = status === "referred-out" ? {} : { referredTo: null, feeExpected: false, feeAmount: null };
  await db.update(intakeSubmissions).set({ status, ...extra }).where(eq(intakeSubmissions.id, id));
  await audit(session.email, "update", "intake", String(id), `Status → ${status}`);
  revalidatePath("/admin/intake");
  return { ok: true };
}

/** Mark an inquiry referred out, with the receiving attorney and any expected
 *  fee. The attorney name is saved for future autocomplete. */
export async function setIntakeReferral(
  id: number,
  data: { referredTo: string; feeExpected: boolean; feeAmount?: string },
) {
  const session = await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  const referredTo = data.referredTo.trim();
  if (!referredTo) return { ok: false, error: "Enter the attorney's name." };
  await db
    .update(intakeSubmissions)
    .set({
      status: "referred-out",
      referredTo,
      feeExpected: data.feeExpected,
      feeAmount: data.feeExpected ? (data.feeAmount || "").trim() || null : null,
    })
    .where(eq(intakeSubmissions.id, id));
  // Remember the attorney name for next time.
  try {
    await db.insert(referralAttorneys).values({ name: referredTo }).onConflictDoNothing();
  } catch {
    /* non-fatal */
  }
  await audit(session.email, "update", "intake", String(id), `Referred out → ${referredTo}`);
  revalidatePath("/admin/intake");
  return { ok: true };
}

export async function setIntakeArchived(id: number, archived: boolean) {
  const session = await requireAdmin();
  if (!db) return { ok: false };
  await db.update(intakeSubmissions).set({ archived }).where(eq(intakeSubmissions.id, id));
  await audit(session.email, "update", "intake", String(id), archived ? "Archived" : "Restored");
  revalidatePath("/admin/intake");
  return { ok: true };
}
