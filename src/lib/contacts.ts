import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, type PartyAttorney } from "@/db/schema";

const str = (v: unknown, max = 191) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Contact-book categories. Keep in sync with CONTACT_KINDS in ContactsManager. */
export const CONTACT_KIND_KEYS = [
  "attorney", "staff", "client-current", "client-past", "client-prospective", "opposing-party",
  "witness", "litigation-support", "court", "other",
] as const;
export type ContactKind = (typeof CONTACT_KIND_KEYS)[number];

export type ContactUpsert = {
  kind: string;
  name: string;
  /** ours | opposing | "" */
  side?: string;
  firm?: string;
  email?: string;
  phone?: string;
  address?: string;
};

/**
 * File a person into the contact book the moment any tool learns about them,
 * so every later type-ahead already knows the name. Matched by category +
 * name (case-insensitive), or by email within the category; an existing
 * record only gains missing details, never loses what someone typed. Not a
 * server action — callers guard themselves.
 */
export async function upsertContact(c: ContactUpsert, createdBy?: string) {
  if (!db) return;
  const kind = (CONTACT_KIND_KEYS as readonly string[]).includes(c.kind) ? c.kind : "other";
  const name = str(c.name);
  const email = str(c.email, 255);
  if (!name && !email) return;
  const [existing] = await db.select().from(contacts).where(and(
    eq(contacts.kind, kind),
    eq(contacts.archived, false),
    email
      ? sql`(lower(${contacts.name}) = ${(name || email).toLowerCase()} OR lower(${contacts.email}) = ${email.toLowerCase()})`
      : sql`lower(${contacts.name}) = ${name.toLowerCase()}`,
  ));
  const side = c.side === "ours" || c.side === "opposing" ? c.side : "";
  if (existing) {
    const patch: Record<string, string> = {};
    if (!existing.firm && c.firm) patch.firm = str(c.firm);
    if (!existing.email && email) patch.email = email;
    if (!existing.phone && c.phone) patch.phone = str(c.phone, 64);
    if (!existing.address && c.address) patch.address = str(c.address, 500);
    if (!existing.side && side) patch.side = side;
    if (Object.keys(patch).length) {
      await db.update(contacts).set({ ...patch, updatedAt: new Date() }).where(eq(contacts.id, existing.id));
    }
    return;
  }
  await db.insert(contacts).values({
    kind, side, name: name || email, firm: str(c.firm), email, phone: str(c.phone, 64), address: str(c.address, 500), createdBy,
  });
}

/** Back-compat wrapper: an attorney learned from a case. */
export async function upsertAttorneyContact(a: PartyAttorney, createdBy?: string, side = "") {
  return upsertContact({ kind: "attorney", side, name: a.name, firm: a.firm, email: a.email, phone: a.phone, address: a.address }, createdBy);
}
