"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray, and } from "drizzle-orm";
import { db } from "@/db";
import { timeEntries, timeActivityUsers, timeCategories, timeMatters } from "@/db/schema";
import { requireAdmin, isFullAdmin, audit } from "@/lib/auth";

export type TimeEntryInput = {
  matter: string;
  entryDate: string; // YYYY-MM-DD
  activityDescription: string;
  note: string;
  price: number;
  quantity: number;
  activityUserName: string;
  nonBillable: boolean;
};

async function ctx() {
  const session = await requireAdmin();
  return { session, me: Number(session.sub), admin: isFullAdmin(session.role) };
}

export async function addTimeEntry(input: TimeEntryInput) {
  const { me } = await ctx();
  if (!db) return { ok: false, error: "Database not configured." };
  const [row] = await db.insert(timeEntries).values({ ...input, ownerId: me }).returning({ id: timeEntries.id });
  revalidatePath("/admin/time-tracker");
  return { ok: true, id: row?.id };
}

export async function updateTimeEntry(id: number, patch: Partial<TimeEntryInput>) {
  const { me, admin } = await ctx();
  if (!db) return { ok: false, error: "Database not configured." };
  const [e] = await db.select().from(timeEntries).where(eq(timeEntries.id, id));
  if (!e) return { ok: false, error: "Not found." };
  if (!admin && e.ownerId !== me) return { ok: false, error: "Not allowed." };
  await db.update(timeEntries).set(patch).where(eq(timeEntries.id, id));
  revalidatePath("/admin/time-tracker");
  return { ok: true };
}

export async function deleteTimeEntry(id: number) {
  const { me, admin } = await ctx();
  if (!db) return { ok: false, error: "Database not configured." };
  const [e] = await db.select().from(timeEntries).where(eq(timeEntries.id, id));
  if (!e) return { ok: false };
  if (!admin && e.ownerId !== me) return { ok: false, error: "Not allowed." };
  await db.delete(timeEntries).where(eq(timeEntries.id, id));
  revalidatePath("/admin/time-tracker");
  return { ok: true };
}

/** Archive (or restore) a set of entries. Timekeepers can only touch their own. */
export async function setTimeEntriesArchived(ids: number[], archived: boolean) {
  const { me, admin, session } = await ctx();
  if (!db) return { ok: false, error: "Database not configured." };
  if (ids.length === 0) return { ok: true };
  const cond = admin
    ? inArray(timeEntries.id, ids)
    : and(inArray(timeEntries.id, ids), eq(timeEntries.ownerId, me));
  await db
    .update(timeEntries)
    .set({
      status: archived ? "archived" : "active",
      exportedAt: archived ? new Date() : null,
      exportedBy: archived ? session.email : null,
    })
    .where(cond);
  await audit(session.email, "update", "time-entry", undefined, archived ? `Archived ${ids.length}` : `Restored ${ids.length}`);
  revalidatePath("/admin/time-tracker");
  return { ok: true };
}

/* ---- Shared lists (full admin only) ---- */
async function requireFull() {
  const { admin } = await ctx();
  if (!admin) return false;
  return true;
}

export async function addActivityUser(name: string, rate: number) {
  if (!db || !(await requireFull())) return { ok: false, error: "Not allowed." };
  const existing = await db.select({ id: timeActivityUsers.id }).from(timeActivityUsers);
  await db.insert(timeActivityUsers).values({ name: name.trim(), rate, sort: existing.length });
  revalidatePath("/admin/time-tracker");
  return { ok: true };
}
export async function updateActivityUser(id: number, name: string, rate: number) {
  if (!db || !(await requireFull())) return { ok: false, error: "Not allowed." };
  await db.update(timeActivityUsers).set({ name: name.trim(), rate }).where(eq(timeActivityUsers.id, id));
  revalidatePath("/admin/time-tracker");
  return { ok: true };
}
export async function deleteActivityUser(id: number) {
  if (!db || !(await requireFull())) return { ok: false, error: "Not allowed." };
  await db.delete(timeActivityUsers).where(eq(timeActivityUsers.id, id));
  revalidatePath("/admin/time-tracker");
  return { ok: true };
}

export async function addCategory(name: string) {
  if (!db || !(await requireFull())) return { ok: false, error: "Not allowed." };
  await db.insert(timeCategories).values({ name: name.trim().toUpperCase(), sort: 999 });
  revalidatePath("/admin/time-tracker");
  return { ok: true };
}
export async function updateCategory(id: number, name: string) {
  if (!db || !(await requireFull())) return { ok: false, error: "Not allowed." };
  await db.update(timeCategories).set({ name: name.trim().toUpperCase() }).where(eq(timeCategories.id, id));
  revalidatePath("/admin/time-tracker");
  return { ok: true };
}
export async function deleteCategory(id: number) {
  if (!db || !(await requireFull())) return { ok: false, error: "Not allowed." };
  await db.delete(timeCategories).where(eq(timeCategories.id, id));
  revalidatePath("/admin/time-tracker");
  return { ok: true };
}

/** Replace the entire shared matter list (from an admin CSV upload). */
export async function replaceMatters(list: { displayNumber: string; description: string }[]) {
  if (!db || !(await requireFull())) return { ok: false, error: "Not allowed." };
  await db.delete(timeMatters);
  for (let i = 0; i < list.length; i++) {
    await db.insert(timeMatters).values({ displayNumber: list[i].displayNumber, description: list[i].description, sort: i });
  }
  revalidatePath("/admin/time-tracker");
  return { ok: true, count: list.length };
}
