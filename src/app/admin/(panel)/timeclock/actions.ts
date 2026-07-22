"use server";

import { and, eq, isNull, desc } from "drizzle-orm";
import { db } from "@/db";
import { admins, timeClockPunches } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";

export type ClockState = { openSince: string | null; error?: string };

/** One retry for transient serverless-Postgres hiccups (cold starts, resets). */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise((r) => setTimeout(r, 250));
    return await fn();
  }
}

/** The signed-in user's current punch state (an open punch = on the clock). */
export async function getClockState(): Promise<ClockState> {
  const session = await requireAdmin();
  if (!db) return { openSince: null };
  try {
    const [open] = await withRetry(() =>
      db!
        .select({ clockIn: timeClockPunches.clockIn })
        .from(timeClockPunches)
        .where(and(eq(timeClockPunches.adminId, Number(session.sub)), isNull(timeClockPunches.clockOut)))
        .orderBy(desc(timeClockPunches.clockIn))
        .limit(1),
    );
    return { openSince: open ? open.clockIn.toISOString() : null };
  } catch {
    return { openSince: null, error: "Couldn't reach the time clock — try again." };
  }
}

/** Punch in. No-op (returns current state) if already on the clock. */
export async function clockIn(): Promise<ClockState> {
  const session = await requireAdmin();
  if (!db) return { openSince: null };
  const me = Number(session.sub);
  try {
    const [a] = await withRetry(() => db!.select({ hourly: admins.hourly }).from(admins).where(eq(admins.id, me)));
    if (!a?.hourly) return { openSince: null };
    const existing = await getClockState();
    if (existing.error) return existing;
    if (existing.openSince) return existing;
    const [row] = await withRetry(() => db!.insert(timeClockPunches).values({ adminId: me }).returning({ clockIn: timeClockPunches.clockIn }));
    await audit(session.email, "create", "timeclock", String(me), "Clocked in");
    return { openSince: row.clockIn.toISOString() };
  } catch {
    return { openSince: null, error: "Clock-in didn't go through — tap again." };
  }
}

/** Punch out: closes the open punch. */
export async function clockOut(): Promise<ClockState> {
  const session = await requireAdmin();
  if (!db) return { openSince: null };
  const me = Number(session.sub);
  try {
    await withRetry(() =>
      db!
        .update(timeClockPunches)
        .set({ clockOut: new Date() })
        .where(and(eq(timeClockPunches.adminId, me), isNull(timeClockPunches.clockOut))),
    );
    await audit(session.email, "update", "timeclock", String(me), "Clocked out");
    return { openSince: null };
  } catch {
    return { openSince: null, error: "Clock-out didn't go through — tap again." };
  }
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
  try {
    await withRetry(() => db!.update(timeClockPunches).set({ clockIn, clockOut }).where(eq(timeClockPunches.id, id)));
  } catch {
    return { ok: false as const, error: "Database hiccup — try again." };
  }
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
  try {
    await withRetry(() => db!.insert(timeClockPunches).values({ adminId, clockIn, clockOut }));
  } catch {
    return { ok: false as const, error: "Database hiccup — try again." };
  }
  await audit(session.email, "create", "timeclock", String(adminId), "Added a punch manually");
  revalidatePath("/admin/timeclock");
  return { ok: true as const };
}

/** Remove a bad punch. */
export async function deletePunch(id: number) {
  const session = await requireAdmin();
  if (!isFullAdmin(session.role)) return { ok: false as const, error: "Only full admins can delete punches." };
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    await withRetry(() => db!.delete(timeClockPunches).where(eq(timeClockPunches.id, id)));
  } catch {
    return { ok: false as const, error: "Database hiccup — try again." };
  }
  await audit(session.email, "delete", "timeclock", String(id), "Deleted a punch");
  revalidatePath("/admin/timeclock");
  return { ok: true as const };
}

/* ---------------- reporting + payroll schedule (full admins) ---------------- */

import { gte, lt } from "drizzle-orm";
import { settings } from "@/db/schema";

export type RangePunch = { id: number; adminId: number; name: string; clockIn: string; clockOut: string | null };

/** Punches in [from, to] for the report builder (full admins only). */
export async function getPunchRange(fromIso: string, toIso: string): Promise<{ punches: RangePunch[]; error?: string }> {
  const session = await requireAdmin();
  if (!isFullAdmin(session.role)) return { punches: [], error: "Admins only." };
  if (!db) return { punches: [], error: "Database not configured." };
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from) return { punches: [], error: "Invalid date range." };
  if (to.getTime() - from.getTime() > 400 * 86_400_000) return { punches: [], error: "Range too large (max ~13 months)." };
  try {
    const names = new Map((await db.select({ id: admins.id, name: admins.name }).from(admins)).map((x) => [x.id, x.name]));
    const rows = await withRetry(() =>
      db!.select().from(timeClockPunches).where(and(gte(timeClockPunches.clockIn, from), lt(timeClockPunches.clockIn, to))),
    );
    return {
      punches: rows
        .sort((a, b) => a.clockIn.getTime() - b.clockIn.getTime())
        .map((p) => ({
          id: p.id,
          adminId: p.adminId,
          name: names.get(p.adminId) ?? `User ${p.adminId}`,
          clockIn: p.clockIn.toISOString(),
          clockOut: p.clockOut ? p.clockOut.toISOString() : null,
        })),
    };
  } catch {
    return { punches: [], error: "Couldn't load that range — try again." };
  }
}

import { PAYROLL_KEY, type PayrollSchedule } from "./payroll";
export type { PayrollSchedule };

/** Save the firm's payroll pattern (drives the payday/deadline banner). */
export async function savePayrollSchedule(cfg: PayrollSchedule) {
  const session = await requireAdmin();
  if (!isFullAdmin(session.role)) return { ok: false as const, error: "Admins only." };
  if (!db) return { ok: false as const, error: "Database not configured." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cfg.anchorPayday)) return { ok: false as const, error: "Pick the anchor payday date." };
  if (!["weekly", "biweekly", "semimonthly", "monthly"].includes(cfg.frequency)) return { ok: false as const, error: "Invalid frequency." };
  const leadDays = Math.max(0, Math.min(14, Math.round(cfg.leadDays)));
  const value = { anchorPayday: cfg.anchorPayday, frequency: cfg.frequency, leadDays };
  await db
    .insert(settings)
    .values({ key: PAYROLL_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  await audit(session.email, "update", "timeclock", PAYROLL_KEY, `Payroll: ${cfg.frequency}, anchor ${cfg.anchorPayday}, lead ${leadDays}d`);
  revalidatePath("/admin/timeclock");
  return { ok: true as const };
}
