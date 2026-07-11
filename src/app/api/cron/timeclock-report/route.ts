import { NextResponse } from "next/server";
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { admins, timeClockPunches } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { ctWeekStart, fmtDayCT, fmtTimeCT } from "@/lib/ct-time";

export const runtime = "nodejs";

/**
 * Weekly time-clock report, fired Saturday evening (~8:00 PM Central; see
 * vercel.json — cron runs in UTC so the exact local time shifts an hour with
 * DST). Covers the week so far — Monday 00:00 Central through send time —
 * for every login marked hourly. Sent from the office mailbox with a CSV
 * spreadsheet attached.
 */
const RECIPIENTS = ["max@texaslawsmith.com", "probate@texaslawsmith.com", "office@texaslawsmith.com"];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!db) return NextResponse.json({ ok: true, note: "no database" });

  const now = new Date();
  const start = ctWeekStart(now);
  const end = now;

  const hourlyStaff = await db.select({ id: admins.id, name: admins.name }).from(admins).where(eq(admins.hourly, true));
  if (hourlyStaff.length === 0) return NextResponse.json({ ok: true, note: "no hourly staff" });

  const punches = await db
    .select()
    .from(timeClockPunches)
    .where(and(gte(timeClockPunches.clockIn, start), lt(timeClockPunches.clockIn, end)));

  let grand = 0;
  const csvRows: string[] = ["Person,Day,Clock In,Clock Out,Hours"];
  const sections = hourlyStaff.map((person) => {
    const mine = punches.filter((p) => p.adminId === person.id).sort((a, b) => a.clockIn.getTime() - b.clockIn.getTime());
    let total = 0;
    const rows = mine.map((p) => {
      const out = p.clockOut ?? end;
      const hours = Math.max(0, (out.getTime() - p.clockIn.getTime()) / 3_600_000);
      total += hours;
      csvRows.push(
        [person.name, fmtDayCT(p.clockIn), fmtTimeCT(p.clockIn), p.clockOut ? fmtTimeCT(p.clockOut) : "STILL CLOCKED IN", hours.toFixed(2)]
          .map(csvCell)
          .join(","),
      );
      return `<tr>
        <td style="padding:4px 12px 4px 0">${fmtDayCT(p.clockIn)}</td>
        <td style="padding:4px 12px 4px 0">${fmtTimeCT(p.clockIn)}</td>
        <td style="padding:4px 12px 4px 0">${p.clockOut ? fmtTimeCT(p.clockOut) : "<em style='color:#b45309'>still clocked in</em>"}</td>
        <td style="padding:4px 0;text-align:right">${hours.toFixed(2)}</td>
      </tr>`;
    });
    grand += total;
    csvRows.push([person.name, "TOTAL", "", "", total.toFixed(2)].map(csvCell).join(","));
    return `<h3 style="margin:18px 0 6px">${esc(person.name)} — ${total.toFixed(2)} hrs</h3>${
      rows.length
        ? `<table style="border-collapse:collapse;font-size:14px"><tr style="color:#666;text-align:left"><th style="padding:0 12px 4px 0">Day</th><th style="padding:0 12px 4px 0">In</th><th style="padding:0 12px 4px 0">Out</th><th style="padding:0 0 4px;text-align:right">Hours</th></tr>${rows.join("")}</table>`
        : `<p style="margin:0;color:#666;font-size:14px">No punches this week.</p>`
    }`;
  });
  csvRows.push(["ALL STAFF", "TOTAL", "", "", grand.toFixed(2)].map(csvCell).join(","));

  const range = `${fmtDayCT(start)} – ${fmtDayCT(end)}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:640px">
      <h2 style="margin:0 0 4px">Weekly time clock report</h2>
      <p style="color:#666;margin:0 0 8px">Week of ${range} (Central Time) — spreadsheet attached</p>
      <p style="margin:0 0 4px;font-size:15px"><strong>Firm total: ${grand.toFixed(2)} hours</strong></p>
      ${sections.join("")}
      <p style="margin:18px 0 0;font-size:12px;color:#999">Automated report from the admin time clock. Fix entries under Admin → Time Clock; hourly staff are managed in User Management.</p>
    </div>`;

  const res = await sendEmail({
    to: RECIPIENTS,
    fromName: "T. Maxwell Smith, PLLC — Office",
    subject: `Time clock — week of ${range} (${grand.toFixed(2)} hrs)`,
    html,
    attachments: [{ filename: `time-clock-${start.toISOString().slice(0, 10)}.csv`, content: csvRows.join("\n") }],
  });

  return NextResponse.json({ ok: true, sent: res.sent, people: hourlyStaff.length, punches: punches.length });
}
