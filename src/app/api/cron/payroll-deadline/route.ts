import { NextResponse } from "next/server";
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { admins, timeClockPunches } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { getSetting } from "@/lib/content";
import { PAYROLL_KEY, PAYROLL_DEFAULT, nextPaydayIso, payrollDeadlineIso, payPeriodForDeadline, type PayrollSchedule } from "@/app/admin/(panel)/timeclock/payroll";
import { ctDate, ctMidnight, fmtDayCT, fmtTimeCT } from "@/lib/ct-time";

export const runtime = "nodejs";

/**
 * Payroll-deadline report. Runs every morning (~7–8 AM Central; see vercel.json)
 * and only actually sends on the ONE day per cycle that is the payroll deadline
 * (payday − lead days, from the admin Payroll schedule). On that day it emails
 * the billing recipients the completed pay period's time-clock report with a CSV
 * attached, so payroll can be finalized before payday.
 */
const RECIPIENTS = ["max@texaslawsmith.com", "probate@texaslawsmith.com", "office@texaslawsmith.com"];
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const hoursBetween = (a: Date, b: Date) => Math.max(0, (b.getTime() - a.getTime()) / 3_600_000);
const midFromIso = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return ctMidnight(y, m, d);
};
const fmtLong = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!db) return NextResponse.json({ ok: true, note: "no database" });

  const now = new Date();
  const { iso: todayIso } = ctDate(now);
  const cfg = await getSetting<PayrollSchedule>(PAYROLL_KEY, PAYROLL_DEFAULT);
  const deadlineIso = payrollDeadlineIso(cfg, todayIso);

  // Only fire on the actual deadline day.
  if (deadlineIso !== todayIso) {
    return NextResponse.json({ ok: true, note: "not a payroll deadline day", todayIso, deadlineIso });
  }

  const paydayIso = nextPaydayIso(cfg, todayIso);
  const { startIso, endIso } = payPeriodForDeadline(cfg, deadlineIso);
  const start = midFromIso(startIso);
  const end = midFromIso(endIso); // exclusive: start of the deadline day (covers through the prior night)

  const hourly = await db.select({ id: admins.id, name: admins.name }).from(admins).where(eq(admins.hourly, true));
  const punches = await db
    .select()
    .from(timeClockPunches)
    .where(and(gte(timeClockPunches.clockIn, start), lt(timeClockPunches.clockIn, end)));

  let grand = 0;
  const csvRows: string[] = ["Person,Day,Clock In,Clock Out,Hours,Note"];
  const sections = hourly.map((person) => {
    const mine = punches.filter((p) => p.adminId === person.id).sort((a, b) => a.clockIn.getTime() - b.clockIn.getTime());
    let total = 0;
    const rows = mine.map((p) => {
      const out = p.clockOut ?? now;
      const hours = hoursBetween(p.clockIn, out);
      total += hours;
      const note = p.autoClosed || p.autoOpen ? "auto — verify" : "";
      csvRows.push(
        [person.name, fmtDayCT(p.clockIn), fmtTimeCT(p.clockIn), p.clockOut ? fmtTimeCT(p.clockOut) : "STILL CLOCKED IN", hours.toFixed(2), note].map(csvCell).join(","),
      );
      return `<tr>
        <td style="padding:4px 12px 4px 0">${fmtDayCT(p.clockIn)}</td>
        <td style="padding:4px 12px 4px 0">${fmtTimeCT(p.clockIn)}</td>
        <td style="padding:4px 12px 4px 0">${p.clockOut ? fmtTimeCT(p.clockOut) : "<em style='color:#b45309'>still clocked in</em>"}</td>
        <td style="padding:4px 12px 4px 0;text-align:right">${hours.toFixed(2)}</td>
        <td style="padding:4px 0;color:#b45309">${note ? "auto — verify" : ""}</td>
      </tr>`;
    });
    grand += total;
    csvRows.push([person.name, "TOTAL", "", "", total.toFixed(2), ""].map(csvCell).join(","));
    return `<h3 style="margin:18px 0 6px">${esc(person.name)} — ${total.toFixed(2)} hrs</h3>${
      rows.length
        ? `<table style="border-collapse:collapse;font-size:14px"><tr style="color:#666;text-align:left"><th style="padding:0 12px 4px 0">Day</th><th style="padding:0 12px 4px 0">In</th><th style="padding:0 12px 4px 0">Out</th><th style="padding:0 12px 4px 0;text-align:right">Hours</th><th style="padding:0 0 4px"></th></tr>${rows.join("")}</table>`
        : `<p style="margin:0;color:#666;font-size:14px">No punches this period.</p>`
    }`;
  });
  csvRows.push(["ALL STAFF", "TOTAL", "", "", grand.toFixed(2), ""].map(csvCell).join(","));

  const lastDay = new Date(end.getTime() - 12 * 3_600_000); // a point inside the last covered day
  const range = `${fmtDayCT(start)} – ${fmtDayCT(lastDay)}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:640px">
      <h2 style="margin:0 0 4px">Payroll is due — pay period report</h2>
      <p style="color:#666;margin:0 0 4px">Finalize by <strong>${fmtLong(deadlineIso)}</strong> · payday <strong>${fmtLong(paydayIso)}</strong></p>
      <p style="color:#666;margin:0 0 8px">Pay period: ${range} (Central Time) — spreadsheet attached</p>
      <p style="margin:0 0 4px;font-size:15px"><strong>Firm total: ${grand.toFixed(2)} hours</strong></p>
      ${sections.join("")}
      <p style="margin:18px 0 0;font-size:12px;color:#999">Automated payroll-deadline report. Rows marked <em>auto — verify</em> were adjusted for a missed clock-out; confirm them under Admin → Time Clock. Change the schedule there under Payroll schedule.</p>
    </div>`;

  const res = await sendEmail({
    to: RECIPIENTS,
    fromName: "T. Maxwell Smith, PLLC — Office",
    subject: `Payroll due ${fmtDayCT(midFromIso(deadlineIso))} — pay period ${range} (${grand.toFixed(2)} hrs)`,
    html,
    attachments: [{ filename: `payroll-${startIso}_${endIso}.csv`, content: csvRows.join("\n") }],
  });

  return NextResponse.json({ ok: true, sent: res.sent, deadlineIso, paydayIso, period: { startIso, endIso }, people: hourly.length, punches: punches.length, grand });
}
