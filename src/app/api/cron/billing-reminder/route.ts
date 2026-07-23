import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { admins, timeEntries } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { getSetting } from "@/lib/content";
import { BILLING_REMINDER_KEY, BILLING_REMINDER_DEFAULT, type BillingReminder } from "@/lib/billing-reminder";
import { CT, ctDate } from "@/lib/ct-time";

export const runtime = "nodejs";

/**
 * Month-end billing reminder (~4 PM Central on the LAST day of each month; see
 * vercel.json — the cron runs daily and this handler self-gates to the final
 * calendar day, so the exact hour drifts an hour with DST like the other jobs).
 *
 *  1. Emails the billing department (configured in Admin → Settings) to start
 *     assembling that month's bills, with a snapshot of who currently has
 *     unbilled time in the Time Tracker.
 *  2. If enabled, emails each person who has unbilled time entries a reminder to
 *     finalize their billing and send it to the billing department.
 *
 * Nothing is sent unless the reminder is switched on in Settings.
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!db) return NextResponse.json({ ok: true, note: "no database" });

  const now = new Date();
  const { y, m, d } = ctDate(now); // m is 1-based
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // last calendar day of CT month m
  if (d !== lastDay) return NextResponse.json({ ok: true, note: "not month-end", ctDay: d, lastDay });

  const cfg = await getSetting<BillingReminder>(BILLING_REMINDER_KEY, BILLING_REMINDER_DEFAULT);
  if (!cfg?.enabled) return NextResponse.json({ ok: true, note: "reminder disabled" });

  const monthLabel = new Intl.DateTimeFormat("en-US", { timeZone: CT, month: "long", year: "numeric" }).format(now);

  /* ---- Who has unbilled (active) time in the system ---- */
  const active = await db.select().from(timeEntries).where(eq(timeEntries.status, "active"));
  const byOwner = new Map<number, { entries: number; hours: number }>();
  for (const e of active) {
    const row = byOwner.get(e.ownerId) ?? { entries: 0, hours: 0 };
    row.entries += 1;
    row.hours += e.quantity;
    byOwner.set(e.ownerId, row);
  }
  const staff = await db.select({ id: admins.id, name: admins.name, email: admins.email }).from(admins);
  const nameOf = new Map(staff.map((s) => [s.id, s.name]));
  const emailOf = new Map(staff.map((s) => [s.id, s.email]));

  const rows = [...byOwner.entries()]
    .map(([id, r]) => ({ id, name: nameOf.get(id) ?? `User ${id}`, ...r }))
    .sort((a, b) => b.hours - a.hours);
  const totalHours = rows.reduce((n, r) => n + r.hours, 0);
  const totalEntries = rows.reduce((n, r) => n + r.entries, 0);

  const recipients = (cfg.recipients ?? []).filter(Boolean);
  let deptSent = false;
  let staffSent = 0;

  /* ---- 1. Billing department prompt ---- */
  if (recipients.length) {
    const tableRows = rows.length
      ? rows
          .map((r) => `<tr><td style="padding:3px 14px 3px 0">${esc(r.name)}</td><td style="padding:3px 14px 3px 0;text-align:right">${r.entries}</td><td style="padding:3px 0;text-align:right">${r.hours.toFixed(2)}</td></tr>`)
          .join("")
      : `<tr><td colspan="3" style="padding:3px 0;color:#666">No unbilled time entries in the system.</td></tr>`;
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:640px">
        <h2 style="margin:0 0 4px">Time to prepare ${esc(monthLabel)} bills</h2>
        <p style="color:#444;margin:0 0 12px">It's the last day of the month. Please start assembling this month's invoices. Here's the unbilled time currently in the Time Tracker:</p>
        <table style="border-collapse:collapse;font-size:14px">
          <tr style="color:#666;text-align:left"><th style="padding:0 14px 4px 0">Staff</th><th style="padding:0 14px 4px 0;text-align:right">Entries</th><th style="padding:0 0 4px;text-align:right">Hours</th></tr>
          ${tableRows}
          <tr style="border-top:1px solid #ddd;font-weight:bold"><td style="padding:6px 14px 0 0">Total</td><td style="padding:6px 14px 0 0;text-align:right">${totalEntries}</td><td style="padding:6px 0 0;text-align:right">${totalHours.toFixed(2)}</td></tr>
        </table>
        <p style="margin:14px 0 0;font-size:12px;color:#999">Automated month-end reminder. Manage recipients under Admin → Settings → Monthly billing reminder.</p>
      </div>`;
    const res = await sendEmail({
      to: recipients,
      fromName: "T. Maxwell Smith, PLLC — Office",
      subject: `Month-end billing — prepare ${monthLabel} bills (${totalHours.toFixed(2)} unbilled hrs)`,
      html,
    });
    deptSent = res.sent;
  }

  /* ---- 2. Individual reminders to staff with unbilled time ---- */
  if (cfg.notifyStaff) {
    const deptLine = recipients.length ? ` to the billing department (${recipients.join(", ")})` : " to the billing department";
    for (const r of rows) {
      const to = emailOf.get(r.id);
      if (!to) continue;
      const html = `
        <div style="font-family:system-ui,sans-serif;max-width:600px">
          <h2 style="margin:0 0 4px">Your ${esc(monthLabel)} billing</h2>
          <p style="color:#444;margin:0 0 10px">It's the last day of the month. You have <strong>${r.entries} unbilled time ${r.entries === 1 ? "entry" : "entries"}</strong> (${r.hours.toFixed(2)} hours) in the Time Tracker.</p>
          <p style="color:#444;margin:0 0 10px">Please finalize your billing and send it${esc(deptLine)} so this month's invoices can go out on time.</p>
          <p style="margin:14px 0 0;font-size:12px;color:#999">Automated month-end reminder from the office. Your entries are in Admin → Time Tracker.</p>
        </div>`;
      const res = await sendEmail({
        to: [to],
        fromName: "T. Maxwell Smith, PLLC — Office",
        subject: `Reminder: submit your ${monthLabel} billing (${r.hours.toFixed(2)} hrs)`,
        html,
      });
      if (res.sent) staffSent += 1;
    }
  }

  return NextResponse.json({ ok: true, month: monthLabel, deptSent, staffReminders: staffSent, staffWithUnbilled: rows.length, totalHours });
}
