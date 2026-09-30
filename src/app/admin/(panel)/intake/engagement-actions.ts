"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { engagementLetters, intakeSubmissions, type EngagementFees } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { centralTime, type EngagementOffice, type EngagementSide } from "@/lib/engagement/config";
import { randomBytes } from "crypto";
import { ensureDiscoveryTables } from "@/db/ensure";
import { buildEngagementLetterPreview, type LetterData, type LetterPreviewPara } from "@/lib/engagement/letter";
import { buildEngagementEmail, DEFAULT_PAYMENT_LINK, type EngagementEmailTemplate } from "@/lib/engagement/email";
import { sendEmail, emailConfigured } from "@/lib/email";
import { FIRM } from "@/lib/firm";
import { getIntakeRecipients } from "@/lib/content";
import { engagementDefaultRates } from "@/lib/engagement/rates";
import { letterPdf, ensureCaseForSignedLetter } from "@/lib/engagement/signed";

/** Everyone checked into the intake team — CCed on letter sends and
 *  notified when a letter is e-signed. */
async function intakeTeamEmails(): Promise<string[]> {
  try {
    const rs = await getIntakeRecipients(true);
    return [...new Set(rs.map((r) => r.email.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];
  } catch {
    return [];
  }
}

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
    const defaultRates = await engagementDefaultRates();
    return { ok: true, paras: await buildEngagementLetterPreview({ ...letterDataFromInput(input), defaultRates }) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/* --------------- attorney-edited .docx (low-profile override) ------------ */

/**
 * Attach an edited copy the attorney reworked in Word and exported as a PDF.
 * From then on, sends and downloads use THIS file instead of the generated
 * letter, until removed. PDF only — a Word file could be edited by the
 * client, so the letter never goes out as .docx.
 */
export async function uploadEngagementDocx(id: number, file: { name: string; dataBase64: string }): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  const b64 = String(file.dataBase64 ?? "");
  if (b64.length > 12_000_000) return { ok: false, error: "That file is too large (8 MB max)." };
  if (!b64.startsWith("JVBERi")) {
    return { ok: false, error: "Upload the edited copy as a PDF (in Word: File → Save As → PDF). Word files can be edited by the client, so the letter only goes out as a PDF." };
  }
  const name = (String(file.name ?? "").trim() || "Engagement Letter (edited).pdf").slice(0, 255);
  try {
    await db.update(engagementLetters).set({ customDocx: b64, customDocxName: name, customDocxAt: new Date(), updatedAt: new Date() }).where(eq(engagementLetters.id, id));
    await audit(session.email, "update", "engagement-letter", String(id), `Attached edited copy: ${name}`);
    revalidatePath("/admin/intake");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Back to the generated letter: drop the attorney-edited copy. */
export async function clearEngagementDocx(id: number): Promise<{ ok: boolean }> {
  const session = await requireAdmin();
  if (!db) return { ok: false };
  await db.update(engagementLetters).set({ customDocx: null, customDocxName: "", customDocxAt: null, updatedAt: new Date() }).where(eq(engagementLetters.id, id));
  await audit(session.email, "update", "engagement-letter", String(id), "Removed edited copy — back to the generated letter");
  revalidatePath("/admin/intake");
  return { ok: true };
}

/** Create or update a letter (status stays whatever it already is; new = draft). */
export async function saveEngagementLetter(input: EngagementInput): Promise<{ ok: boolean; id?: number; error?: string }> {
  const session = await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  if (input.id) {
    // A signed letter is an executed agreement — its record never changes.
    const [existing] = await db.select({ status: engagementLetters.status }).from(engagementLetters).where(eq(engagementLetters.id, input.id));
    if (existing?.status === "signed") return { ok: false, error: "This letter has been SIGNED and is locked. Start a new letter instead." };
  }
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
  // A signed engagement is a real case — it appears in Matters/Cases now.
  if (status === "signed") {
    try { await ensureCaseForSignedLetter({ ...letter, status, signedAt: patch.signedAt ?? letter.signedAt }); } catch { /* best-effort */ }
  }

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

    // The letter always goes out as a PDF (a Word file could be edited by the
    // client): the attorney-edited PDF when attached, else the generated one.
    let pdf: Awaited<ReturnType<typeof letterPdf>>;
    try {
      pdf = await letterPdf(letter);
    } catch (err) {
      console.error("[engagement] letter PDF render failed:", err);
      return { ok: false, error: `NOT SENT — the PDF print engine failed (${(err as Error).message}). The letter was not emailed; tell Claude this exact message.` };
    }
    if (!pdf) return { ok: false, error: "The attached edited copy is a Word file — re-attach it as a PDF, or remove it to send the generated letter." };

    const token = await ensureSignToken(id, letter.signToken);
    const signUrl = `${siteOrigin()}/engage/${token}`;
    const template: EngagementEmailTemplate = opts.template === "fee-agreement" ? "fee-agreement" : "engagement";
    const paymentLink = (String(opts.paymentLink ?? "").trim() || DEFAULT_PAYMENT_LINK).slice(0, 600);
    const { subject, html } = await buildEngagementEmail({
      template, office: letter.office as EngagementOffice, clientName: letter.clientName,
      signUrl, paymentLink, criminalNote: Boolean(opts.criminalNote), debtNote: Boolean(opts.debtNote),
    });

    // The intake team rides along on every letter that goes out.
    const cc = (await intakeTeamEmails()).filter((e) => e !== to.toLowerCase());
    const res = await sendEmail({
      to,
      cc: cc.length ? cc : undefined,
      subject,
      html,
      fromName: FIRM.name,
      attachments: [{
        filename: pdf.fileName,
        content: pdf.buf,
        contentType: "application/pdf",
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
