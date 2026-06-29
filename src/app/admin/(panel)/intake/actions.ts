"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { intakeSubmissions, referralAttorneys } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { getSetting } from "@/lib/content";
import { getBranch } from "@/lib/intake/config";
import { sendEmail } from "@/lib/email";
import { FIRM } from "@/lib/firm";

const STATUS_LABEL: Record<string, string> = {
  new: "New", contacted: "Contacted", scheduled: "Scheduled", declined: "Declined", "referred-out": "Referred out",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Setting key for who gets intake status-change notifications. Defaults to Max. */
const INTAKE_NOTIFY_KEY = "intake.statusNotify";

/**
 * Email a short notice whenever an intake's status/archive changes. Almost all
 * the information is in the subject line so the recipient needn't open it.
 * Best-effort: never blocks or fails the underlying update.
 */
async function notifyIntakeChange(id: number, change: string, actorEmail: string) {
  try {
    if (!db) return;
    const [sub] = await db
      .select({ name: intakeSubmissions.name, email: intakeSubmissions.email, branch: intakeSubmissions.branch })
      .from(intakeSubmissions)
      .where(eq(intakeSubmissions.id, id));
    if (!sub) return;

    const configured = await getSetting<string[]>(INTAKE_NOTIFY_KEY, [FIRM.email]);
    const recipients = (Array.isArray(configured) ? configured : []).map((s) => String(s).trim()).filter(Boolean);
    if (recipients.length === 0) return;

    const name = (sub.name || "Unnamed").trim();
    const matter = getBranch(sub.branch)?.label || sub.branch;
    const actor = actorEmail ? actorEmail.split("@")[0] : "";
    const subject = `Intake • ${name} (${matter}): ${change}${actor ? ` — by ${actor}` : ""}`;

    const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || `https://${FIRM.domain}`).replace(/\/$/, "");
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.5">
      <p style="margin:0 0 10px"><strong>${esc(name)}</strong>${sub.email ? ` &lt;${esc(sub.email)}&gt;` : ""} — ${esc(matter)}</p>
      <p style="margin:0 0 10px">${esc(change)}${actor ? ` — by ${esc(actor)}` : ""}</p>
      <p style="margin:0"><a href="${baseUrl}/admin/intake">Open the intake list</a></p>
    </div>`;

    await sendEmail({ to: recipients, subject, html, fromName: `${FIRM.name} — Intake` });
  } catch {
    /* notifications are best-effort */
  }
}

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
  // Remember the attorney name for next time.
  try {
    await db.insert(referralAttorneys).values({ name: referredTo }).onConflictDoNothing();
  } catch {
    /* non-fatal */
  }
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
