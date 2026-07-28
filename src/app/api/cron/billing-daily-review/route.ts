import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { getSetting } from "@/lib/content";
import { FIRM } from "@/lib/firm";
import { ctHour } from "@/lib/billing/report";
import { buildDailyReview, dailyReviewEmailHtml } from "@/lib/billing/daily-review";
import { DAILY_REVIEW_KEY, DAILY_REVIEW_DEFAULT, type DailyReviewConfig } from "@/lib/billing/daily-review-config";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * End-of-day billing review. Scheduled at 23:00 and 00:00 UTC (see vercel.json)
 * and proceeds only at exactly 6 PM Central, so it fires at 6 PM year-round
 * regardless of daylight saving. It emails the billing supervisor(s) a per-person
 * summary of that day's live time entries with a link into the Billing Review
 * tab. If nobody logged any time that day, no email is sent.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!db) return NextResponse.json({ ok: true, note: "no database" });

  const now = new Date();
  if (ctHour(now) !== 18) return NextResponse.json({ ok: true, note: "not 6 PM CT", hour: ctHour(now) });

  const cfg = await getSetting<DailyReviewConfig>(DAILY_REVIEW_KEY, DAILY_REVIEW_DEFAULT);
  if (!cfg?.enabled) return NextResponse.json({ ok: true, note: "review disabled" });

  const data = await buildDailyReview(now);
  if (data.totalEntries === 0) return NextResponse.json({ ok: true, note: "no time entered today" });

  let recipients = (cfg.recipients ?? []).map((s) => s.trim()).filter(Boolean);
  if (recipients.length === 0) {
    const rows = await db.select({ email: admins.email }).from(admins).where(inArray(admins.role, ["owner", "editor"]));
    recipients = rows.map((r) => r.email).filter(Boolean);
  }
  if (recipients.length === 0) return NextResponse.json({ ok: true, note: "no recipients" });

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${FIRM.domain}`;
  const res = await sendEmail({
    to: recipients,
    fromName: `${FIRM.name} — Office`,
    subject: `End-of-day billing review — ${data.dateLabel} (${data.people.length} staff)`,
    html: dailyReviewEmailHtml(data, base),
  });

  return NextResponse.json({ ok: true, sent: res.sent, recipients: recipients.length, people: data.people.length, entries: data.totalEntries });
}
