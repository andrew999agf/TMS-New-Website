"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { intakeSubmissions, referralAttorneys } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { recipientsForBranch } from "@/lib/content";
import { FIRM } from "@/lib/firm";
import { buildTurnbackEmail, type TurnbackAttorney } from "@/lib/intake/turnback";

async function loadContext(intakeId: number, attorneyIds: number[]) {
  const [row] = await db!.select().from(intakeSubmissions).where(eq(intakeSubmissions.id, intakeId));
  if (!row) return null;
  let attorneys: TurnbackAttorney[] = [];
  if (attorneyIds.length) {
    const rows = await db!.select().from(referralAttorneys).where(inArray(referralAttorneys.id, attorneyIds));
    // Preserve the order the admin selected them in.
    const byId = new Map(rows.map((r) => [r.id, r]));
    attorneys = attorneyIds.map((id) => byId.get(id)).filter(Boolean).map((a) => ({
      name: a!.name, firm: a!.firm, address: a!.address, phone: a!.phone, email: a!.email, website: a!.website, practiceArea: a!.practiceArea,
    }));
  }
  return { row, attorneys };
}

/** Render the turn-back email for the preview box (no send). */
export async function previewTurnback(intakeId: number, attorneyIds: number[]) {
  await requireAdmin();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const ctx = await loadContext(intakeId, attorneyIds);
    if (!ctx) return { ok: false as const, error: "Submission not found." };
    const { subject, html } = await buildTurnbackEmail({ name: ctx.row.name, attorneys: ctx.attorneys });
    const cc = await recipientsForBranch(ctx.row.branch);
    return { ok: true as const, html, subject, to: ctx.row.email ?? "", cc };
  } catch (err) {
    console.error("[turnback] preview failed:", err);
    return { ok: false as const, error: "Couldn't build the preview." };
  }
}

/** Send the turn-back email to the prospect, CC the intake team, mark declined. */
export async function sendTurnback(intakeId: number, attorneyIds: number[]) {
  const session = await requireAdmin();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const ctx = await loadContext(intakeId, attorneyIds);
    if (!ctx) return { ok: false as const, error: "Submission not found." };
    const to = (ctx.row.email ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false as const, error: "This submission has no valid email address." };
    const { subject, html } = await buildTurnbackEmail({ name: ctx.row.name, attorneys: ctx.attorneys });
    const cc = await recipientsForBranch(ctx.row.branch);
    const res = await sendEmail({ to, cc, fromName: FIRM.name, subject, html });
    if (!res.sent) return { ok: false as const, error: "Email isn't configured yet, or sending failed." };
    // The status change is offered to the admin after sending (referred-out vs
    // declined), so this action no longer changes it automatically.
    await audit(session.email, "send", "intake-turnback", String(intakeId), `Turn-back email sent to ${to}${attorneyIds.length ? ` (${attorneyIds.length} referrals)` : ""}`);
    revalidatePath("/admin/intake");
    // Echo back the selected attorney names so the dialog can offer to mark it referred out.
    return { ok: true as const, to, attorneyNames: ctx.attorneys.map((a) => a.name) };
  } catch (err) {
    console.error("[turnback] send failed:", err);
    return { ok: false as const, error: "Couldn't send the email." };
  }
}

function FROM_NAME() {
  return "T. Maxwell Smith, PLLC";
}
