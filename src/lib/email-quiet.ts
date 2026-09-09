import "server-only";
import { and, isNull, lte, lt, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { scheduledEmails } from "@/db/schema";
import { sendEmail } from "@/lib/email";

/**
 * Quiet hours for prospective-client email: nothing goes out between
 * 9:30 p.m. and 7:00 a.m. Central. An email "sent" in that window is queued
 * in scheduled_emails instead and the email-queue cron delivers it at the
 * next 7:00 a.m. Firm-internal notifications are unaffected — only the
 * client-facing intake sends opt into this via sendOrScheduleClientEmail.
 */

const TZ = "America/Chicago";
const QUIET_START_MIN = 21 * 60 + 30; // 9:30 p.m.
const QUIET_END_MIN = 7 * 60; // 7:00 a.m.

function centralClock(d: Date): { ymd: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  // hour12:false can yield "24" for midnight in some engines.
  const h = Number(get("hour")) % 24;
  return { ymd: `${get("year")}-${get("month")}-${get("day")}`, minutes: h * 60 + Number(get("minute")) };
}

/** The instant that reads as `${ymd} ${hm}` on a Central-time clock, across DST. */
function centralInstant(ymd: string, hm: string): Date {
  for (const off of ["-05:00", "-06:00"]) {
    const d = new Date(`${ymd}T${hm}:00${off}`);
    const c = centralClock(d);
    const [hh, mm] = hm.split(":").map(Number);
    if (c.ymd === ymd && c.minutes === hh * 60 + mm) return d;
  }
  return new Date(`${ymd}T${hm}:00-06:00`);
}

/** When quiet hours are in effect, the next 7:00 a.m. Central; otherwise null. */
export function quietHoursSendAt(now = new Date()): Date | null {
  const c = centralClock(now);
  if (c.minutes >= QUIET_START_MIN) {
    // Late evening — tomorrow morning. +24h then re-read the Central date
    // (correct across DST, where the calendar day still advances by one).
    const tomorrow = centralClock(new Date(now.getTime() + 24 * 3600_000)).ymd;
    return centralInstant(tomorrow, "07:00");
  }
  if (c.minutes < QUIET_END_MIN) return centralInstant(c.ymd, "07:00");
  return null;
}

/** "7:00 a.m. tomorrow" / "7:00 a.m. this morning" for UI messages. */
export function quietSendLabel(sendAt: Date, now = new Date()): string {
  return centralClock(sendAt).ymd === centralClock(now).ymd ? "7:00 a.m. this morning" : "7:00 a.m. tomorrow morning";
}

export type ClientEmailResult = { sent: boolean; scheduled?: boolean; sendLabel?: string; reason?: string };

/**
 * Send a prospective-client email now — or, during quiet hours, queue it for
 * the next 7:00 a.m. Central. A queued email reports sent: true so callers
 * treat it as success, plus scheduled/sendLabel for the UI message. If the
 * queue table isn't there yet (Database updates not run), it falls back to
 * sending immediately rather than losing the email.
 */
export async function sendOrScheduleClientEmail(opts: {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  html: string;
  fromName?: string;
  headers?: Record<string, string>;
  createdBy?: string;
}): Promise<ClientEmailResult> {
  const sendAt = quietHoursSendAt();
  if (sendAt && db) {
    const to = (Array.isArray(opts.to) ? opts.to : [opts.to]).map((s) => s.trim()).filter(Boolean);
    const cc = (Array.isArray(opts.cc) ? opts.cc : opts.cc ? [opts.cc] : []).map((s) => s.trim()).filter(Boolean);
    if (to.length === 0) return { sent: false, reason: "no-recipients" };
    try {
      await db.insert(scheduledEmails).values({
        to, cc, subject: opts.subject, html: opts.html,
        fromName: opts.fromName ?? null, headers: opts.headers ?? {},
        sendAt, createdBy: opts.createdBy ?? null,
      });
      return { sent: true, scheduled: true, sendLabel: quietSendLabel(sendAt) };
    } catch {
      // Table missing or insert failed — better to send now than to drop it.
    }
  }
  const res = await sendEmail(opts);
  return { sent: res.sent, reason: res.reason };
}

/** Deliver everything due (send_at <= now, not yet sent, < 6 attempts). */
export async function flushScheduledEmails(): Promise<{ due: number; sent: number; failed: number }> {
  if (!db) return { due: 0, sent: 0, failed: 0 };
  const now = new Date();
  const due = await db
    .select()
    .from(scheduledEmails)
    .where(and(isNull(scheduledEmails.sentAt), lte(scheduledEmails.sendAt, now), lt(scheduledEmails.attempts, 6)))
    .orderBy(scheduledEmails.sendAt);
  let sent = 0, failed = 0;
  for (const row of due) {
    const to = (Array.isArray(row.to) ? row.to : []).map(String);
    const cc = (Array.isArray(row.cc) ? row.cc : []).map(String);
    try {
      const res = await sendEmail({
        to, cc: cc.length ? cc : undefined, subject: row.subject, html: row.html,
        fromName: row.fromName ?? undefined,
        headers: row.headers && typeof row.headers === "object" ? (row.headers as Record<string, string>) : undefined,
      });
      if (res.sent) {
        sent++;
        await db.update(scheduledEmails).set({ sentAt: new Date(), lastError: "" }).where(eq(scheduledEmails.id, row.id));
      } else {
        failed++;
        await db.update(scheduledEmails).set({ attempts: sql`${scheduledEmails.attempts} + 1`, lastError: res.reason ?? "send failed" }).where(eq(scheduledEmails.id, row.id));
      }
    } catch (err) {
      failed++;
      await db.update(scheduledEmails).set({ attempts: sql`${scheduledEmails.attempts} + 1`, lastError: (err as Error).message }).where(eq(scheduledEmails.id, row.id)).catch(() => {});
    }
  }
  return { due: due.length, sent, failed };
}
