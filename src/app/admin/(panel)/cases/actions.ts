"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { caseHub } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { ensureDiscoveryTables } from "@/db/ensure";
import { getOrCreateCaseForMatter, cleanParties, findCaseForMatter, clientFromMatter } from "@/lib/cases";
import { upsertAttorneyContact, upsertContact } from "@/lib/contacts";
import { admins, contacts, type PartyAttorney, type PartyCc } from "@/db/schema";
import { and, sql } from "drizzle-orm";
import { FIRM } from "@/lib/firm";

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
  const row = await findCaseForMatter(matter);
  if (!row) return { found: false as const };
  const parties = cleanParties(row.parties);
  // Our client: the party marked "ours" under Counsel of Record, else the
  // client named in the matter code itself.
  const ours = parties.find((p) => p.ours && p.name !== p.role)?.name ?? "";
  const client = ours || clientFromMatter(row.matter);
  // Placeholder entries (name === role) aren't real names; don't offer them
  // for pleading captions.
  const named = (role: string) => parties.filter((p) => p.role === role && p.name !== p.role).map((p) => p.name).join("; ");
  return {
    found: true as const,
    /** The exact key the case is filed under — forms swap to it so every tool points at one record. */
    matter: row.matter,
    client,
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

/** Rename a party or change its role, in place. */
export async function updateCaseParty(id: number, index: number, name: string, role: string) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const pname = str(name, 191);
  if (!pname) return { ok: false as const, error: "Enter the party's name." };
  try {
    const [row] = await db.select().from(caseHub).where(eq(caseHub.id, id));
    if (!row) return { ok: false as const, error: "Case not found." };
    const parties = cleanParties(row.parties);
    if (index < 0 || index >= parties.length) return { ok: false as const, error: "That party no longer exists — reload the page." };
    if (parties.some((p, i) => i !== index && p.name.toLowerCase() === pname.toLowerCase())) {
      return { ok: false as const, error: "Another party already has that name." };
    }
    const prev = parties[index];
    // Keep contact details, counsel, and CC list — only the name/role change.
    parties[index] = { ...prev, name: pname, role: str(role, 96) || "Party" };
    await db.update(caseHub).set({ parties, updatedAt: new Date() }).where(eq(caseHub.id, id));
    await audit(session.email, "update", "case", String(id), `Party "${prev.name}" \u2192 "${pname}" (${role || "Party"})`);
    revalidatePath(`/admin/cases/${id}`);
    return { ok: true as const };
  } catch (err) {
    console.error("[cases] updateCaseParty failed:", err);
    return { ok: false as const, error: "Couldn't save the party." };
  }
}

export type PartyContactInput = {
  email?: string; phone?: string; address?: string;
  attorney?: { name?: string; firm?: string; email?: string; phone?: string; address?: string };
};

/** Save a party's contact details (their own, and their attorney's). The
 *  attorney is also filed into the firm contact book for future type-aheads. */
export async function updateCasePartyContact(id: number, index: number, input: PartyContactInput) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [row] = await db.select().from(caseHub).where(eq(caseHub.id, id));
    if (!row) return { ok: false as const, error: "Case not found." };
    const parties = cleanParties(row.parties);
    if (index < 0 || index >= parties.length) return { ok: false as const, error: "That party no longer exists \u2014 reload the page." };
    const p = parties[index];
    p.email = str(input.email, 255) || undefined;
    p.phone = str(input.phone, 64) || undefined;
    p.address = str(input.address, 500) || undefined;
    const aName = str(input.attorney?.name, 191);
    let attorney: PartyAttorney | undefined;
    // The party's own-contact dialog leaves counsel of record alone.
    if (!("attorney" in input)) {
      // keep whatever counsel is on file
    } else if (aName) {
      attorney = {
        name: aName,
        firm: str(input.attorney?.firm, 191) || undefined,
        email: str(input.attorney?.email, 255) || undefined,
        phone: str(input.attorney?.phone, 64) || undefined,
        address: str(input.attorney?.address, 500) || undefined,
      };
      p.attorney = attorney;
    } else {
      delete p.attorney;
    }
    await db.update(caseHub).set({ parties, updatedAt: new Date() }).where(eq(caseHub.id, id));
    if (attorney) await upsertAttorneyContact(attorney, session.email).catch(() => {});
    await audit(session.email, "update", "case", String(id), `Contact details for party "${p.name}"`);
    revalidatePath(`/admin/cases/${id}`);
    return { ok: true as const };
  } catch (err) {
    console.error("[cases] updateCasePartyContact failed:", err);
    return { ok: false as const, error: "Couldn't save the contact details." };
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

/** The "has the retainer been paid?" flag on a case. null = not answered.
 *  A reminder for the team until payment tracking is fully coordinated. */
export async function setCaseRetainer(id: number, paid: boolean | null) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    await db.update(caseHub).set({
      retainerPaid: paid,
      retainerSetBy: paid === null ? null : session.email,
      retainerSetAt: paid === null ? null : new Date(),
      updatedAt: new Date(),
    }).where(eq(caseHub.id, id));
    await audit(session.email, "update", "case", String(id), paid === null ? "Retainer question cleared" : `Retainer marked ${paid ? "PAID" : "NOT paid"}`);
    revalidatePath("/admin/cases");
    return { ok: true as const };
  } catch (err) {
    console.error("[cases] setCaseRetainer failed:", err);
    return { ok: false as const, error: "Couldn't update the case." };
  }
}

/** Close or reopen a case. A closed case keeps every record — it just moves
 *  out of the main list into the low-profile "Closed cases" section. */
export async function setCaseArchived(id: number, archived: boolean) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    await db.update(caseHub).set({ archived }).where(eq(caseHub.id, id));
    await audit(session.email, "update", "case", String(id), archived ? "Case closed" : "Case reopened");
    revalidatePath("/admin/cases");
    revalidatePath(`/admin/cases/${id}`);
    return { ok: true as const };
  } catch (err) {
    console.error("[cases] setCaseArchived failed:", err);
    return { ok: false as const, error: "Couldn't update the case." };
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
/* ------------------------- pleadings bucket ------------------------- */

/**
 * The case's PLEADINGS bucket: petition, answer, counterclaims, key motions.
 * AI.fred reads these to understand what the lawsuit is ABOUT, so it can
 * judge what discovery evidence is relevant to (e.g., a Facebook-page
 * authorization matters because the pleadings claim the page was withheld).
 * Stored as a share folder of type "pleadings" — indexed and labeled by
 * Read & label like everything else, but NEVER exposed on any share link
 * (all public surfaces filter to type "client").
 */
export async function ensurePleadingsFolder(matterIn: string) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const { shareFolders } = await import("@/db/schema");
  const { and: andOp, eq: eqOp } = await import("drizzle-orm");
  const matter = str(matterIn, 500);
  if (!matter) return { ok: false as const, error: "This case has no matter number yet." };
  const [existing] = await db.select({ id: shareFolders.id }).from(shareFolders).where(andOp(eqOp(shareFolders.matter, matter), eqOp(shareFolders.type, "pleadings")));
  if (existing) return { ok: true as const, folderId: existing.id };
  const [row] = await db.insert(shareFolders).values({ name: "Pleadings (AI case context)", matter, type: "pleadings" }).returning({ id: shareFolders.id });
  return { ok: true as const, folderId: row.id };
}

export async function deletePleading(fileId: number, caseId: number) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const { shareFiles, shareFolders } = await import("@/db/schema");
  const { eq: eqOp } = await import("drizzle-orm");
  const [f] = await db.select().from(shareFiles).where(eqOp(shareFiles.id, fileId));
  if (!f) return { ok: false as const, error: "File not found." };
  const [folder] = await db.select().from(shareFolders).where(eqOp(shareFolders.id, f.folderId));
  if (folder?.type !== "pleadings") return { ok: false as const, error: "Not a pleadings file." };
  try {
    const { del } = await import("@vercel/blob");
    if (f.pathname) await del(f.pathname).catch(() => {});
  } catch { /* blob delete is best-effort */ }
  await db.delete(shareFiles).where(eqOp(shareFiles.id, fileId));
  await audit(session.email, "case.pleading.delete", `${f.filename} (#${fileId})`);
  revalidatePath(`/admin/cases/${caseId}`);
  return { ok: true as const };
}

/* ---------------------- counsel of record + CC people --------------------- */

/** CC categories → contact-book kinds. */
const CC_KIND: Record<string, string> = {
  attorney: "attorney", "legal-assistant": "staff", paralegal: "staff",
  witness: "witness", "litigation-support": "litigation-support", court: "court", other: "other",
};
const PLACEHOLDER_PARTY = /^(plaintiff|defendant|petitioner|respondent|intervenor|party)$/i;

export type PartyCounselInput = {
  ours: boolean;
  proSe?: boolean;
  attorney?: { name?: string; firm?: string; email?: string; phone?: string; address?: string };
  cc: { name?: string; role?: string; firm?: string; email?: string; phone?: string }[];
};

/**
 * Save a party's counsel of record, whether the party is our client, and the
 * people to copy on correspondence. Everyone named here is filed into the
 * Contacts tab under their category (and side) so later type-aheads find them.
 */
export async function updateCasePartyCounsel(id: number, index: number, input: PartyCounselInput) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [row] = await db.select().from(caseHub).where(eq(caseHub.id, id));
    if (!row) return { ok: false as const, error: "Case not found." };
    const parties = cleanParties(row.parties);
    if (index < 0 || index >= parties.length) return { ok: false as const, error: "That party no longer exists — reload the page." };
    const p = parties[index];
    const side = input.ours ? "ours" : "opposing";

    if (input.ours) p.ours = true; else delete p.ours;

    const aName = input.proSe ? "" : str(input.attorney?.name, 191);
    if (input.proSe && !input.ours) p.proSe = true; else delete p.proSe;
    if (aName) {
      p.attorney = {
        name: aName,
        firm: str(input.attorney?.firm, 191) || undefined,
        email: str(input.attorney?.email, 255) || undefined,
        phone: str(input.attorney?.phone, 64) || undefined,
        address: str(input.attorney?.address, 500) || undefined,
      };
    } else {
      delete p.attorney;
    }

    const cc: PartyCc[] = (input.cc ?? [])
      .map((c) => ({
        name: str(c.name, 191),
        role: CC_KIND[str(c.role, 32)] ? str(c.role, 32) : "other",
        firm: str(c.firm, 191) || undefined,
        email: str(c.email, 255) || undefined,
        phone: str(c.phone, 64) || undefined,
      }))
      .filter((c) => c.name || c.email)
      .slice(0, 25);
    const uncategorized = (input.cc ?? []).find((c) => (str(c.name) || str(c.email)) && !CC_KIND[str(c.role, 32)]);
    if (uncategorized) return { ok: false as const, error: `Pick a category for ${str(uncategorized.name) || str(uncategorized.email)}.` };
    for (const c of cc) {
      if (c.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) {
        return { ok: false as const, error: `"${c.email}" doesn't look like an email address.` };
      }
    }
    if (p.attorney?.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.attorney.email)) {
      return { ok: false as const, error: `"${p.attorney.email}" doesn't look like an email address.` };
    }
    if (cc.length) p.cc = cc; else delete p.cc;

    await db.update(caseHub).set({ parties, updatedAt: new Date() }).where(eq(caseHub.id, id));

    // File everyone into the contact book, categorized. Best-effort.
    try {
      if (p.attorney) await upsertAttorneyContact(p.attorney, session.email, side);
      for (const c of cc) {
        await upsertContact({ kind: CC_KIND[c.role] ?? "other", side, name: c.name, firm: c.firm, email: c.email, phone: c.phone }, session.email);
      }
      if (!PLACEHOLDER_PARTY.test(p.name)) {
        await upsertContact({ kind: input.ours ? "client-current" : "opposing-party", side, name: p.name, email: p.email, phone: p.phone, address: p.address }, session.email);
      }
    } catch (err) {
      console.error("[cases] filing contacts failed (case saved):", err);
    }

    await audit(session.email, "update", "case", String(id), `Counsel of record / CC for "${p.name}"`);
    revalidatePath(`/admin/cases/${id}`);
    revalidatePath("/admin/contacts");
    return { ok: true as const };
  } catch (err) {
    console.error("[cases] updateCasePartyCounsel failed:", err);
    return { ok: false as const, error: "Couldn't save counsel of record." };
  }
}

export type PersonHit = { source: "firm" | "book"; name: string; firm: string; email: string; phone: string; address: string; kind: string; side: string };

/**
 * Type-ahead for counsel and CC fields: the firm's own people (admin accounts
 * and contacts marked "ours") first when filling our side, then the contact
 * book. Readable by anyone in the Cases section.
 */
export async function searchPeople(query: string, opts: { ours?: boolean; kinds?: string[] } = {}): Promise<PersonHit[]> {
  await guard();
  if (!db) return [];
  const q = str(query, 100).toLowerCase();
  if (q.length < 2) return [];
  const like = "%" + q + "%";
  const out: PersonHit[] = [];
  try {
    if (opts.ours) {
      const staff = await db.select({ name: admins.name, email: admins.email }).from(admins)
        .where(sql`(lower(${admins.name}) LIKE ${like} OR lower(${admins.email}) LIKE ${like})`).limit(6);
      for (const a of staff) out.push({ source: "firm", name: a.name, firm: FIRM.name, email: a.email, phone: "", address: "", kind: "staff", side: "ours" });
    }
    const rows = await db.select().from(contacts).where(and(
      eq(contacts.archived, false),
      sql`(lower(${contacts.name}) LIKE ${like} OR lower(${contacts.firm}) LIKE ${like} OR lower(${contacts.email}) LIKE ${like})`,
      ...(opts.kinds?.length ? [sql`${contacts.kind} IN (${sql.join(opts.kinds.map((k) => sql`${k}`), sql`, `)})`] : []),
    )).limit(10);
    const seen = new Set(out.map((h) => (h.email || h.name).toLowerCase()));
    // Our side sees our people first; the other side sees theirs first.
    const want = opts.ours ? "ours" : "opposing";
    rows.sort((a, b) => Number(b.side === want) - Number(a.side === want));
    for (const r of rows) {
      const key = (r.email || r.name).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ source: "book", name: r.name, firm: r.firm, email: r.email, phone: r.phone, address: r.address, kind: r.kind, side: r.side });
    }
  } catch (err) {
    console.error("[cases] searchPeople failed:", err);
  }
  return out.slice(0, 12);
}

/** The firm's own people (admin accounts), for the "our team" quick-adds. */
export async function listFirmPeople(): Promise<PersonHit[]> {
  await guard();
  if (!db) return [];
  try {
    const rows = await db.select({ name: admins.name, email: admins.email }).from(admins).limit(40);
    return rows
      .filter((a) => a.email)
      .map((a) => ({ source: "firm" as const, name: a.name || a.email, firm: FIRM.name, email: a.email, phone: "", address: "", kind: "staff", side: "ours" }));
  } catch (err) {
    console.error("[cases] listFirmPeople failed:", err);
    return [];
  }
}
