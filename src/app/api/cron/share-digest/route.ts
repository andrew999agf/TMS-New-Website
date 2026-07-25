import { NextResponse } from "next/server";
import { and, eq, isNotNull, lte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { shareFolders, shareFiles, shareRecipients } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { getSetting } from "@/lib/content";
import { SHARE_CC_KEY, SHARE_CC_DEFAULT } from "@/lib/share/settings";
import { FIRM } from "@/lib/firm";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * "New documents" digest. Runs periodically (see vercel.json) but only does work
 * for folders whose notify clock is due — the clock is armed when a file is first
 * uploaded and left alone during the burst, so recipients get ONE calm email
 * listing everything added, ~12h after the first upload. It never scans every
 * file: it only looks at folders that were actually touched.
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const baseUrl = () => process.env.NEXT_PUBLIC_SITE_URL || `https://${FIRM.domain}`;

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

  const cc = (await getSetting<string[]>(SHARE_CC_KEY, SHARE_CC_DEFAULT)) ?? SHARE_CC_DEFAULT;
  const base = baseUrl();
  let sent = 0;

  for (const folder of due) {
    try {
      const files = await db.select().from(shareFiles).where(and(eq(shareFiles.folderId, folder.id), eq(shareFiles.notified, false)));
      if (files.length === 0) {
        await db.update(shareFolders).set({ notifyDueAt: null }).where(eq(shareFolders.id, folder.id));
        continue;
      }
      const recipients = (await db.select().from(shareRecipients).where(eq(shareRecipients.folderId, folder.id)))
        .filter((r) => !r.revoked && (!r.expiresAt || r.expiresAt > now));
      const recipientEmails = new Set(recipients.map((r) => r.email.toLowerCase()));

      // Notify each active recipient of the new files they didn't upload themselves.
      for (const r of recipients) {
        const theirs = files.filter((f) => (f.uploadedBy ?? "").toLowerCase() !== r.email.toLowerCase());
        if (theirs.length === 0) continue;
        const link = `${base}/share/${r.token}`;
        const rows = theirs
          .map(
            (f) =>
              `<tr><td style="padding:6px 14px 6px 0;font-size:14px">${esc(f.filename)}</td>` +
              `<td style="padding:6px 0;text-align:right"><a href="${link}" style="font-size:12px;color:#7a1f2b;text-decoration:none">View →</a></td></tr>`,
          )
          .join("");
        const html = `
          <div style="font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;max-width:560px;line-height:1.55">
            <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a1f2b;margin:0 0 16px">${esc(FIRM.name)}</p>
            <p style="margin:0 0 12px">${theirs.length === 1 ? "A new document was" : `${theirs.length} new documents were`} added to the folder shared with you — <strong>${esc(folder.name)}</strong>:</p>
            <table style="border-collapse:collapse;width:100%;margin:0 0 16px">${rows}</table>
            <p style="margin:0 0 18px"><a href="${link}" style="background:#7a1f2b;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;font-size:13px">Open the folder</a></p>
            <p style="margin:0;font-size:12px;color:#999">You may be asked to sign in or enter a one-time code to open it. Questions? Contact <a href="mailto:${FIRM.email}" style="color:#999">${FIRM.email}</a>.</p>
          </div>`;
        const res = await sendEmail({ to: r.email, fromName: `${FIRM.name} — Secure Share`, subject: `New document${theirs.length === 1 ? "" : "s"} in ${folder.name}`, html });
        if (res.sent) sent += 1;
      }

      // Let the firm know when a recipient (e.g. a client) dropped documents in.
      const fromRecipients = files.filter((f) => recipientEmails.has((f.uploadedBy ?? "").toLowerCase()));
      if (fromRecipients.length > 0 && cc.length > 0) {
        const adminLink = `${base}/admin/share-folders/${folder.id}`;
        const rows = fromRecipients.map((f) => `<tr><td style="padding:5px 14px 5px 0;font-size:14px">${esc(f.filename)}</td><td style="padding:5px 0;color:#777;font-size:12px">${esc(f.uploadedBy ?? "")}</td></tr>`).join("");
        const html = `
          <div style="font-family:system-ui,sans-serif;color:#1a1a1a;max-width:560px;line-height:1.5">
            <p style="margin:0 0 10px"><strong>${fromRecipients.length}</strong> document${fromRecipients.length === 1 ? "" : "s"} were uploaded by a recipient to <strong>${esc(folder.name)}</strong>${folder.caseNumber ? ` (Case ${esc(folder.caseNumber)})` : ""}:</p>
            <table style="border-collapse:collapse;width:100%;margin:0 0 14px">${rows}</table>
            <p style="margin:0"><a href="${adminLink}" style="color:#7a1f2b">Open in the admin portal →</a></p>
          </div>`;
        const res = await sendEmail({ to: cc, fromName: "T. Maxwell Smith, PLLC — Office", subject: `Documents uploaded to ${folder.name}`, html });
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
