"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { engagementLetters, intakeSubmissions, type EngagementFees } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { centralTime, type EngagementOffice, type EngagementSide } from "@/lib/engagement/config";

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
  await db.delete(engagementLetters).where(eq(engagementLetters.id, id));
  await audit(session.email, "delete", "engagement-letter", String(id), "Deleted engagement letter");
  revalidatePath("/admin/intake");
  return { ok: true };
}
