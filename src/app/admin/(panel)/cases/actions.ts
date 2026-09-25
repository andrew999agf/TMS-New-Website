"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { caseHub } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { ensureDiscoveryTables } from "@/db/ensure";
import { getOrCreateCaseForMatter, cleanParties } from "@/lib/cases";

async function guard() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/cases", session.role, session.permissions)) throw new Error("Not allowed.");
  await ensureDiscoveryTables();
  return session;
}

const str = (v: unknown, max = 191) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * "Do we already have this case?" — the shared lookup behind every tool's
 * create form. Readable by any signed-in admin (guarding on the Cases section
 * would wrongly lock out someone allowed only into, say, Share Folders).
 */
export async function lookupCaseForMatter(matterIn: string) {
  await requireAdmin();
  if (!db) return { found: false as const };
  await ensureDiscoveryTables();
  const matter = str(matterIn, 500);
  if (!matter) return { found: false as const };
  const [row] = await db.select().from(caseHub).where(eq(caseHub.matter, matter));
  if (!row) return { found: false as const };
  const parties = cleanParties(row.parties);
  // Placeholder entries (name === role) aren't real names; don't offer them
  // for pleading captions.
  const named = (role: string) => parties.filter((p) => p.role === role && p.name !== p.role).map((p) => p.name).join("; ");
  return {
    found: true as const,
    name: row.name, causeNumber: row.causeNumber, court: row.court, county: row.county,
    plaintiff: named("Plaintiff"), defendant: named("Defendant"),
  };
}

export type CaseInput = { matter: string; name?: string; causeNumber?: string; court?: string; county?: string; notes?: string };

export async function createCase(input: CaseInput) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  if (!str(input.matter, 500)) return { ok: false as const, error: "Pick or type the matter number — it's how every tool finds this case." };
  try {
    const row = await getOrCreateCaseForMatter(input, session.email);
    if (!row) return { ok: false as const, error: "Couldn't create the case." };
    await audit(session.email, "create", "case", String(row.id), `Case record for matter ${row.matter}`);
    revalidatePath("/admin/cases");
    return { ok: true as const, id: row.id };
  } catch (err) {
    console.error("[cases] createCase failed:", err);
    return { ok: false as const, error: "Couldn't create the case." };
  }
}

export async function updateCaseInfo(id: number, patch: { name?: string; causeNumber?: string; court?: string; county?: string; notes?: string }) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    await db.update(caseHub).set({
      name: str(patch.name, 255),
      causeNumber: str(patch.causeNumber, 128),
      court: str(patch.court),
      county: str(patch.county, 96),
      notes: str(patch.notes, 4000),
      updatedAt: new Date(),
    }).where(eq(caseHub.id, id));
    await audit(session.email, "update", "case", String(id), "Updated case information");
    revalidatePath("/admin/cases");
    revalidatePath(`/admin/cases/${id}`);
    return { ok: true as const };
  } catch (err) {
    console.error("[cases] updateCaseInfo failed:", err);
    return { ok: false as const, error: "Couldn't save the case." };
  }
}

/** Add a party to a case by matter number — callable from any tool (the
 *  Discovery Reviewer's "+ add party", the hub itself), lands everywhere. */
export async function addCaseParty(matter: string, name: string, role: string) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const pname = str(name, 191);
  if (!pname) return { ok: false as const, error: "Enter the party's name." };
  try {
    const row = await getOrCreateCaseForMatter({ matter }, session.email);
    if (!row) return { ok: false as const, error: "This case has no matter number yet." };
    const parties = cleanParties(row.parties);
    if (parties.some((p) => p.name.toLowerCase() === pname.toLowerCase())) {
      return { ok: true as const, parties };
    }
    const next = [...parties, { name: pname, role: str(role, 96) || "Party" }];
    await db.update(caseHub).set({ parties: next, updatedAt: new Date() }).where(eq(caseHub.id, row.id));
    await audit(session.email, "update", "case", String(row.id), `Added party "${pname}" (${role || "Party"})`);
    revalidatePath("/admin/cases");
    revalidatePath(`/admin/cases/${row.id}`);
    return { ok: true as const, parties: next };
  } catch (err) {
    console.error("[cases] addCaseParty failed:", err);
    return { ok: false as const, error: "Couldn't add the party." };
  }
}

export async function removeCaseParty(id: number, index: number) {
  const session = await guard();
  if (!db) return { ok: false as const };
  try {
    const [row] = await db.select().from(caseHub).where(eq(caseHub.id, id));
    if (!row) return { ok: false as const };
    const parties = cleanParties(row.parties);
    if (index < 0 || index >= parties.length) return { ok: false as const };
    const removed = parties.splice(index, 1)[0];
    await db.update(caseHub).set({ parties, updatedAt: new Date() }).where(eq(caseHub.id, id));
    await audit(session.email, "update", "case", String(id), `Removed party "${removed.name}"`);
    revalidatePath(`/admin/cases/${id}`);
    return { ok: true as const };
  } catch (err) {
    console.error("[cases] removeCaseParty failed:", err);
    return { ok: false as const };
  }
}

export async function deleteCase(id: number) {
  const session = await guard();
  if (!db) return { ok: false as const };
  try {
    await db.delete(caseHub).where(eq(caseHub.id, id));
    await audit(session.email, "delete", "case", String(id), "Deleted case record");
    revalidatePath("/admin/cases");
    return { ok: true as const };
  } catch (err) {
    console.error("[cases] deleteCase failed:", err);
    return { ok: false as const };
  }
}