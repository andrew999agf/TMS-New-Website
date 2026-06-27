import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { getSetting } from "@/lib/content";
import { sendEmail } from "@/lib/email";
import { TEXAS_RULES_KEY, DEFAULT_TEXAS_RULES, TXCOURTS_RULES_URL, type TexasRule } from "@/lib/texas-rules";
import { scrapeAndMergeRules } from "@/lib/texas-rules-scrape";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Quarterly Texas Rules auto-update. On the 1st of Jan/Apr/Jul/Oct (Vercel Cron,
 * see vercel.json) it scrapes txcourts.gov, updates any changed PDF links/dates
 * in the saved settings, and emails a summary. CRON_SECRET-protected and
 * date-guarded; add ?force=1 (with the secret) to run on demand.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const now = new Date();
  const quarterStart = now.getUTCDate() === 1 && [0, 3, 6, 9].includes(now.getUTCMonth());
  if (!force && !quarterStart) {
    return NextResponse.json({ ok: true, ran: false, reason: "not a quarter start" });
  }

  const current = await getSetting<TexasRule[]>(TEXAS_RULES_KEY, DEFAULT_TEXAS_RULES);
  const result = await scrapeAndMergeRules(current);

  // Persist auto-updates (the cron has no admin session, so write the row directly).
  if (result.fetched && result.changes.length > 0 && db) {
    try {
      await db
        .insert(settings)
        .values({ key: TEXAS_RULES_KEY, value: result.rules, updatedAt: new Date() })
        .onConflictDoUpdate({ target: settings.key, set: { value: result.rules, updatedAt: new Date() } });
      revalidatePath("/texas-rules");
    } catch {
      /* non-fatal — still send the summary */
    }
  }

  const to = process.env.RULES_REMINDER_EMAIL || "office@texaslawsmith.com";
  const adminLink = "https://texaslawsmith.com/admin/texas-rules";
  let body: string;
  if (!result.fetched) {
    body = `<p><strong>Heads up:</strong> the automatic rules check couldn't reach txcourts.gov this quarter (${result.error ?? "unknown error"}).</p>
      <p>Please check it by hand — open the <a href="${TXCOURTS_RULES_URL}">Rules &amp; Standards page</a>, then update any changed links or dates at <a href="${adminLink}">${adminLink}</a>.</p>`;
  } else if (result.changes.length === 0) {
    body = `<p>Quarterly check complete — txcourts.gov shows <strong>no changes</strong> to the rules we track. Nothing to do.</p>
      <p>You can review or edit them anytime at <a href="${adminLink}">${adminLink}</a>.</p>`;
  } else {
    const items = result.changes.map((c) => `<li>${c}</li>`).join("");
    body = `<p>Quarterly check complete — <strong>${result.changes.length}</strong> item(s) were updated automatically from txcourts.gov and are already live:</p>
      <ul style="padding-left:18px;">${items}</ul>
      <p>Double-check them at <a href="${adminLink}">${adminLink}</a> if you like.</p>`;
  }

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.55;">
    ${body}
    <p style="margin-top:22px;color:#888;font-size:12px;">Automated quarterly check from texaslawsmith.com.</p>
  </div>`;

  const emailed = await sendEmail({ to, subject: "Texas Rules — quarterly auto-update", html, fromName: "Texas Rules Update" });

  return NextResponse.json({ ok: true, ran: true, fetched: result.fetched, changes: result.changes, emailed: emailed.sent });
}
