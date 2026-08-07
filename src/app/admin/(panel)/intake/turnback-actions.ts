"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { intakeSubmissions, referralAttorneys } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { recipientsForBranch } from "@/lib/content";
import { getBranch, turnbackAreaForBranch } from "@/lib/intake/config";
import { FIRM } from "@/lib/firm";
import { buildTurnbackEmail, buildAttorneyReferralNotice, type TurnbackAttorney } from "@/lib/intake/turnback";

const lastNameOf = (name?: string | null) => (name ?? "").trim().split(/\s+/).filter(Boolean).pop() ?? "";

export type TurnbackExtras = {
  note?: string;
  customAttorneys?: TurnbackAttorney[];
  /** Corrected recipient address — people mistype their email on the form. */
  to?: string;
  /** Full CC list as edited in the dialog (replaces the branch default). */
  cc?: string[];
  /** Also write the corrected address back onto the lead record. */
  saveEmail?: boolean;
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// Local only — a "use server" module may export nothing but async functions.
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** Trim, drop invalid/blank entries, and de-duplicate case-insensitively. */
function cleanEmails(list?: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list ?? []) {
    const e = str(raw);
    if (!isEmail(e)) continue;
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out.slice(0, 25);
}
function cleanCustom(list?: TurnbackAttorney[]): TurnbackAttorney[] {
  return (list ?? [])
    .filter((a) => str(a?.name))
    .slice(0, 10)
    .map((a) => ({ name: str(a.name), firm: str(a.firm), address: str(a.address), phone: str(a.phone), email: str(a.email), website: str(a.website), practiceArea: str(a.practiceArea) }));
}

async function loadContext(intakeId: number, attorneyIds: number[], extras?: TurnbackExtras) {
  // Explicit columns so an un-synced new column can't break the turn-back flow.
  const [row] = await db!
    .select({ id: intakeSubmissions.id, name: intakeSubmissions.name, email: intakeSubmissions.email, branch: intakeSubmissions.branch })
    .from(intakeSubmissions)
    .where(eq(intakeSubmissions.id, intakeId));
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
  attorneys = [...attorneys, ...cleanCustom(extras?.customAttorneys)];
  return { row, attorneys, note: str(extras?.note) };
}

/** Render the turn-back email for the preview box (no send). */
export async function previewTurnback(intakeId: number, attorneyIds: number[], extras?: TurnbackExtras) {
  await requireAdmin();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const ctx = await loadContext(intakeId, attorneyIds, extras);
    if (!ctx) return { ok: false as const, error: "Submission not found." };
    const { subject, html } = await buildTurnbackEmail({ name: ctx.row.name, attorneys: ctx.attorneys, referralArea: turnbackAreaForBranch(ctx.row.branch), note: ctx.note });
    // Defaults the dialog seeds its editable To/CC fields from on first load.
    const cc = await recipientsForBranch(ctx.row.branch);
    return { ok: true as const, html, subject, to: ctx.row.email ?? "", cc };
  } catch (err) {
    console.error("[turnback] preview failed:", err);
    return { ok: false as const, error: "Couldn't build the preview." };
  }
}

/** Send the turn-back email to the prospect, CC the intake team, mark declined. */
export async function sendTurnback(intakeId: number, attorneyIds: number[], extras?: TurnbackExtras) {
  const session = await requireAdmin();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const ctx = await loadContext(intakeId, attorneyIds, extras);
    if (!ctx) return { ok: false as const, error: "Submission not found." };

    // The admin can correct a mistyped address in the dialog; fall back to the
    // address the prospect submitted.
    const stored = (ctx.row.email ?? "").trim();
    const to = str(extras?.to) || stored;
    if (!isEmail(to)) {
      return { ok: false as const, error: to ? `“${to}” isn't a valid email address.` : "This submission has no email address — enter one to send." };
    }
    // An edited CC list replaces the branch default; undefined means "unchanged".
    const cc = extras?.cc === undefined ? await recipientsForBranch(ctx.row.branch) : cleanEmails(extras.cc);

    const { subject, html } = await buildTurnbackEmail({ name: ctx.row.name, attorneys: ctx.attorneys, referralArea: turnbackAreaForBranch(ctx.row.branch), note: ctx.note });
    const res = await sendEmail({ to, cc, fromName: FIRM.name, subject, html });
    if (!res.sent) return { ok: false as const, error: "Email isn't configured yet, or sending failed." };

    // Write the corrected address back onto the lead so future emails use it.
    let emailFixed = false;
    if (extras?.saveEmail && to.toLowerCase() !== stored.toLowerCase()) {
      try {
        await db.update(intakeSubmissions).set({ email: to }).where(eq(intakeSubmissions.id, intakeId));
        emailFixed = true;
        await audit(session.email, "update", "intake", String(intakeId), `Corrected email from ${stored || "(blank)"} to ${to}`);
      } catch { /* the email went out; a failed correction shouldn't fail the send */ }
    }

    // Quietly let each referral attorney (with an email on file) know we sent
    // someone their way — practice area + last name only. Best-effort.
    const practiceArea = getBranch(ctx.row.branch)?.label || ctx.row.branch;
    const lastName = lastNameOf(ctx.row.name);
    let notified = 0;
    for (const a of ctx.attorneys) {
      const addr = (a.email ?? "").trim();
      if (!isEmail(addr)) continue;
      try {
        const note = await buildAttorneyReferralNotice({ attorneyName: a.name, practiceArea, lastName });
        const sent = await sendEmail({ to: addr, fromName: FIRM.name, subject: note.subject, html: note.html });
        if (sent.sent) notified++;
      } catch { /* best-effort */ }
    }

    // The status change is offered to the admin after sending (referred-out vs
    // declined), so this action no longer changes it automatically.
    await audit(session.email, "send", "intake-turnback", String(intakeId), `Turn-back email sent to ${to}${cc.length ? ` (cc ${cc.join(", ")})` : ""}${attorneyIds.length ? ` (${attorneyIds.length} referrals, ${notified} attorney notices)` : ""}`);
    revalidatePath("/admin/intake");
    // Echo back the selected attorney names so the dialog can offer to mark it referred out.
    return { ok: true as const, to, cc, emailFixed, attorneyNames: ctx.attorneys.map((a) => a.name) };
  } catch (err) {
    console.error("[turnback] send failed:", err);
    return { ok: false as const, error: "Couldn't send the email." };
  }
}

function FROM_NAME() {
  return "T. Maxwell Smith, PLLC";
}
