"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sbMemberships, sbUsers } from "@/db/schema";
import { requireAdmin, isFullAdmin, audit } from "@/lib/auth";
import { ensureBooks, seedBooksDefaults } from "@/lib/books/ensure";
import { upsertBooksUser } from "@/lib/books/auth";

/** A full admin sets (or resets) their OWN StartBookkeeping password. The
 *  first one in becomes the company's owner; the admin password never opens
 *  the books, and this password never opens the admin. */
export async function setMyBooksPassword(password: string) {
  const session = await requireAdmin();
  if (!isFullAdmin(session.role)) return { ok: false as const, error: "Only a full admin can set up a StartBookkeeping login." };
  if ((password ?? "").length < 12) return { ok: false as const, error: "Use at least 12 characters." };
  if (!db) return { ok: false as const, error: "Database not configured." };
  await ensureBooks();
  const companyId = await seedBooksDefaults();
  const owners = await db.select({ id: sbMemberships.id }).from(sbMemberships).where(eq(sbMemberships.companyId, companyId));
  const r = await upsertBooksUser(session.email, session.name, password, companyId, owners.length === 0 ? "owner" : "owner");
  await audit(session.email, r.created ? "create" : "update", "startbookkeeping-login", String(r.user.id), r.created ? "StartBookkeeping login created" : "StartBookkeeping password reset");
  return { ok: true as const, created: r.created };
}

export async function myBooksLogin() {
  const session = await requireAdmin();
  if (!db) return null;
  await ensureBooks();
  const [u] = await db.select({ id: sbUsers.id, lastLoginAt: sbUsers.lastLoginAt }).from(sbUsers).where(eq(sbUsers.email, session.email.toLowerCase()));
  return u ? { exists: true, lastLoginAt: u.lastLoginAt?.toISOString() ?? null } : { exists: false, lastLoginAt: null };
}
