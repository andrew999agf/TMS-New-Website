"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { engagementLetters, intakeSubmissions, type EngagementFees } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { centralTime, type EngagementOffice, type EngagementSide } from "@/lib/engagement/config";
import { randomBytes } from "crypto";
import { ensureDiscoveryTables } from "@/db/ensure";
import { buildEngagementLetter, buildEngagementLetterPreview, letterFileName, type LetterData, type LetterPreviewPara } from "@/lib/engagement/letter";
import { buildEngagementEmail, DEFAULT_PAYMENT_LINK, type EngagementEmailTemplate } from "@/lib/engagement/email";
import { sendEmail, emailConfigured } from "@/lib/email";
import { FIRM } from "@/lib/firm";

export type EngagementInput = {
  id?: number;
  intakeId: number | null;
  clientName: string;
  businessName: string;
  officerTitle: string;
  andIndividually: boolean;
  email: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  office: EngagementOffice;
  side: EngagementSide;
  generalDescription: string;
  caseNumber: string;
  caseStyling: string;
  phase1Custom: string;
  phase2Custom: string;
  phase1: boolean;
  phase2: boolean;
  fees: EngagementFees;
  /** Wall-clock Central time, from the dialog's date + time inputs. */
  openUntilDate: string; // YYYY-MM-DD ("" = none)
  openUntilTime: string; // HH:mm
};

const num = (v: unknown, fallback: number) => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : fallback;
};

function cleanFees(f: EngagementFees): EngagementFees {
  return {
    attorneyRate: num(f.attorneyRate, 425),
    associateRate: num(f.associateRate, 425),
    staffRate: num(f.staffRate, 145),
    phase1Retainer: num(f.phase1Retainer, 1000),
    litigationRetainer: num(f.litigationRetainer, 10000),
    minTrustBalance: num(f.minTrustBalance, 5000),
    trialRetainer: num(f.trialRetainer, 20000),
  };
}

/** The dialog's form payload → the letter builder's input, normalized the
 *  same way saveEngagementLetter stores it. */
function letterDataFromInput(input: EngagementInput): LetterData {
  return {
    clientName: input.clientName.trim(),
    businessName: input.businessName.trim(),
    officerTitle: input.officerTitle.trim(),
    andIndividually: Boolean(input.andIndividually),
    email: input.email.trim(),
    street: input.street.trim(),
    city: input.city.trim(),
    state: input.state.trim() || "Texas",
    zip: input.zip.trim(),
    county: input.county.trim(),
    office: input.office === "meridian" ? "meridian" : "fort-worth",
    side: input.side === "defendant" ? "defendant" : "plaintiff",
    generalDescription: input.generalDescription.trim(),
    caseNumber: input.caseNumber.trim(),
    caseStyling: input.caseStyling.trim(),
    phase1Custom: input.phase1Custom.trim(),
    phase2Custom: input.phase2Custom.trim(),
    phase1: Boolean(input.phase1),
    phase2: Boolean(input.phase2),
    fees: cleanFees(input.fees),
    openUntil: /^\d{4}-\d{2}-\d{2}$/.test(input.openUntilDate)
      ? centralTime(input.openUntilDate, /^\d{2}:\d{2}$/.test(input.openUntilTime) ? input.openUntilTime : "17:00")
      : null,
  };
}

/** Live preview for the dialog: the exact letter the current form values
 *  would produce, paragraph by paragraph. Nothing is saved. */
export async function previewEngagementLetter(input: EngagementInput): Promise<{ ok: boolean; paras?: LetterPreviewPara[]; error?: string }> {
  await requireAdmin();
  if (!input.phase1 && !input.phase2) return { ok: false, error: "Keep at least one phase in the engagement." };
  try {
    return { ok: true, paras: await buildEngagementLetterPreview(letterDataFromInput(input)) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Create or update a letter (status stays whatever it already is; new = draft). */
export async function saveEngagementLetter(input: EngagementInput): Promise<{ ok: boolean; id?: number; error?: string }> {
  const session = await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  if (!input.clientName.trim()) return { ok: false, error: "Enter the client's name." };
  if (!input.phase1 && !input.phase2) return { ok: false, error: "Keep at least one phase in the engagement." };

  const office: EngagementOffice = input.office === "meridian" ? "meridian" : "fort-worth";
  const values = {
    intakeId: input.intakeId,
    clientName: input.clientName.trim().slice(0, 191),
    businessName: input.businessName.trim().slice(0, 191),
    officerTitle: input.officerTitle.trim().slice(0, 128),
    andIndividually: Boolean(input.andIndividually),
    email: input.email.trim().slice(0, 255),
    street: input.street.trim().slice(0, 255),
    city: input.city.trim().slice(0, 128),
    state: (input.state.trim() || "Texas").slice(0, 64),
    zip: input.zip.trim().slice(0, 16),
    county: input.county.trim().slice(0, 128),
    office,
    side: (input.side === "defendant" ? "defendant" : "plaintiff") as EngagementSide,
    generalDescription: input.generalDescription.trim().slice(0, 255),
    caseNumber: input.caseNumber.trim().slice(0, 128),
    caseStyling: input.caseStyling.trim().slice(0, 255),
    phase1Custom: input.phase1Custom.trim(),
    phase2Custom: input.phase2Custom.trim(),
    phase1: Boolean(input.phase1),
    phase2: Boolean(input.phase2),
    fees: cleanFees(input.fees),
    openUntil: /^\d{4}-\d{2}-\d{2}$/.test(input.openUntilDate)
      ? centralTime(input.openUntilDate, /^\d{2}:\d{2}$/.test(input.openUntilTime) ? input.openUntilTime : "17:00")
      : null,
    updatedAt: new Date(),
  };

  try {
    if (input.id) {
      await db.update(engagementLetters).set(values).where(eq(engagementLetters.id, input.id));
      await audit(session.email, "update", "engagement-letter", String(input.id), `Updated letter for ${values.clientName}`);
      revalidatePath("/admin/intake");
      return { ok: true, id: input.id };
    }
    const [row] = await db.insert(engagementLetters).values({ ...values, createdBy: session.email }).returning({ id: engagementLetters.id });
    await audit(session.email, "create", "engagement-letter", String(row.id), `Drafted letter for ${values.clientName}`);
    revalidatePath("/admin/intake");
    return { ok: true, id: row.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Move a letter through its lifecycle. The linked intake lead follows along:
 * sent → "letter-sent", signed → "converted", declined → "client-declined".
 */
export async function setEngagementStatus(id: number, status: "draft" | "sent" | "signed" | "declined"): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  const [letter] = await db.select().from(engagementLetters).where(eq(engagementLetters.id, id));
  if (!letter) return { ok: false, error: "Letter not found." };

  const patch: Partial<typeof engagementLetters.$inferInsert> = { status, updatedAt: new Date() };
  if (status === "sent" && !letter.sentAt) patch.sentAt = new Date();
  if (status === "signed") patch.signedAt = new Date();
  await db.update(engagementLetters).set(patch).where(eq(engagementLetters.id, id));

  if (letter.intakeId) {
    const intakeStatus = status === "sent" ? "letter-sent" : status === "signed" ? "converted" : status === "declined" ? "client-declined" : null;
    if (intakeStatus) {
      try {
        await db.update(intakeSubmissions).set({ status: intakeStatus }).where(eq(intakeSubmissions.id, letter.intakeId));
      } catch { /* intake row may be gone; the letter status still stands */ }
    }
  }
  await audit(session.email, "update", "engagement-letter", String(id), `Letter → ${status}`);
  revalidatePath("/admin/intake");
  return { ok: true };
}

export async function deleteEngagementLetter(id: number): Promise<{ ok: boolean }> {
  const session = await requireAdmin();
  if (!db) return { ok: false };
  // A signed letter is a record of an executed agreement — it never deletes.
  const [letter] = await db.select({ status: engagementLetters.status }).from(engagementLetters).where(eq(engagementLetters.id, id));
  if (letter?.status === "signed") return { ok: false };
  await db.delete(engagementLetters).where(eq(engagementLetters.id, id));
  await audit(session.email, "delete", "engagement-letter", String(id), "Deleted engagement letter");
  revalidatePath("/admin/intake");
  return { ok: true };
}

/* ------------------- Send from the portal + e-sign link ------------------ */

const siteOrigin = () => (process.env.NEXT_PUBLIC_SITE_URL || `https://${FIRM.domain}`).replace(/\/$/, "");

async function ensureSignToken(id: number, existing: string | null): Promise<string> {
  if (existing) return existing;
  const token = randomBytes(24).toString("base64url");
  await db!.update(engagementLetters).set({ signToken: token }).where(eq(engagementLetters.id, id));
  return token;
}

/** The client-facing e-sign URL for a letter (creates the token on first ask). */
export async function getEngagementSignLink(id: number): Promise<{ ok: boolean; url?: string; error?: string }> {
  await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  await ensureDiscoveryTables();
  const [letter] = await db.select().from(engagementLetters).where(eq(engagementLetters.id, id));
  if (!letter) return { ok: false, error: "Letter not found." };
  const token = await ensureSignToken(id, letter.signToken);
  return { ok: true, url: `${siteOrigin()}/engage/${token}` };
}

export type SendEngagementOpts = {
  to: string;
  template: EngagementEmailTemplate;
  criminalNote: boolean;
  debtNote: boolean;
  paymentLink: string;
};

/**
 * The "automatedly" button: emails the client the firm's standard engagement
 * (or fee-agreement) email with the generated letter attached as .docx and
 * the e-sign link inline, then flips the letter to "sent". The intake lead
 * moves to "letter-sent" the same way the manual lifecycle did.
 */
export async function sendEngagementLetterEmail(id: number, opts: SendEngagementOpts): Promise<{ ok: boolean; error?: string; signUrl?: string }> {
  const session = await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  if (!emailConfigured) return { ok: false, error: "Email is not configured on this deployment (SMTP_USER/SMTP_PASS)." };
  const to = String(opts.to ?? "").trim().slice(0, 255);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { ok: false, error: "Enter the client's email address." };
  await ensureDiscoveryTables();
  try {
    const [letter] = await db.select().from(engagementLetters).where(eq(engagementLetters.id, id));
    if (!letter) return { ok: false, error: "Letter not found." };

    const buf = await buildEngagementLetter({
      clientName: letter.clientName, businessName: letter.businessName, officerTitle: letter.officerTitle,
      andIndividually: letter.andIndividually, email: letter.email, street: letter.street, city: letter.city,
      state: letter.state, zip: letter.zip, county: letter.county,
      office: letter.office as EngagementOffice, side: letter.side as EngagementSide,
      generalDescription: letter.generalDescription, caseNumber: letter.caseNumber, caseStyling: letter.caseStyling,
      phase1Custom: letter.phase1Custom, phase2Custom: letter.phase2Custom,
      phase1: letter.phase1, phase2: letter.phase2, fees: letter.fees, openUntil: letter.openUntil,
    });

    const token = await ensureSignToken(id, letter.signToken);
    const signUrl = `${siteOrigin()}/engage/${token}`;
    const template: EngagementEmailTemplate = opts.template === "fee-agreement" ? "fee-agreement" : "engagement";
    const paymentLink = (String(opts.paymentLink ?? "").trim() || DEFAULT_PAYMENT_LINK).slice(0, 600);
    const { subject, html } = await buildEngagementEmail({
      template, office: letter.office as EngagementOffice, clientName: letter.clientName,
      signUrl, paymentLink, criminalNote: Boolean(opts.criminalNote), debtNote: Boolean(opts.debtNote),
    });

    const res = await sendEmail({
      to,
      subject,
      html,
      fromName: FIRM.name,
      attachments: [{
        filename: letterFileName(letter),
        content: buf,
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }],
    });
    if (!res.sent) return { ok: false, error: `Email failed: ${res.reason ?? "unknown"}` };

    await db.update(engagementLetters).set({
      status: "sent", sentAt: new Date(), sentTo: to, emailTemplate: template, updatedAt: new Date(),
    }).where(eq(engagementLetters.id, id));
    if (letter.intakeId) {
      try { await db.update(intakeSubmissions).set({ status: "letter-sent" }).where(eq(intakeSubmissions.id, letter.intakeId)); } catch { /* lead may be gone */ }
    }
    await audit(session.email, "update", "engagement-letter", String(id), `Emailed ${template === "fee-agreement" ? "fee agreement" : "engagement letter"} to ${to} with e-sign link`);
    revalidatePath("/admin/intake");
    return { ok: true, signUrl };
  } catch (err) {
    console.error("[engagement] sendEngagementLetterEmail failed:", err);
    return { ok: false, error: "Couldn't send the letter." };
  }
}
