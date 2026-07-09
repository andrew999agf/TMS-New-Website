"use server";

import { and, eq, isNull, desc } from "drizzle-orm";
import { db } from "@/db";
import { admins, timeClockPunches } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";

export type ClockState = { openSince: string | null };

/** The signed-in user's current punch state (an open punch = on the clock). */
export async function getClockState(): Promise<ClockState> {
  const session = await requireAdmin();
  if (!db) return { openSince: null };
  const [open] = await db
    .select({ clockIn: timeClockPunches.clockIn })
    .from(timeClockPunches)
    .where(and(eq(timeClockPunches.adminId, Number(session.sub)), isNull(timeClockPunches.clockOut)))
    .orderBy(desc(timeClockPunches.clockIn))
    .limit(1);
  return { openSince: open ? open.clockIn.toISOString() : null };
}

/** Punch in. No-op (returns current state) if already on the clock. */
export async function clockIn(): Promise<ClockState> {
  const session = await requireAdmin();
  if (!db) return { openSince: null };
  const me = Number(session.sub);
  const [a] = await db.select({ hourly: admins.hourly }).from(admins).where(eq(admins.id, me));
  if (!a?.hourly) return { openSince: null };
  const existing = await getClockState();
  if (existing.openSince) return existing;
  const [row] = await db.insert(timeClockPunches).values({ adminId: me }).returning({ clockIn: timeClockPunches.clockIn });
  await audit(session.email, "create", "timeclock", String(me), "Clocked in");
  return { openSince: row.clockIn.toISOString() };
}

/** Punch out: closes the open punch. */
export async function clockOut(): Promise<ClockState> {
  const session = await requireAdmin();
  if (!db) return { openSince: null };
  const me = Number(session.sub);
  await db
    .update(timeClockPunches)
    .set({ clockOut: new Date() })
    .where(and(eq(timeClockPunches.adminId, me), isNull(timeClockPunches.clockOut)));
  await audit(session.email, "update", "timeclock", String(me), "Clocked out");
  return { openSince: null };
}

/* ---------------- fix-entry tools (full admins only) ---------------- */

import { isFullAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";

/** Correct a punch's times (fix a wrong in/out or a missing clock-out). */
export async function updatePunch(id: number, clockInIso: string, clockOutIso: string | null) {
  const session = await requireAdmin();
  if (!isFullAdmin(session.role)) return { ok: false as const, error: "Only full admins can edit punches." };
  if (!db) return { ok: false as const, error: "Database not configured." };
  const clockIn = new Date(clockInIso);
  const clockOut = clockOutIso ? new Date(clockOutIso) : null;
  if (isNaN(clockIn.getTime()) || (clockOut && isNaN(clockOut.getTime()))) return { ok: false as const, error: "Invalid date/time." };
  if (clockOut && clockOut <= clockIn) return { ok: false as const, error: "Clock-out must be after clock-in." };
  await db.update(timeClockPunches).set({ clockIn, clockOut }).where(eq(timeClockPunches.id, id));
  await audit(session.email, "update", "timeclock", String(id), "Corrected a punch");
  revalidatePath("/admin/timeclock");
  return { ok: true as const };
}

/** Add a forgotten shift for someone. */
export async function addPunch(adminId: number, clockInIso: string, clockOutIso: string | null) {
  const session = await requireAdmin();
  if (!isFullAdmin(session.role)) return { ok: false as const, error: "Only full admins can add punches." };
  if (!db) return { ok: false as const, error: "Database not configured." };
  const clockIn = new Date(clockInIso);
  const clockOut = clockOutIso ? new Date(clockOutIso) : null;
  if (isNaN(clockIn.getTime()) || (clockOut && isNaN(clockOut.getTime()))) return { ok: false as const, error: "Invalid date/time." };
  if (clockOut && clockOut <= clockIn) return { ok: false as const, error: "Clock-out must be after clock-in." };
  await db.insert(timeClockPunches).values({ adminId, clockIn, clockOut });
  await audit(session.email, "create", "timeclock", String(adminId), "Added a punch manually");
  revalidatePath("/admin/timeclock");
  return { ok: true as const };
}

/** Remove a bad punch. */
export async function deletePunch(id: number) {
  const session = await requireAdmin();
  if (!isFullAdmin(session.role)) return { ok: false as const, error: "Only full admins can delete punches." };
  if (!db) return { ok: false as const, error: "Database not configured." };
  await db.delete(timeClockPunches).where(eq(timeClockPunches.id, id));
  await audit(session.email, "delete", "timeclock", String(id), "Deleted a punch");
  revalidatePath("/admin/timeclock");
  return { ok: true as const };
}
