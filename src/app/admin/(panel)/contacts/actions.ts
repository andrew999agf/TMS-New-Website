"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { ensureDiscoveryTables } from "@/db/ensure";

const KINDS = new Set(["attorney", "client-current", "client-past", "client-prospective", "opposing-party", "other"]);
const SIDES = new Set(["", "ours", "opposing"]);
const str = (v: unknown, max = 191) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function guard() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/contacts", session.role, session.permissions)) throw new Error("Not allowed.");
  await ensureDiscoveryTables();
  return session;
}

export type ContactInput = { kind: string; name: string; firm?: string; side?: string; email?: string; phone?: string; address?: string; notes?: string };

function values(input: ContactInput) {
  return {
    kind: KINDS.has(input.kind) ? input.kind : "other",
    name: str(input.name),
    firm: str(input.firm),
    side: SIDES.has(input.side ?? "") ? (input.side ?? "") : "",
    email: str(input.email, 255),
    phone: str(input.phone, 64),
    address: str(input.address, 500),
    notes: str(input.notes, 2000),
  };
}

export async function createContact(input: ContactInput) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const v = values(input);
  if (!v.name) return { ok: false as const, error: "Enter a name." };
  try {
    const [row] = await db.insert(contacts).values({ ...v, createdBy: session.email }).returning({ id: contacts.id });
    await audit(session.email, "create", "contact", String(row.id), `Contact "${v.name}" (${v.kind})`);
    revalidatePath("/admin/contacts");
    return { ok: true as const, id: row.id };
  } catch (err) {
    console.error("[contacts] createContact failed:", err);
    return { ok: false as const, error: "Couldn't save the contact." };
  }
}

export async function updateContact(id: number, input: ContactInput) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const v = values(input);
  if (!v.name) return { ok: false as const, error: "Enter a name." };
  try {
    await db.update(contacts).set({ ...v, updatedAt: new Date() }).where(eq(contacts.id, id));
    await audit(session.email, "update", "contact", String(id), `Updated contact "${v.name}"`);
    revalidatePath("/admin/contacts");
    return { ok: true as const };
  } catch (err) {
    console.error("[contacts] updateContact failed:", err);
    return { ok: false as const, error: "Couldn't save the contact." };
  }
}

export async function deleteContact(id: number) {
  const session = await guard();
  if (!db) return { ok: false as const };
  try {
    await db.delete(contacts).where(eq(contacts.id, id));
    await audit(session.email, "delete", "contact", String(id), "Deleted contact");
    revalidatePath("/admin/contacts");
    return { ok: true as const };
  } catch (err) {
    console.error("[contacts] deleteContact failed:", err);
    return { ok: false as const };
  }
}

export type ContactHit = { id: number; kind: string; name: string; firm: string; side: string; email: string; phone: string; address: string };

/**
 * The shared type-ahead: three letters in, best matches out. Any signed-in
 * admin may search (guarding on the Contacts section would break the
 * type-ahead inside Cases for someone allowed only there).
 */
export async function searchContacts(query: string, kind?: string): Promise<ContactHit[]> {
  await requireAdmin();
  if (!db) return [];
  await ensureDiscoveryTables();
  const q = str(query, 100).toLowerCase();
  if (q.length < 2) return [];
  try {
    const rows = await db.select().from(contacts)
      .where(and(
        eq(contacts.archived, false),
        ...(kind && KINDS.has(kind) ? [eq(contacts.kind, kind)] : []),
        sql`(lower(${contacts.name}) LIKE ${"%" + q + "%"} OR lower(${contacts.firm}) LIKE ${"%" + q + "%"})`,
      ))
      .limit(8);
    return rows.map((r) => ({ id: r.id, kind: r.kind, name: r.name, firm: r.firm, side: r.side, email: r.email, phone: r.phone, address: r.address }));
  } catch {
    return [];
  }
}
