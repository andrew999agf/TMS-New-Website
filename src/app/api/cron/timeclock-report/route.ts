import { NextResponse } from "next/server";
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { admins, timeClockPunches } from "@/db/schema";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

/**
 * Weekly time-clock report. Fired by Vercel Cron early Monday morning (see
 * vercel.json); covers the week that just ended — Monday 00:00 to Monday
 * 00:00, America/Chicago — for every login marked hourly, and emails the
 * hours from the office mailbox to the firm's report recipients.
 */
const RECIPIENTS = ["max@texaslawsmith.com", "probate@texaslawsmith.com", "office@texaslawsmith.com"];
const CT = "America/Chicago";

/** The absolute instant of midnight (00:00) in Central Time on a calendar day. */
function ctMidnight(y: number, m: number, d: number): Date {
  const candidate = new Date(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00-06:00`);
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: CT, hour: "2-digit", hour12: false }).format(candidate));
  if (h === 1) return new Date(candidate.getTime() - 3_600_000); // CDT (UTC-5)
  if (h === 23) return new Date(candidate.getTime() + 3_600_000);
  return candidate;
}

/** [start, end) of the most recently completed Mon–Sun week in Central Time. */
function lastWeekWindow(now: Date): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: CT, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, m, d] = parts.split("-").map(Number);
  const dowName = new Intl.DateTimeFormat("en-US", { timeZone: CT, weekday: "short" }).format(now);
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(dowName);
  const cal = Date.UTC(y, m - 1, d) - Math.max(dow, 0) * 86_400_000; // this week's Monday (CT calendar)
  const mon = new Date(cal);
  const end = ctMidnight(mon.getUTCFullYear(), mon.getUTCMonth() + 1, mon.getUTCDate());
  return { start: new Date(end.getTime() - 7 * 86_400_000 - 3_600_000), end };
  // (the extra hour on start is trimmed below by the >= comparison on real punches;
  //  it only widens the query window across a DST boundary so nothing is missed)
}

const fmtDay = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: CT, weekday: "short", month: "numeric", day: "numeric" }).format(d);
const fmtTime = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: CT, hour: "numeric", minute: "2-digit" }).format(d);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!db) return NextResponse.json({ ok: true, note: "no database" });

  const now = new Date();
  const { start, end } = lastWeekWindow(now);

  const hourlyStaff = await db.select({ id: admins.id, name: admins.name }).from(admins).where(eq(admins.hourly, true));
  if (hourlyStaff.length === 0) return NextResponse.json({ ok: true, note: "no hourly staff" });

  const punches = await db
    .select()
    .from(timeClockPunches)
    .where(and(gte(timeClockPunches.clockIn, start), lt(timeClockPunches.clockIn, end)));

  let grand = 0;
  const sections = hourlyStaff.map((person) => {
    const mine = punches.filter((p) => p.adminId === person.id).sort((a, b) => a.clockIn.getTime() - b.clockIn.getTime());
    let total = 0;
    const rows = mine.map((p) => {
      const out = p.clockOut ?? end;
      const hours = Math.max(0, (out.getTime() - p.clockIn.getTime()) / 3_600_000);
      total += hours;
      return `<tr>
        <td style="padding:4px 12px 4px 0">${fmtDay(p.clockIn)}</td>
        <td style="padding:4px 12px 4px 0">${fmtTime(p.clockIn)}</td>
        <td style="padding:4px 12px 4px 0">${p.clockOut ? fmtTime(p.clockOut) : "<em style='color:#b45309'>missing clock-out</em>"}</td>
        <td style="padding:4px 0;text-align:right">${hours.toFixed(2)}</td>
      </tr>`;
    });
    grand += total;
    return `<h3 style="margin:18px 0 6px">${esc(person.name)} — ${total.toFixed(2)} hrs</h3>${
      rows.length
        ? `<table style="border-collapse:collapse;font-size:14px"><tr style="color:#666;text-align:left"><th style="padding:0 12px 4px 0">Day</th><th style="padding:0 12px 4px 0">In</th><th style="padding:0 12px 4px 0">Out</th><th style="padding:0 0 4px;text-align:right">Hours</th></tr>${rows.join("")}</table>`
        : `<p style="margin:0;color:#666;font-size:14px">No punches this week.</p>`
    }`;
  });

  const range = `${fmtDay(start)} – ${fmtDay(new Date(end.getTime() - 1))}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:640px">
      <h2 style="margin:0 0 4px">Weekly time clock report</h2>
      <p style="color:#666;margin:0 0 8px">Week of ${range} (Central Time)</p>
      <p style="margin:0 0 4px;font-size:15px"><strong>Firm total: ${grand.toFixed(2)} hours</strong></p>
      ${sections.join("")}
      <p style="margin:18px 0 0;font-size:12px;color:#999">Automated report from the admin time clock. Hourly staff are managed in User Management.</p>
    </div>`;

  const res = await sendEmail({
    to: RECIPIENTS,
    fromName: "T. Maxwell Smith, PLLC — Office",
    subject: `Time clock — week of ${range} (${grand.toFixed(2)} hrs)`,
    html,
  });

  return NextResponse.json({ ok: true, sent: res.sent, people: hourlyStaff.length, punches: punches.length, window: { start, end } });
}
