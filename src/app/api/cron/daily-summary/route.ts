import { NextResponse } from "next/server";
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { admins, timeClockPunches, timeEntries } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { ctDate, ctMidnight, fmtTimeCT } from "@/lib/ct-time";

export const runtime = "nodejs";

/**
 * Nightly summary to Max, fired ~9 PM Central (see vercel.json): the day's
 * total hours billed by all staff on the Time Tracker (per activity user,
 * billable vs. non-billable), and the day's time-clock hours for hourly
 * staff (per person, with clock-in/out punches and open shifts flagged).
 */
const RECIPIENT = "max@texaslawsmith.com";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!db) return NextResponse.json({ ok: true, note: "no database" });

  const now = new Date();
  const { y, m, d, iso: today } = ctDate(now);
  const dayStart = ctMidnight(y, m, d);
  const dayEnd = new Date(dayStart.getTime() + 26 * 3_600_000 < now.getTime() ? now.getTime() : dayStart.getTime() + 24 * 3_600_000);
  const dayLabel = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(now);

  /* ---- Billed hours (Time Tracker entries dated today) ---- */
  const entries = await db.select().from(timeEntries).where(eq(timeEntries.entryDate, today));
  const billedByUser = new Map<string, { hours: number; nonBillable: number }>();
  let billedTotal = 0;
  for (const e of entries) {
    const key = e.activityUserName || "(no user)";
    const row = billedByUser.get(key) ?? { hours: 0, nonBillable: 0 };
    row.hours += e.quantity;
    if (e.nonBillable) row.nonBillable += e.quantity;
    billedByUser.set(key, row);
    billedTotal += e.quantity;
  }
  const billedRows = [...billedByUser.entries()]
    .sort((a, b) => b[1].hours - a[1].hours)
    .map(
      ([name, r]) =>
        `<tr><td style="padding:3px 12px 3px 0">${esc(name)}</td><td style="padding:3px 0;text-align:right">${r.hours.toFixed(2)}${
          r.nonBillable ? ` <span style="color:#999">(${r.nonBillable.toFixed(2)} non-billable)</span>` : ""
        }</td></tr>`,
    );

  /* ---- Time clock (punches starting today) ---- */
  const hourlyStaff = await db.select({ id: admins.id, name: admins.name }).from(admins).where(eq(admins.hourly, true));
  const punches = await db
    .select()
    .from(timeClockPunches)
    .where(and(gte(timeClockPunches.clockIn, dayStart), lt(timeClockPunches.clockIn, dayEnd)));
  let clockTotal = 0;
  const clockRows = hourlyStaff.map((person) => {
    const mine = punches.filter((p) => p.adminId === person.id).sort((a, b) => a.clockIn.getTime() - b.clockIn.getTime());
    let total = 0;
    const spans = mine.map((p) => {
      const out = p.clockOut ?? now;
      total += Math.max(0, (out.getTime() - p.clockIn.getTime()) / 3_600_000);
      return `${fmtTimeCT(p.clockIn)}–${p.clockOut ? fmtTimeCT(p.clockOut) : "<em style='color:#b45309'>on the clock</em>"}`;
    });
    clockTotal += total;
    return `<tr><td style="padding:3px 12px 3px 0">${esc(person.name)}</td><td style="padding:3px 12px 3px 0;color:#666">${spans.join(", ") || "—"}</td><td style="padding:3px 0;text-align:right">${total.toFixed(2)}</td></tr>`;
  });

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:640px">
      <h2 style="margin:0 0 4px">Daily summary — ${dayLabel}</h2>
      <h3 style="margin:14px 0 4px">Hours billed (Time Tracker): ${billedTotal.toFixed(2)}</h3>
      ${billedRows.length ? `<table style="border-collapse:collapse;font-size:14px">${billedRows.join("")}</table>` : `<p style="margin:0;color:#666;font-size:14px">No time entries today.</p>`}
      <h3 style="margin:16px 0 4px">Time clock: ${clockTotal.toFixed(2)} hrs</h3>
      ${clockRows.length ? `<table style="border-collapse:collapse;font-size:14px"><tr style="color:#666;text-align:left"><th style="padding:0 12px 3px 0">Person</th><th style="padding:0 12px 3px 0">Punches</th><th style="padding:0 0 3px;text-align:right">Hours</th></tr>${clockRows.join("")}</table>` : `<p style="margin:0;color:#666;font-size:14px">No hourly staff configured.</p>`}
      <p style="margin:18px 0 0;font-size:12px;color:#999">Automated nightly summary (Central Time). Time clock entries can be fixed under Admin → Time Clock.</p>
    </div>`;

  const res = await sendEmail({
    to: RECIPIENT,
    fromName: "T. Maxwell Smith, PLLC — Office",
    subject: `Daily summary ${today} — billed ${billedTotal.toFixed(2)} · clock ${clockTotal.toFixed(2)}`,
    html,
  });

  return NextResponse.json({ ok: true, sent: res.sent, billedTotal, clockTotal });
}
