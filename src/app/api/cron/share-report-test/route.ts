import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { FIRM } from "@/lib/firm";
import { generateAndStoreReport, reportEmailHtml } from "@/lib/share/reports";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One-off preview: emails the share-folder review (both PDFs) to the owner so
 * they can see how it looks. Scheduled once for 7 PM Central on 2026-07-26
 * (00:00 UTC 2026-07-27; see vercel.json). A settings marker makes it send
 * exactly once, so the annually-recurring schedule never re-fires it.
 */
const MARKER = "share.reportTest.2026-07-26";
const TEST_TO = "maxdev9192@gmail.com";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!db) return NextResponse.json({ ok: true, note: "no database" });

  const [done] = await db.select().from(settings).where(eq(settings.key, MARKER));
  if (done) return NextResponse.json({ ok: true, note: "already sent" });

  const todo = await generateAndStoreReport("todos", "system");
  const docs = await generateAndStoreReport("documents", "system");
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${FIRM.domain}`;
  const html = reportEmailHtml({ todo: todo.todo, docs: docs.docs, reportsUrl: `${base}/admin/share-folders/reports`, isTest: true });

  const res = await sendEmail({
    to: [TEST_TO],
    fromName: `${FIRM.name} — Office`,
    subject: `[Preview] Share-folder review`,
    html,
    attachments: [todo, docs].map((r) => ({ filename: r.filename, content: r.pdf, contentType: "application/pdf" })),
  });

  if (res.sent) {
    await db.insert(settings).values({ key: MARKER, value: { sentAt: new Date().toISOString() }, updatedAt: new Date() }).onConflictDoNothing({ target: settings.key });
  }
  return NextResponse.json({ ok: true, sent: res.sent, to: TEST_TO });
}
