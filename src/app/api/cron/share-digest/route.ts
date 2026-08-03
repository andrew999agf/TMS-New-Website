import { NextResponse } from "next/server";
import { and, eq, isNotNull, lte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { shareFolders, shareFiles, shareRecipients } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { shareLeadTeam } from "@/lib/share/notify";
import { FIRM } from "@/lib/firm";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Recipient-upload digest. Runs periodically (see vercel.json) but only does work
 * for folders whose notify clock is due — the clock is armed when a *recipient*
 * (e.g. a client) first uploads a file and left alone during the burst, so the
 * firm gets ONE calm email listing everything a recipient added, rather than one
 * per file. Firm/staff uploads do NOT arm this clock and never trigger an email
 * automatically — staff are asked at upload time whether to notify recipients.
 * The recipients of this digest are the firm "Lead team."
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const baseUrl = () => process.env.NEXT_PUBLIC_SITE_URL || `https://${FIRM.domain}`;
// Just the document's own name — not the whole folder path it lives under.
const docName = (path: string) => path.split("/").pop() || path;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!db) return NextResponse.json({ ok: true, note: "no database" });

  const now = new Date();
  const due = await db.select().from(shareFolders).where(and(isNotNull(shareFolders.notifyDueAt), lte(shareFolders.notifyDueAt, now)));
  if (due.length === 0) return NextResponse.json({ ok: true, folders: 0 });

  const leadTeam = await shareLeadTeam();
  const base = baseUrl();
  let sent = 0;

  for (const folder of due) {
    try {
      const files = await db.select().from(shareFiles).where(and(eq(shareFiles.folderId, folder.id), eq(shareFiles.notified, false)));
      if (files.length === 0) {
        await db.update(shareFolders).set({ notifyDueAt: null }).where(eq(shareFolders.id, folder.id));
        continue;
      }
      // Only files a recipient uploaded. (Firm uploads are marked notified on
      // insert, so they never appear here — but guard anyway.)
      const recipients = await db.select({ email: shareRecipients.email }).from(shareRecipients).where(eq(shareRecipients.folderId, folder.id));
      const recipientEmails = new Set(recipients.map((r) => r.email.toLowerCase()));
      const fromRecipients = files.filter((f) => recipientEmails.has((f.uploadedBy ?? "").toLowerCase()));

      if (fromRecipients.length > 0 && leadTeam.length > 0) {
        const adminLink = `${base}/admin/share-folders/${folder.id}`;
        const rows = fromRecipients.map((f) => `<tr><td style="padding:5px 14px 5px 0;font-size:14px">${esc(docName(f.filename))}</td><td style="padding:5px 0;color:#777;font-size:12px">${esc(f.uploadedBy ?? "")}</td></tr>`).join("");
        const who = fromRecipients[0]?.uploadedBy ? esc(fromRecipients[0].uploadedBy) : "a recipient";
        const html = `
          <div style="font-family:system-ui,sans-serif;color:#1a1a1a;max-width:560px;line-height:1.5">
            <p style="margin:0 0 10px"><strong>${fromRecipients.length}</strong> document${fromRecipients.length === 1 ? "" : "s"} ${fromRecipients.length === 1 ? "was" : "were"} uploaded by ${who} to <strong>${esc(folder.name)}</strong>${folder.caseNumber ? ` (Case ${esc(folder.caseNumber)})` : ""}:</p>
            <table style="border-collapse:collapse;width:100%;margin:0 0 14px">${rows}</table>
            <p style="margin:0"><a href="${adminLink}" style="color:#7a1f2b">Open in the admin portal →</a></p>
          </div>`;
        const res = await sendEmail({ to: leadTeam, fromName: "T. Maxwell Smith, PLLC — Office", subject: `Documents uploaded to ${folder.name}`, html });
        if (res.sent) sent += 1;
      }

      await db.update(shareFiles).set({ notified: true }).where(inArray(shareFiles.id, files.map((f) => f.id)));
      await db.update(shareFolders).set({ notifyDueAt: null }).where(eq(shareFolders.id, folder.id));
    } catch (err) {
      console.error("[share-digest] folder failed:", folder.id, err);
      // Disarm so a broken folder doesn't get retried forever.
      await db.update(shareFolders).set({ notifyDueAt: null }).where(eq(shareFolders.id, folder.id));
    }
  }

  return NextResponse.json({ ok: true, folders: due.length, emailsSent: sent });
}
