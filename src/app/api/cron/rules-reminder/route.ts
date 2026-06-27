import { NextResponse } from "next/server";
import { getSetting } from "@/lib/content";
import { sendEmail } from "@/lib/email";
import { TEXAS_RULES_KEY, DEFAULT_TEXAS_RULES, TXCOURTS_RULES_URL, type TexasRule } from "@/lib/texas-rules";

export const runtime = "nodejs";

/**
 * Quarterly reminder to refresh the Texas Rules links. Hit by Vercel Cron on the
 * 1st of Jan/Apr/Jul/Oct (see vercel.json); CRON_SECRET-protected. Also guards on
 * the date, so even if the cron fires more often it only emails quarterly. Add
 * ?force=1 (with the secret) to send on demand.
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
    return NextResponse.json({ ok: true, sent: false, reason: "not a quarter start" });
  }

  const to = process.env.RULES_REMINDER_EMAIL || "office@texaslawsmith.com";
  const rules = await getSetting<TexasRule[]>(TEXAS_RULES_KEY, DEFAULT_TEXAS_RULES);
  const rows = rules
    .map((r) => `<tr><td style="padding:4px 16px 4px 0;">${r.title}</td><td style="padding:4px 0;color:#666;white-space:nowrap;">${r.lastAmended || "—"}</td></tr>`)
    .join("");

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.55;">
    <p>Quarterly reminder — time to check the <strong>Texas Rules</strong> for new versions.</p>
    <ol style="padding-left:18px;margin:12px 0;">
      <li>Open the <a href="${TXCOURTS_RULES_URL}">Texas Courts Rules &amp; Standards page</a> and check the "Last Amended" dates.</li>
      <li>For any rule that changed, copy the new PDF link.</li>
      <li>Update it in the admin: <a href="https://texaslawsmith.com/admin/texas-rules">texaslawsmith.com/admin/texas-rules</a>.</li>
    </ol>
    <p style="margin-top:16px;font-weight:bold;">Currently published on the site:</p>
    <table style="border-collapse:collapse;font-size:13px;margin-top:6px;">${rows}</table>
    <p style="margin-top:22px;color:#888;font-size:12px;">Automated reminder from texaslawsmith.com — sent once a quarter.</p>
  </div>`;

  const res = await sendEmail({
    to,
    subject: "Quarterly reminder: review the Texas Rules links",
    html,
    fromName: "Texas Rules Reminder",
  });

  return NextResponse.json({ ok: true, sent: res.sent, reason: res.reason, to });
}
