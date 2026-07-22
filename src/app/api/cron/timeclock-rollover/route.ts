import { NextResponse } from "next/server";
import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { admins, timeClockPunches } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { getSetting } from "@/lib/content";
import { PAYROLL_KEY, PAYROLL_DEFAULT, DEFAULT_ALERT_HOURS, type PayrollSchedule } from "@/app/admin/(panel)/timeclock/payroll";
import { ctDate, ctMidnight, ctNextMidnight, ctPrevMidnight, fmtDayCT } from "@/lib/ct-time";

export const runtime = "nodejs";

/**
 * Nightly time-clock rollover + anomaly alert (~00:20 Central; see vercel.json,
 * which runs in UTC). Two jobs:
 *
 *  1. ROLLOVER. Anyone still clocked in from a prior day is clocked OUT at the
 *     midnight that ended their clock-in day and clocked back IN at that same
 *     midnight for the new day — so a single day can never rack up 25+ hours,
 *     and a forgotten punch is split onto the correct days instead of one. A
 *     shift only auto-continues ONCE (the re-opened half is flagged); if it is
 *     still open the following night it is closed without re-opening, so a
 *     totally-forgotten punch can't chain into endless 24-hour days.
 *
 *  2. ALERT. The billing recipients are emailed when yesterday's total for any
 *     hourly person exceeds the configured threshold (default 11h) OR they were
 *     clocked in past midnight — both strong signs of a missed clock-out.
 */
const RECIPIENTS = ["max@texaslawsmith.com", "probate@texaslawsmith.com", "office@texaslawsmith.com"];
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const hoursBetween = (a: Date, b: Date) => Math.max(0, (b.getTime() - a.getTime()) / 3_600_000);

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!db) return NextResponse.json({ ok: true, note: "no database" });

  const now = new Date();
  const { y, m, d } = ctDate(now);
  const todayMid = ctMidnight(y, m, d); // start of today (Central)

  /* ---- 1. Roll over shifts left open across midnight ---- */
  const open = await db.select().from(timeClockPunches).where(isNull(timeClockPunches.clockOut));
  const work = open.filter((p) => p.clockIn.getTime() < todayMid.getTime());
  const rolledPersons = new Set<number>();
  let rolled = 0;
  let guard = 0;
  while (work.length && guard++ < 500) {
    const p = work.shift()!;
    if (p.clockIn.getTime() >= todayMid.getTime()) continue; // now a current-day shift — leave it running
    const closeAt = ctNextMidnight(p.clockIn);
    await db.update(timeClockPunches).set({ clockOut: closeAt, autoClosed: true }).where(eq(timeClockPunches.id, p.id));
    rolled++;
    rolledPersons.add(p.adminId);
    // Continue the shift into the next day — but only once (the re-opened half is
    // flagged autoOpen, and an already-autoOpen punch is never re-opened again).
    if (!p.autoOpen) {
      const [row] = await db
        .insert(timeClockPunches)
        .values({ adminId: p.adminId, clockIn: closeAt, autoOpen: true })
        .returning();
      if (row && row.clockIn.getTime() < todayMid.getTime()) work.push(row); // catch up if the cron missed days
    }
  }

  /* ---- 2. Anomaly alert for the day that just ended ---- */
  const cfg = await getSetting<PayrollSchedule>(PAYROLL_KEY, PAYROLL_DEFAULT);
  const alertHours = Math.max(4, Math.min(24, Math.round(cfg.alertHours ?? DEFAULT_ALERT_HOURS)));
  const yEnd = todayMid;
  const yStart = ctPrevMidnight(todayMid);

  const hourly = await db.select({ id: admins.id, name: admins.name }).from(admins).where(eq(admins.hourly, true));
  const dayPunches = await db
    .select()
    .from(timeClockPunches)
    .where(and(gte(timeClockPunches.clockIn, yStart), lt(timeClockPunches.clockIn, yEnd)));

  type Flag = { name: string; hours: number; reasons: string[] };
  const flags: Flag[] = [];
  for (const person of hourly) {
    const mine = dayPunches.filter((p) => p.adminId === person.id);
    if (mine.length === 0 && !rolledPersons.has(person.id)) continue;
    const total = mine.reduce((n, p) => n + hoursBetween(p.clockIn, p.clockOut ?? now), 0);
    const crossedMidnight = rolledPersons.has(person.id) || mine.some((p) => p.autoClosed);
    const reasons: string[] = [];
    if (total > alertHours) reasons.push(`worked ${total.toFixed(2)} hrs (over ${alertHours})`);
    if (crossedMidnight) reasons.push("was still clocked in past midnight — auto-adjusted");
    if (reasons.length) flags.push({ name: person.name, hours: total, reasons });
  }

  let alerted = 0;
  if (flags.length) {
    const rows = flags
      .map(
        (f) =>
          `<tr><td style="padding:4px 12px 4px 0"><strong>${esc(f.name)}</strong></td><td style="padding:4px 0;color:#b45309">${f.reasons.map(esc).join("; ")}</td></tr>`,
      )
      .join("");
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:640px">
        <h2 style="margin:0 0 4px">Time clock — attention needed</h2>
        <p style="color:#666;margin:0 0 12px">${fmtDayCT(yStart)} (Central Time). Please verify and correct these under Admin → Time Clock before payroll.</p>
        <table style="border-collapse:collapse;font-size:14px">${rows}</table>
        <p style="margin:14px 0 0;font-size:13px;color:#666">Shifts left open across midnight were automatically clocked out at 12:00 AM and clocked back in for the new day; the real times still need to be confirmed. Days marked <em>auto · review</em> in the Time Clock are these adjustments.</p>
        <p style="margin:12px 0 0;font-size:12px;color:#999">Automated time-clock check. Threshold: over ${alertHours} hours in a day.</p>
      </div>`;
    const res = await sendEmail({
      to: RECIPIENTS,
      fromName: "T. Maxwell Smith, PLLC — Office",
      subject: `Time clock alert — ${flags.length} to review (${fmtDayCT(yStart)})`,
      html,
    });
    alerted = res.sent ? flags.length : 0;
  }

  return NextResponse.json({ ok: true, rolled, flagged: flags.length, alerted, threshold: alertHours });
}
