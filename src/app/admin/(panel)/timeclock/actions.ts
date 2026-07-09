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
