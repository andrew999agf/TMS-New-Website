import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { getSetting } from "@/lib/content";
import { FIRM } from "@/lib/firm";
import { SHARE_REPORT_KEY, SHARE_REPORT_DEFAULT, type ShareReportConfig } from "@/lib/share/reports-config";
import { generateAndStoreReport, autoArchiveOldReports, reportEmailHtml, type GeneratedReport } from "@/lib/share/reports";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Monthly share-folder review ("tickler"). Scheduled on the 1st of each month
 * (see vercel.json). Emails the admin a review of open to-do tasks / drop
 * folders and documents uploaded last month, each attached as a PDF, and files
 * both reports in the admin reports area. Old reports are auto-archived after
 * six months on every run.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!db) return NextResponse.json({ ok: true, note: "no database" });

  const archived = await autoArchiveOldReports(new Date());

  const cfg = await getSetting<ShareReportConfig>(SHARE_REPORT_KEY, SHARE_REPORT_DEFAULT);
  if (!cfg?.enabled) return NextResponse.json({ ok: true, note: "report disabled", archived });

  // Recipients: the configured list, or all full admins.
  let recipients = (cfg.recipients ?? []).map((s) => s.trim()).filter(Boolean);
  if (recipients.length === 0) {
    const rows = await db.select({ email: admins.email, role: admins.role }).from(admins).where(inArray(admins.role, ["owner", "editor"]));
    recipients = rows.map((r) => r.email).filter(Boolean);
  }
  if (recipients.length === 0) return NextResponse.json({ ok: true, note: "no recipients", archived });

  const now = new Date();
  const reports: GeneratedReport[] = [];
  if (cfg.includeTodos) reports.push(await generateAndStoreReport("todos", "system", now));
  if (cfg.includeDocuments) reports.push(await generateAndStoreReport("documents", "system", now));
  if (reports.length === 0) return NextResponse.json({ ok: true, note: "nothing enabled", archived });

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${FIRM.domain}`;
  const todo = reports.find((r) => r.kind === "todos")?.todo;
  const docs = reports.find((r) => r.kind === "documents")?.docs;
  const html = reportEmailHtml({ todo, docs, reportsUrl: `${base}/admin/share-folders/reports` });

  const res = await sendEmail({
    to: recipients,
    fromName: `${FIRM.name} — Office`,
    subject: `Share-folder review — ${new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(now)}`,
    html,
    attachments: reports.map((r) => ({ filename: r.filename, content: r.pdf, contentType: "application/pdf" })),
  });

  return NextResponse.json({ ok: true, sent: res.sent, recipients: recipients.length, reports: reports.map((r) => r.kind), archived });
}
