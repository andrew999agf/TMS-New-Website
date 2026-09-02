"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { intakeSubmissions } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";

const STATUS_LABEL: Record<string, string> = {
  new: "New", contacted: "Contacted", scheduled: "Scheduled", declined: "Declined", "referred-out": "Referred out", "client-declined": "Client declined",
  "letter-sent": "Engagement letter sent", converted: "Converted",
};

/**
 * Email a short notice whenever an intake's status/archive changes. Almost all
 * the information is in the subject line so the recipient needn't open it.
 * Best-effort: never blocks or fails the underlying update.
 */
async function notifyIntakeChange(id: number, change: string, actorEmail: string) {
  // Queue the change on the submission — the batched digest cron
  // (/api/cron/intake-digest) collects them and sends ONE email, so archiving
  // eight at once doesn't produce eight emails. Best-effort.
  try {
    if (!db) return;
    await db.update(intakeSubmissions).set({ notifyChange: change.slice(0, 191), notifyChangeAt: new Date(), notifyChangeBy: actorEmail }).where(eq(intakeSubmissions.id, id));
  } catch {
    /* notifications are best-effort */
  }
}

export async function updateIntakeStatus(
  id: number,
  status: "new" | "contacted" | "scheduled" | "declined" | "referred-out" | "client-declined" | "letter-sent" | "converted",
) {
  const session = await requireAdmin();
  if (!db) return { ok: false };
  // Moving away from referred-out clears the referral details.
  const extra = status === "referred-out" ? {} : { referredTo: null, feeExpected: false, feeAmount: null };
  await db.update(intakeSubmissions).set({ status, ...extra }).where(eq(intakeSubmissions.id, id));
  await audit(session.email, "update", "intake", String(id), `Status → ${status}`);
  await notifyIntakeChange(id, `Status → ${STATUS_LABEL[status] ?? status}`, session.email);
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
  // NOTE: we deliberately do NOT add `referredTo` to the referral-attorney list.
  // Referring out to several attorneys stored a combined "Joe, Bob, Tim" string,
  // which then showed up as a bogus extra attorney with no contact info. The
  // attorney list is managed on its own; referring out only records the name(s)
  // on the lead (which powers the outbound-referrals report).
  await audit(session.email, "update", "intake", String(id), `Referred out → ${referredTo}`);
  const feeNote = data.feeExpected ? ` (fee ${(data.feeAmount || "").trim() || "expected"})` : " (no fee)";
  await notifyIntakeChange(id, `Referred out → ${referredTo}${feeNote}`, session.email);
  revalidatePath("/admin/intake");
  return { ok: true };
}

export async function setIntakeArchived(id: number, archived: boolean) {
  const session = await requireAdmin();
  if (!db) return { ok: false };
  await db.update(intakeSubmissions).set({ archived }).where(eq(intakeSubmissions.id, id));
  await audit(session.email, "update", "intake", String(id), archived ? "Archived" : "Restored");
  await notifyIntakeChange(id, archived ? "Archived" : "Restored", session.email);
  revalidatePath("/admin/intake");
  return { ok: true };
}
