import { NextResponse } from "next/server";
import { db } from "@/db";
import { sendEmail } from "@/lib/email";
import { getSetting } from "@/lib/content";
import { BILLING_REMINDER_KEY, BILLING_REMINDER_DEFAULT, type BillingReminder } from "@/lib/billing-reminder";
import { buildMonthReports, ctMonthInfo, ctHour, loadLogoBytes, renderTimeSummaryPdf, reminderEmailHtml, deptSummaryHtml } from "@/lib/billing/report";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Month-end billing reminder. The cron is scheduled twice (21:00 and 22:00 UTC;
 * see vercel.json) and this handler proceeds only at exactly 4 PM Central on the
 * LAST calendar day of the month — so it fires at 4 PM year-round regardless of
 * daylight saving. When it fires it:
 *
 *   1. Emails the billing department a roster of everyone's hours this month.
 *   2. Emails each person who logged billable hours a nicely formatted reminder
 *      with a letterhead PDF of the cases they worked and the hours on each
 *      (billable / non-billable / total — never any dollar figures).
 *
 * Nothing is sent unless the reminder is switched on in Admin → Settings.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!db) return NextResponse.json({ ok: true, note: "no database" });

  const now = new Date();
  const month = ctMonthInfo(now);
  const ctDay = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", day: "2-digit" }).format(now));
  if (ctHour(now) !== 16) return NextResponse.json({ ok: true, note: "not 4 PM CT", hour: ctHour(now) });
  if (ctDay !== month.lastDay) return NextResponse.json({ ok: true, note: "not month-end", ctDay, lastDay: month.lastDay });

  const cfg = await getSetting<BillingReminder>(BILLING_REMINDER_KEY, BILLING_REMINDER_DEFAULT);
  if (!cfg?.enabled) return NextResponse.json({ ok: true, note: "reminder disabled" });

  const { owners } = await buildMonthReports(now);
  const recipients = (cfg.recipients ?? []).filter(Boolean);
  let deptSent = false;
  let staffSent = 0;

  // 1. Billing-department roster.
  if (recipients.length) {
    const tB = owners.reduce((n, o) => n + o.billable, 0);
    const res = await sendEmail({
      to: recipients,
      fromName: "T. Maxwell Smith, PLLC — Office",
      subject: `Month-end billing — prepare ${month.monthLabel} bills (${tB.toFixed(2)} billable hrs)`,
      html: deptSummaryHtml(owners, month),
    });
    deptSent = res.sent;
  }

  // 2. Personal reminders with the letterhead PDF.
  if (cfg.notifyStaff) {
    const logo = await loadLogoBytes();
    for (const o of owners) {
      if (!o.email) continue;
      const pdf = await renderTimeSummaryPdf(o, month, logo);
      const res = await sendEmail({
        to: [o.email],
        fromName: "T. Maxwell Smith, PLLC — Office",
        subject: `Submit your ${month.monthLabel} billing (${o.billable.toFixed(2)} billable hrs)`,
        html: reminderEmailHtml(o, month, recipients),
        attachments: [{ filename: `Time Summary — ${o.name} — ${month.monthLabel}.pdf`, content: pdf, contentType: "application/pdf" }],
      });
      if (res.sent) staffSent += 1;
    }
  }

  return NextResponse.json({ ok: true, month: month.monthLabel, deptSent, staffReminders: staffSent, staffWithBillable: owners.length });
}
