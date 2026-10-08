"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { admins, settings } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { sendEmail, emailStatus, describeSendFailure } from "@/lib/email";
import { getSetting } from "@/lib/content";
import { BILLING_REMINDER_KEY, BILLING_REMINDER_DEFAULT, type BillingReminder } from "@/lib/billing-reminder";
import { buildMonthReports, loadLogoBytes, renderTimeSummaryPdf, reminderEmailHtml, deptSummaryHtml, sampleReport } from "@/lib/billing/report";
import { buildDailyReview, dailyReviewEmailHtml } from "@/lib/billing/daily-review";
import { FIRM } from "@/lib/firm";

export async function saveSetting(key: string, value: unknown) {
  const session = await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  await audit(session.email, "update", "settings", key, `Updated ${key}`);
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * "Is email working?" — sends a one-line test to the signed-in admin and
 * reports the mail server's exact answer, translated into what to fix.
 */
export async function sendEmailTest() {
  const session = await requireAdmin();
  const status = emailStatus();
  if (status.method === "none") return { ok: false as const, status, error: describeSendFailure("not-configured") };
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.5"><p>This is a test message from the ${FIRM.name} admin panel.</p><p style="color:#777;font-size:13px">Sent ${new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })} by ${session.email}. If you got this, email is working.</p></div>`;
  const started = Date.now();
  const res = await sendEmail({ to: session.email, fromName: `${FIRM.name} — Admin`, subject: "Test: email is working", html });
  const ms = Date.now() - started;
  await audit(session.email, "send", "settings", "email-test", res.sent ? `Email test sent (${ms} ms)` : `Email test FAILED: ${(res.reason ?? "").slice(0, 120)}`);
  if (res.sent) return { ok: true as const, status, ms, to: session.email };
  return { ok: false as const, status, error: describeSendFailure(res.reason), raw: (res.reason ?? "").slice(0, 300) };
}

/**
 * Send the month-end billing reminder to the CURRENT admin as a test, so they
 * can preview both emails (the personal reminder with its letterhead PDF, and
 * the billing-department roster) without waiting for month-end. Uses real
 * current-month data for the tester; falls back to a sample if they have none.
 */
export async function sendBillingReminderTest() {
  const session = await requireAdmin();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const ownerId = Number(session.sub);
  const now = new Date();
  const [me] = await db.select({ name: admins.name, email: admins.email }).from(admins).where(eq(admins.id, ownerId));
  const name = me?.name || session.email;
  const email = me?.email || session.email;
  const cfg = await getSetting<BillingReminder>(BILLING_REMINDER_KEY, BILLING_REMINDER_DEFAULT);
  const recipients = (cfg?.recipients ?? []).filter(Boolean);

  try {
    const { month, people } = await buildMonthReports(now);
    // Preview with the tester's own worker report if we can find it (matched by
    // email or name); otherwise a sample so the layout is still visible.
    const mine = people.find((p) => (p.email && p.email.toLowerCase() === email.toLowerCase()) || p.name.trim().toLowerCase() === name.trim().toLowerCase());
    const rep = mine ?? sampleReport(name, email);
    const logo = await loadLogoBytes();
    const pdf = await renderTimeSummaryPdf(rep, month, logo);
    const personal = await sendEmail({
      to: [email],
      fromName: "T. Maxwell Smith, PLLC — Office",
      subject: `[TEST] Submit your ${month.monthLabel} billing`,
      html: reminderEmailHtml(rep, month, recipients, true),
      attachments: [{ filename: `Time Summary — ${rep.name} — ${month.monthLabel}.pdf`, content: pdf, contentType: "application/pdf" }],
    });
    const dept = await sendEmail({
      to: [email],
      fromName: "T. Maxwell Smith, PLLC — Office",
      subject: `[TEST] Month-end billing — prepare ${month.monthLabel} bills`,
      html: deptSummaryHtml(people.length ? people : [rep], month, true),
    });
    if (!personal.sent && !dept.sent) {
      return { ok: false as const, error: personal.reason === "not-configured" ? "Email isn't configured on the server yet." : `Send failed (${personal.reason ?? "unknown"}).` };
    }
    await audit(session.email, "create", "settings", "billing.test", "Sent billing reminder test");
    return { ok: true as const, sentTo: email };
  } catch (err) {
    console.error("[billing] test send failed:", err);
    return { ok: false as const, error: err instanceof Error ? err.message.slice(0, 160) : "Test failed." };
  }
}

/** Send the current admin a test of the end-of-day billing review email, using
 *  today's live entries (or a note that there are none yet). */
export async function sendDailyReviewTest() {
  const session = await requireAdmin();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [me] = await db.select({ email: admins.email }).from(admins).where(eq(admins.id, Number(session.sub)));
    const to = me?.email || session.email;
    const data = await buildDailyReview(new Date());
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${FIRM.domain}`;
    const html = data.totalEntries === 0
      ? `<div style="font-family:Georgia,serif;max-width:560px"><p>No live time entries have been logged for <strong>${data.dateLabel}</strong> yet — the real 6 PM email would be skipped on a day like this.</p><p><a href="${base}/admin/billing-review" style="color:#7a1f2b">Open the Billing Review tab</a></p></div>`
      : dailyReviewEmailHtml(data, base, true);
    const res = await sendEmail({ to, fromName: `${FIRM.name} — Office`, subject: `[Test] End-of-day billing review — ${data.dateLabel}`, html });
    return res.sent ? { ok: true as const, to } : { ok: false as const, error: "Email isn't configured, or sending failed." };
  } catch (err) {
    console.error("[daily-review] test failed:", err);
    return { ok: false as const, error: "Test failed." };
  }
}
