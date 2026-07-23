"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { admins, settings } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { getSetting } from "@/lib/content";
import { BILLING_REMINDER_KEY, BILLING_REMINDER_DEFAULT, type BillingReminder } from "@/lib/billing-reminder";
import { buildMonthReports, loadLogoBytes, renderTimeSummaryPdf, reminderEmailHtml, deptSummaryHtml, sampleReport } from "@/lib/billing/report";

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
