import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, type PartyAttorney } from "@/db/schema";

const str = (v: unknown, max = 191) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * File an attorney into the contact book the moment a case learns about them,
 * so the next case's type-ahead already knows the name. Matched by name
 * (case-insensitive); existing records only gain missing details, never lose
 * what someone typed. Not a server action — callers guard themselves.
 */
export async function upsertAttorneyContact(a: PartyAttorney, createdBy?: string) {
  if (!db) return;
  const name = str(a.name);
  if (!name) return;
  const [existing] = await db.select().from(contacts)
    .where(and(eq(contacts.kind, "attorney"), sql`lower(${contacts.name}) = ${name.toLowerCase()}`));
  if (existing) {
    const patch: Record<string, string> = {};
    if (!existing.firm && a.firm) patch.firm = str(a.firm);
    if (!existing.email && a.email) patch.email = str(a.email, 255);
    if (!existing.phone && a.phone) patch.phone = str(a.phone, 64);
    if (!existing.address && a.address) patch.address = str(a.address, 500);
    if (Object.keys(patch).length) {
      await db.update(contacts).set({ ...patch, updatedAt: new Date() }).where(eq(contacts.id, existing.id));
    }
    return;
  }
  await db.insert(contacts).values({
    kind: "attorney", name, firm: str(a.firm), email: str(a.email, 255), phone: str(a.phone, 64), address: str(a.address, 500), createdBy,
  });
}
