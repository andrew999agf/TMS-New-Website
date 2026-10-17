"use server";

import { getOrCreateCaseForMatter, resolveMatterKey } from "@/lib/cases";
import { shareFileTextFields } from "@/lib/share/text-fields";
import { ensureDiscoveryTables } from "@/db/ensure";
import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq, and, inArray } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/db";
import { shareFolders, shareFiles, shareRecipients, shareDirs, shareDirLinks, portalUsers, shareAccessLog, auditLog } from "@/db/schema";
import { desc, gte, sql } from "drizzle-orm";
import { describeAccess } from "@/lib/share/access-describe";
import { isBlobConfigured } from "@/lib/blob";
import { requireAdmin, audit } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { sendEmail } from "@/lib/email";
import { getSetting } from "@/lib/content";
import { FIRM } from "@/lib/firm";
import { shareType, recipientWarnings, expiryDaysForType, permissionLabel, rolePhrase, normalizeMeta, shareCan, type ShareWarning, type ShareFolderMeta, fileLinksDefault } from "@/lib/share/types";
import { cleanDirPath } from "@/lib/share/access";
import { SHARE_CC_KEY, SHARE_CC_DEFAULT } from "@/lib/share/settings";

const REISSUE_CONTACT = "max@texaslawsmith.com";
const fmtExpiry = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

async function shareCc(): Promise<string[]> {
  const cc = await getSetting<string[]>(SHARE_CC_KEY, SHARE_CC_DEFAULT);
  return (Array.isArray(cc) ? cc : SHARE_CC_DEFAULT).map((s) => s.trim()).filter(Boolean);
}

async function guard() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/share-folders", session.role, session.permissions)) {
    throw new Error("Not allowed.");
  }
  return session;
}

async function baseUrl(): Promise<string> {
  const host = ((await headers()).get("host") ?? "").trim();
  if (!host) return process.env.NEXT_PUBLIC_SITE_URL ?? `https://${FIRM.domain}`;
  const proto = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return `${proto}://${host}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* --------------------------------- folders --------------------------------- */

export async function createFolder(input: { caseNumber: string; name: string; matter?: string; court?: string; county?: string; plaintiff?: string; defendant?: string; type: string }) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const name = input.name.trim();
  if (!name) return { ok: false as const, error: "Enter the client name." };
  try {
    await ensureDiscoveryTables();
    const matter = await resolveMatterKey(input.matter);
    const [row] = await db
      .insert(shareFolders)
      .values({
        caseNumber: input.caseNumber.trim(),
        name,
        matter,
        court: (input.court ?? "").trim(),
        county: (input.county ?? "").trim(),
        plaintiff: (input.plaintiff ?? "").trim(),
        defendant: (input.defendant ?? "").trim(),
        type: input.type,
        requireAuth: true, // secure by default — the sender unchecks to send an open link
        // Per-file direct links from day one (not for folders that go to the other side).
        meta: fileLinksDefault(input.type) ? { fileLinks: true, publicToken: randomBytes(24).toString("base64url") } : {},
        createdBy: session.email,
      })
      .returning({ id: shareFolders.id });
    if (matter) {
      // Register / enrich the central case record so the next tool auto-fills.
      const plaintiff = (input.plaintiff ?? "").trim();
      const defendant = (input.defendant ?? "").trim();
      await getOrCreateCaseForMatter({
        matter,
        name: plaintiff && defendant ? `${plaintiff} v. ${defendant}` : "",
        causeNumber: input.caseNumber, court: input.court, county: input.county,
        plaintiffName: plaintiff, defendantName: defendant,
      }, session.email).catch(() => null);
      revalidatePath("/admin/cases");
    }
    await audit(session.email, "create", "share-folder", String(row.id), `${input.type} folder: ${name}`);
    revalidatePath("/admin/share-folders");
    return { ok: true as const, id: row.id };
  } catch (err) {
    console.error("[share] createFolder failed:", err);
    return { ok: false as const, error: "Couldn't create the folder. Open Settings → Database updates, click it once, then try again." };
  }
}

export async function updateFolder(id: number, patch: { caseNumber?: string; name?: string; matter?: string; court?: string; county?: string; plaintiff?: string; defendant?: string; type?: string; notes?: string; requireAuth?: boolean }) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.caseNumber !== undefined) set.caseNumber = patch.caseNumber.trim();
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.matter !== undefined) { await ensureDiscoveryTables(); set.matter = await resolveMatterKey(patch.matter); }
  if (patch.court !== undefined) set.court = patch.court.trim();
  if (patch.county !== undefined) set.county = patch.county.trim();
  if (patch.plaintiff !== undefined) set.plaintiff = patch.plaintiff.trim();
  if (patch.defendant !== undefined) set.defendant = patch.defendant.trim();
  if (patch.type !== undefined && shareType(patch.type)) set.type = patch.type;
  if (patch.notes !== undefined) set.notes = patch.notes;
  if (patch.requireAuth !== undefined) set.requireAuth = patch.requireAuth;
  try {
    await db.update(shareFolders).set(set).where(eq(shareFolders.id, id));
    await audit(session.email, "update", "share-folder", String(id), "Updated folder");
    revalidatePath("/admin/share-folders");
    revalidatePath(`/admin/share-folders/${id}`);
    return { ok: true as const };
  } catch (err) {
    console.error("[share] updateFolder failed:", err);
    return { ok: false as const, error: "Couldn't save changes. Try Settings → Database updates, then retry." };
  }
}

export async function archiveFolder(id: number, archived: boolean) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    await db.update(shareFolders).set({ archived, updatedAt: new Date() }).where(eq(shareFolders.id, id));
    await audit(session.email, "update", "share-folder", String(id), archived ? "Archived" : "Unarchived");
    revalidatePath("/admin/share-folders");
    revalidatePath(`/admin/share-folders/${id}`);
    return { ok: true as const };
  } catch (err) {
    console.error("[share] archiveFolder failed:", err);
    return { ok: false as const, error: "Couldn't update the folder — try again." };
  }
}

export async function deleteFolder(id: number) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const files = await db.select().from(shareFiles).where(eq(shareFiles.folderId, id));
    for (const f of files) {
      try { await del(f.url); } catch { /* best-effort */ }
    }
    await db.delete(shareFiles).where(eq(shareFiles.folderId, id));
    await db.delete(shareRecipients).where(eq(shareRecipients.folderId, id));
    await db.delete(shareFolders).where(eq(shareFolders.id, id));
    await audit(session.email, "delete", "share-folder", String(id), `Deleted folder (${files.length} files)`);
    revalidatePath("/admin/share-folders");
    return { ok: true as const };
  } catch (err) {
    console.error("[share] deleteFolder failed:", err);
    return { ok: false as const, error: "Couldn't delete the folder — try again." };
  }
}

/* ---------------------------------- files ---------------------------------- */

export async function registerShareFile(folderId: number, file: { url: string; pathname: string; filename: string; contentType?: string; size?: number }, progress?: { total: number; done: number }) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const text = await shareFileTextFields({ url: file.url, contentType: file.contentType, filename: file.filename, size: file.size });
    const [row] = await db
      .insert(shareFiles)
      .values({
        folderId,
        url: file.url,
        pathname: file.pathname,
        filename: file.filename.slice(0, 1024),
        contentType: file.contentType ?? null,
        sizeBytes: file.size ?? null,
        uploadedBy: session.email,
        // Firm uploads never go through the auto digest — staff are asked at
        // upload time whether to notify recipients — so mark them handled.
        notified: true,
        ...text,
      })
      .returning({ id: shareFiles.id });
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (progress) { set.uploadTotal = progress.total; set.uploadDone = progress.done; set.uploadAt = new Date(); }
    await db.update(shareFolders).set(set).where(eq(shareFolders.id, folderId));
    revalidatePath(`/admin/share-folders/${folderId}`);
    return { ok: true as const, id: row.id };
  } catch (err) {
    console.error("[share] registerShareFile failed:", err);
    return { ok: false as const, error: "The file uploaded but couldn't be recorded. Run Settings → Database updates, then re-upload." };
  }
}

/**
 * Notify the folder's active recipients that documents were added — sent only
 * when firm staff explicitly choose to (the pop-up after an upload batch). One
 * calm email per recipient listing the files, with the folder/ZIP links.
 */
export async function notifyRecipientsOfFiles(folderId: number, fileIds: number[]) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const ids = [...new Set((fileIds ?? []).filter((n) => Number.isFinite(n)))];
  if (ids.length === 0) return { ok: false as const, error: "Nothing to notify about." };
  try {
    const [folder] = await db.select().from(shareFolders).where(eq(shareFolders.id, folderId));
    if (!folder) return { ok: false as const, error: "Folder not found." };
    const files = await db.select().from(shareFiles).where(and(eq(shareFiles.folderId, folderId), inArray(shareFiles.id, ids)));
    if (files.length === 0) return { ok: false as const, error: "Nothing to notify about." };
    const now = new Date();
    const recipients = (await db.select().from(shareRecipients).where(eq(shareRecipients.folderId, folderId)))
      .filter((r) => !r.revoked && (!r.expiresAt || r.expiresAt > now));
    if (recipients.length === 0) return { ok: true as const, sent: 0, note: "no recipients" };

    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const base = process.env.NEXT_PUBLIC_SITE_URL || `https://${FIRM.domain}`;
    const docName = (path: string) => path.split("/").pop() || path;
    let sent = 0;
    for (const r of recipients) {
      // Don't tell a recipient about files they uploaded themselves.
      const theirs = files.filter((f) => (f.uploadedBy ?? "").toLowerCase() !== r.email.toLowerCase());
      if (theirs.length === 0) continue;
      const link = `${base}/share/${r.token}`;
      const canDownload = shareCan(r.permission, "download");
      // Downloads are built in the browser on the folder page now (no server ZIP).
      const zipLink = link;
      const rows = theirs.map((f) =>
        `<tr><td style="padding:5px 14px 5px 0;font-size:14px;border-top:1px solid #eee">${esc(docName(f.filename))}</td>` +
        `<td style="padding:5px 0;text-align:right;border-top:1px solid #eee;white-space:nowrap"><a href="${link}" style="font-size:12px;color:#7a1f2b;text-decoration:none">View &rarr;</a></td></tr>`).join("");
      const buttons = canDownload
        ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr>
             <td style="padding-right:10px"><a href="${zipLink}" style="background:#7a1f2b;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;font-size:13px">Download ${theirs.length === 1 ? "it" : "these"} as a ZIP</a></td>
             <td><a href="${link}" style="border:1px solid #7a1f2b;color:#7a1f2b;padding:9px 16px;border-radius:6px;text-decoration:none;display:inline-block;font-size:13px">Open the folder</a></td>
           </tr></table>`
        : `<p style="margin:0 0 18px"><a href="${link}" style="background:#7a1f2b;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;font-size:13px">Open the folder</a></p>`;
      const html = `
        <div style="font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;max-width:560px;line-height:1.55">
          <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a1f2b;margin:0 0 16px">${esc(FIRM.name)}</p>
          <p style="margin:0 0 12px">${theirs.length === 1 ? "A new document was" : `${theirs.length} new documents were`} added to the folder shared with you — <strong>${esc(folder.name)}</strong>:</p>
          <table style="border-collapse:collapse;width:100%;margin:0 0 16px">${rows}</table>
          ${buttons}
          <p style="margin:0;font-size:12px;color:#999">${canDownload ? "The download may ask you to sign in or enter a one-time code first. " : "You may be asked to sign in or enter a one-time code to open it. "}Questions? Contact <a href="mailto:${FIRM.email}" style="color:#999">${FIRM.email}</a>.</p>
        </div>`;
      const res = await sendEmail({ to: r.email, fromName: `${FIRM.name} — Secure Share`, subject: `New document${theirs.length === 1 ? "" : "s"} in ${folder.name}`, html, headers: { "X-Entity-Ref-ID": randomBytes(12).toString("hex") } });
      if (res.sent) sent += 1;
    }
    return { ok: true as const, sent };
  } catch (err) {
    console.error("[share] notifyRecipientsOfFiles failed:", err);
    return { ok: false as const, error: "Couldn't send the notification." };
  }
}

/** Clear the live upload indicator once a batch finishes (or is aborted). */
export async function clearUpload(folderId: number) {
  await guard();
  if (!db) return { ok: false as const };
  try {
    await db.update(shareFolders).set({ uploadTotal: 0, uploadDone: 0, uploadAt: null }).where(eq(shareFolders.id, folderId));
  } catch { /* best-effort */ }
  return { ok: true as const };
}

export async function updateFolderMeta(folderId: number, meta: ShareFolderMeta) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    await db.update(shareFolders).set({ meta: normalizeMeta(meta) as Record<string, unknown>, updatedAt: new Date() }).where(eq(shareFolders.id, folderId));
    await audit(session.email, "update", "share-folder", String(folderId), "Updated folder info & tasks");
    revalidatePath(`/admin/share-folders/${folderId}`);
    return { ok: true as const };
  } catch (err) {
    console.error("[share] updateFolderMeta failed:", err);
    return { ok: false as const, error: "Couldn't save — try Settings → Database updates, then retry." };
  }
}

/** Email a person that a task in this folder was assigned to them. Best-effort:
 *  if we don't have an address it does nothing. When the person is already a
 *  recipient of the folder we include their personal share link. */
export async function notifyAssignee(folderId: number, taskText: string, email: string, name: string) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const addr = (email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(addr)) return { ok: false as const, error: "No email on file for that person." };
  try {
    const [folder] = await db.select().from(shareFolders).where(eq(shareFolders.id, folderId));
    if (!folder) return { ok: false as const, error: "Folder not found." };
    const [rec] = await db.select({ token: shareRecipients.token }).from(shareRecipients).where(and(eq(shareRecipients.folderId, folderId), eq(shareRecipients.email, addr)));
    const who = name.trim() ? esc(name.trim()) : "there";
    const caseLine = folder.caseNumber ? `<p style="margin:0 0 14px;color:#555;font-size:13px">Case: ${esc(folder.caseNumber)}</p>` : "";
    const linkBlock = rec
      ? `<p style="margin:0 0 18px"><a href="${await baseUrl()}/share/${rec.token}" style="background:#7a1f2b;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;display:inline-block">Open the folder</a></p>`
      : `<p style="margin:0 0 18px;font-size:13px;color:#444">The firm will send you a secure link to the folder if you need to upload or review documents for this task.</p>`;
    const html = `
      <div style="font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;max-width:560px;line-height:1.55">
        <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a1f2b;margin:0 0 16px">${esc(FIRM.name)}</p>
        <p style="margin:0 0 14px">Hello ${who},</p>
        <p style="margin:0 0 6px">You've been assigned a task in this matter:</p>
        <p style="margin:0 0 4px;font-size:16px;font-weight:bold">${esc(folder.name)}</p>
        ${caseLine}
        <p style="margin:0 0 16px;padding:12px 14px;border-left:3px solid #7a1f2b;background:#faf6f2;font-size:14px">${esc(taskText)}</p>
        ${linkBlock}
        <p style="margin:16px 0 0;padding-top:12px;border-top:1px solid #e5e5e5;font-size:11px;color:#8a8a8a">Sent by ${esc(FIRM.name)}. If you weren't expecting this, please contact <a href="mailto:${REISSUE_CONTACT}" style="color:#8a8a8a">${REISSUE_CONTACT}</a>.</p>
      </div>`;
    // A per-task subject + a unique reference header keep two assignments made
    // close together from collapsing into one email thread.
    const taskShort = taskText.trim().replace(/\s+/g, " ").slice(0, 60);
    const res = await sendEmail({
      to: addr,
      cc: await shareCc(),
      fromName: FIRM.name,
      subject: `New task for you — ${taskShort}${taskText.length > 60 ? "…" : ""} (${folder.name})`,
      html,
      headers: { "X-Entity-Ref-ID": randomBytes(12).toString("hex") },
    });
    await audit(session.email, "notify", "share-folder", String(folderId), `Task assigned to ${addr}`);
    return res.sent ? { ok: true as const } : { ok: false as const, error: "Couldn't send the notification email." };
  } catch (err) {
    console.error("[share] notifyAssignee failed:", err);
    return { ok: false as const, error: "Couldn't notify that person." };
  }
}

/** Turn copyable public file links on/off for a folder. Minting the folder's
 *  public token on first enable. Only meaningful for open-link folders — the
 *  public view page still refuses to serve if sign-in is required. */
export async function setFolderFileLinks(folderId: number, enabled: boolean) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [folder] = await db.select().from(shareFolders).where(eq(shareFolders.id, folderId));
    if (!folder) return { ok: false as const, error: "Folder not found." };
    const meta = normalizeMeta(folder.meta);
    meta.fileLinks = enabled;
    if (enabled && !meta.publicToken) meta.publicToken = randomBytes(24).toString("base64url");
    await db.update(shareFolders).set({ meta: meta as Record<string, unknown>, updatedAt: new Date() }).where(eq(shareFolders.id, folderId));
    await audit(session.email, "update", "share-folder", String(folderId), enabled ? "Enabled public file links" : "Disabled public file links");
    revalidatePath(`/admin/share-folders/${folderId}`);
    return { ok: true as const, publicToken: meta.publicToken };
  } catch (err) {
    console.error("[share] setFolderFileLinks failed:", err);
    return { ok: false as const, error: "Couldn't update — try again." };
  }
}

export async function createDir(folderId: number, path: string) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const clean = cleanDirPath(path);
  if (!clean) return { ok: false as const, error: "Enter a folder name." };
  try {
    const existing = await db.select({ id: shareDirs.id }).from(shareDirs).where(and(eq(shareDirs.folderId, folderId), eq(shareDirs.path, clean)));
    if (existing.length === 0) await db.insert(shareDirs).values({ folderId, path: clean, createdBy: session.email });
    revalidatePath(`/admin/share-folders/${folderId}`);
    return { ok: true as const };
  } catch (err) {
    console.error("[share] createDir failed:", err);
    return { ok: false as const, error: "Couldn't create the folder — try again." };
  }
}

export async function deleteDir(folderId: number, path: string) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const clean = cleanDirPath(path);
  if (!clean) return { ok: false as const, error: "Invalid folder." };
  const prefix = `${clean}/`;
  try {
    const allFiles = await db.select().from(shareFiles).where(eq(shareFiles.folderId, folderId));
    const victims = allFiles.filter((f) => f.filename === clean || f.filename.startsWith(prefix));
    for (const f of victims) { try { await del(f.url); } catch { /* best-effort */ } }
    if (victims.length) await db.delete(shareFiles).where(inArray(shareFiles.id, victims.map((f) => f.id)));
    const allDirs = await db.select().from(shareDirs).where(eq(shareDirs.folderId, folderId));
    const deadDirs = allDirs.filter((d) => d.path === clean || d.path.startsWith(prefix));
    if (deadDirs.length) await db.delete(shareDirs).where(inArray(shareDirs.id, deadDirs.map((d) => d.id)));
    await audit(session.email, "delete", "share-folder", String(folderId), `Deleted folder "${clean}" (${victims.length} files)`);
    revalidatePath(`/admin/share-folders/${folderId}`);
    return { ok: true as const };
  } catch (err) {
    console.error("[share] deleteDir failed:", err);
    return { ok: false as const, error: "Couldn't delete the folder — try again." };
  }
}

/** Rename a folder (and everything inside it) by rewriting the path prefix on
 *  its files and sub-dirs. Blob objects are untouched — only the logical path. */
export async function renameDir(folderId: number, path: string, newName: string) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const oldClean = cleanDirPath(path);
  if (!oldClean) return { ok: false as const, error: "Invalid folder." };
  const seg = cleanDirPath((newName || "").replace(/[/\\]+/g, " "));
  if (!seg) return { ok: false as const, error: "Enter a folder name." };
  const parent = oldClean.split("/").slice(0, -1).join("/");
  const newPath = parent ? `${parent}/${seg}` : seg;
  if (newPath === oldClean) return { ok: true as const };
  const prefix = `${oldClean}/`;
  try {
    const files = await db.select().from(shareFiles).where(eq(shareFiles.folderId, folderId));
    for (const f of files) {
      if (f.filename === oldClean || f.filename.startsWith(prefix)) {
        await db.update(shareFiles).set({ filename: (newPath + f.filename.slice(oldClean.length)).slice(0, 1024) }).where(eq(shareFiles.id, f.id));
      }
    }
    const dirs = await db.select().from(shareDirs).where(eq(shareDirs.folderId, folderId));
    for (const d of dirs) {
      if (d.path === oldClean || d.path.startsWith(prefix)) {
        await db.update(shareDirs).set({ path: (newPath + d.path.slice(oldClean.length)).slice(0, 1024) }).where(eq(shareDirs.id, d.id));
      }
    }
    await audit(session.email, "update", "share-folder", String(folderId), `Renamed folder "${oldClean}" → "${newPath}"`);
    revalidatePath(`/admin/share-folders/${folderId}`);
    return { ok: true as const };
  } catch (err) {
    console.error("[share] renameDir failed:", err);
    return { ok: false as const, error: "Couldn't rename the folder — try again." };
  }
}

/**
 * Rename a single document. Only the file's own name changes — the folder it
 * lives in is preserved, and the stored Blob object is untouched (we rename the
 * logical path only, exactly as folder renames do). The original extension is
 * kept if the new name doesn't carry one, so a rename can't break how the file
 * opens.
 */
export async function renameFile(fileId: number, newName: string) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [f] = await db.select().from(shareFiles).where(eq(shareFiles.id, fileId));
    if (!f) return { ok: false as const, error: "File not found." };

    const parts = f.filename.split("/");
    const oldBase = parts.pop() ?? f.filename;
    const dir = parts.join("/");

    // Strip any path separators — a rename edits the name, never the location.
    const typed = (newName || "").replace(/[/\\]+/g, " ").replace(/[:*?"<>|]/g, "").trim().slice(0, 200);
    if (!typed) return { ok: false as const, error: "Enter a file name." };

    // Preserve the extension unless the new name already ends in one.
    const dot = oldBase.lastIndexOf(".");
    const ext = dot > 0 ? oldBase.slice(dot) : "";
    const base = ext && !typed.toLowerCase().endsWith(ext.toLowerCase()) ? `${typed}${ext}` : typed;
    if (base === oldBase) return { ok: true as const };

    await db.update(shareFiles).set({ filename: (dir ? `${dir}/${base}` : base).slice(0, 1024) }).where(eq(shareFiles.id, fileId));
    await audit(session.email, "update", "share-file", String(fileId), `Renamed document "${oldBase}" → "${base}"`);
    revalidatePath(`/admin/share-folders/${f.folderId}`);
    return { ok: true as const };
  } catch (err) {
    console.error("[share] renameFile failed:", err);
    return { ok: false as const, error: "Couldn't rename the document — try again." };
  }
}

export async function deleteFile(id: number) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [f] = await db.select().from(shareFiles).where(eq(shareFiles.id, id));
    if (!f) return { ok: false as const, error: "Not found." };
    try { await del(f.url); } catch { /* best-effort */ }
    await db.delete(shareFiles).where(eq(shareFiles.id, id));
    await audit(session.email, "delete", "share-file", String(id), f.filename);
    revalidatePath(`/admin/share-folders/${f.folderId}`);
    return { ok: true as const };
  } catch (err) {
    console.error("[share] deleteFile failed:", err);
    return { ok: false as const, error: "Couldn't remove the file — try again." };
  }
}

/** Delete several files at once (checkbox multi-select). */
export async function deleteFiles(folderId: number, ids: number[]) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const list = [...new Set(ids.filter((n) => Number.isFinite(n)))];
  if (list.length === 0) return { ok: true as const };
  try {
    const victims = (await db.select().from(shareFiles).where(and(eq(shareFiles.folderId, folderId), inArray(shareFiles.id, list))));
    for (const f of victims) { try { await del(f.url); } catch { /* best-effort */ } }
    if (victims.length) await db.delete(shareFiles).where(inArray(shareFiles.id, victims.map((f) => f.id)));
    await audit(session.email, "delete", "share-folder", String(folderId), `Deleted ${victims.length} files`);
    revalidatePath(`/admin/share-folders/${folderId}`);
    return { ok: true as const, count: victims.length };
  } catch (err) {
    console.error("[share] deleteFiles failed:", err);
    return { ok: false as const, error: "Couldn't remove the files — try again." };
  }
}

/* ---------------------------- directory view links ---------------------------- */

/**
 * Get (or mint) the public view link for ONE directory of a share folder —
 * "" for the root. The link opens a read-only list/grid viewer of just that
 * directory's subtree with per-file viewing and ZIP downloads.
 */
export async function getOrCreateDirLink(folderId: number, dir: string) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const dirPath = cleanDirPath(dir);
  try {
    const [folder] = await db.select({ id: shareFolders.id }).from(shareFolders).where(eq(shareFolders.id, folderId));
    if (!folder) return { ok: false as const, error: "Folder not found." };
    const [existing] = await db
      .select()
      .from(shareDirLinks)
      .where(and(eq(shareDirLinks.folderId, folderId), eq(shareDirLinks.dirPath, dirPath), eq(shareDirLinks.revoked, false)));
    if (existing) return { ok: true as const, token: existing.token, fresh: false };
    const token = randomBytes(24).toString("base64url");
    await db.insert(shareDirLinks).values({ folderId, dirPath, token, createdBy: session.email });
    await audit(session.email, "create", "share-folder", String(folderId), `Dir view link: ${dirPath || "(root)"}`);
    return { ok: true as const, token, fresh: true };
  } catch {
    return { ok: false as const, error: "Couldn't create the link. Run Settings → Database updates once, then retry." };
  }
}

/** Kill a directory's current view link; the next request mints a new token. */
export async function revokeDirLink(folderId: number, dir: string) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const dirPath = cleanDirPath(dir);
  await db
    .update(shareDirLinks)
    .set({ revoked: true })
    .where(and(eq(shareDirLinks.folderId, folderId), eq(shareDirLinks.dirPath, dirPath)));
  await audit(session.email, "update", "share-folder", String(folderId), `Revoked dir view link: ${dirPath || "(root)"}`);
  return { ok: true as const };
}

/* -------------------------------- recipients ------------------------------- */

async function sendInvite(folderName: string, caseNumber: string, typeKey: string, email: string, name: string, token: string, expiresAt: Date, cc: string[], secure: boolean) {
  const link = `${await baseUrl()}/share/${token}`;
  const who = name.trim() ? esc(name.trim()) : "there";
  const caseLine = caseNumber ? `<p style="margin:0 0 14px;color:#555;font-size:13px">Case: ${esc(caseNumber)}</p>` : "";
  // Days until expiry, derived from the actual date (which the admin may have set).
  const days = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 86_400_000));
  const role = rolePhrase(typeKey);
  const openLabel = secure ? "Sign in to open the folder" : "Open the folder";
  // Plain links carry no extra note; only sign-in-required invites explain the access model.
  const accessNote = secure
    ? `This access is specific to you. Opening the folder requires you to sign in with your password or a one-time code emailed to <strong>${esc(email)}</strong>, so a forwarded link will not work for anyone else. If someone else at your firm or office needs access, they must be invited separately — please have them request it, or email <a href="mailto:${REISSUE_CONTACT}" style="color:#7a1f2b">${REISSUE_CONTACT}</a> and we will send a link directly to them.`
    : "";
  const html = `
    <div style="font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;max-width:560px;line-height:1.55">
      <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a1f2b;margin:0 0 16px">${esc(FIRM.name)}</p>
      <p style="margin:0 0 14px">Hello ${who},</p>
      <p style="margin:0 0 6px">${esc(FIRM.name)} has shared documents with you as <strong>${role}</strong> in this matter:</p>
      <p style="margin:0 0 4px;font-size:16px;font-weight:bold">${esc(folderName)}</p>
      ${caseLine}
      <p style="margin:0 0 18px"><a href="${link}" style="background:#7a1f2b;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;display:inline-block">${openLabel}</a></p>
      <p style="margin:0 0 8px;font-size:13px;color:#777">Or paste this link into your browser:</p>
      <p style="margin:0 0 16px;font-size:12px;color:#777;word-break:break-all">${link}</p>
      <p style="margin:0 0 8px;font-size:13px;color:#444">For security, this link will <strong>automatically expire in ${days} days</strong> — on <strong>${fmtExpiry(expiresAt)}</strong>. If you need it re-issued after that, contact <a href="mailto:${REISSUE_CONTACT}" style="color:#7a1f2b">${REISSUE_CONTACT}</a>.</p>
      ${accessNote ? `<p style="margin:0 0 16px;font-size:12px;color:#666">${accessNote}</p>` : ""}
      <p style="margin:16px 0 0;padding-top:12px;border-top:1px solid #e5e5e5;font-style:italic;font-size:10px;line-height:1.5;color:#8a8a8a">
        Confidentiality &amp; clawback notice: This message and the linked documents are confidential and may be protected by the attorney-client privilege, the attorney work-product doctrine, or other applicable privileges and protections. They are intended solely for the named recipient. If you are not the intended recipient, you are hereby notified that any review, use, disclosure, copying, or distribution is strictly prohibited. Please notify ${esc(FIRM.name)} immediately at <a href="mailto:${REISSUE_CONTACT}" style="color:#8a8a8a">${REISSUE_CONTACT}</a>, do not open or access the documents, and permanently delete and purge all copies from your files and systems. Any inadvertent disclosure of privileged or protected material is not intended to and shall not operate as a waiver of any privilege or protection, and ${esc(FIRM.name)} expressly reserves the right to demand the return or destruction of such material pursuant to Texas Rule of Civil Procedure 193.3(d) and Texas Rule of Evidence 511.
      </p>
    </div>`;
  // A per-recipient subject keeps Gmail from threading separate invites (to
  // different people, CC'd to the same person) into one conversation.
  const recipientLabel = name.trim() || email;
  return sendEmail({ to: email, cc, fromName: `${FIRM.name} — Secure Share`, subject: `${FIRM.shortName} shared "${folderName}" with ${recipientLabel}`, html });
}

export async function addRecipient(folderId: number, email: string, name: string, permission: string, kind: string, acknowledged: boolean, expiresAtIso?: string): Promise<{ ok: boolean; error?: string; warnings?: ShareWarning[]; needsAck?: boolean }> {
  const session = await guard();
  if (!db) return { ok: false, error: "Database not configured." };
  const cleanEmail = email.trim().toLowerCase();
  if (!EMAIL_RE.test(cleanEmail)) return { ok: false, error: "Enter a valid email address." };
  const perm = ["view", "download", "upload", "manage"].includes(permission) ? permission : "download";
  const cleanKind = (kind || "").trim().slice(0, 24);
  try {
    const [folder] = await db.select().from(shareFolders).where(eq(shareFolders.id, folderId));
    if (!folder) return { ok: false, error: "Folder not found." };

    // Server-side re-check of the safety warnings — a danger requires acknowledgment.
    const warnings = recipientWarnings(folder.type, cleanEmail, FIRM.domain);
    if (warnings.some((w) => w.level === "danger") && !acknowledged) {
      return { ok: false, needsAck: true, warnings };
    }

    const [dupe] = await db.select({ id: shareRecipients.id }).from(shareRecipients).where(and(eq(shareRecipients.folderId, folderId), eq(shareRecipients.email, cleanEmail)));
    if (dupe) return { ok: false, error: "That email already has access to this folder." };

    const token = randomBytes(24).toString("base64url");
    // Admin-chosen expiry (end of that day) if valid and in the future; otherwise
    // the type-based default.
    const custom = expiresAtIso ? new Date(`${expiresAtIso}T23:59:59`) : null;
    const expiresAt = custom && !Number.isNaN(custom.getTime()) && custom.getTime() > Date.now()
      ? custom
      : new Date(Date.now() + expiryDaysForType(folder.type) * 86_400_000);
    await db.insert(shareRecipients).values({ folderId, email: cleanEmail, name: name.trim(), token, permission: perm, kind: cleanKind, invitedBy: session.email, expiresAt });
    // Directory entry (one per person, keyed by email) — created if new. When a
    // name is provided we remember it (so a corrected name sticks for next time);
    // an empty name never blanks an existing one.
    if (name.trim()) {
      await db.insert(portalUsers).values({ email: cleanEmail, name: name.trim(), kind: cleanKind }).onConflictDoUpdate({ target: portalUsers.email, set: { name: name.trim() } });
    } else {
      await db.insert(portalUsers).values({ email: cleanEmail, name: "", kind: cleanKind }).onConflictDoNothing({ target: portalUsers.email });
    }
    await db.update(shareFolders).set({ updatedAt: new Date() }).where(eq(shareFolders.id, folderId));
    const res = await sendInvite(folder.name, folder.caseNumber, folder.type, cleanEmail, name, token, expiresAt, await shareCc(), folder.requireAuth);
    await audit(session.email, "create", "share-recipient", String(folderId), `Shared with ${cleanEmail}`);
    revalidatePath(`/admin/share-folders/${folderId}`);
    return { ok: true, error: res.sent ? undefined : "Added, but the invite email didn't send (check email settings)." };
  } catch (err) {
    console.error("[share] addRecipient failed:", err);
    return { ok: false, error: "Couldn't share. Try Settings → Database updates, then retry." };
  }
}

export async function resendInvite(recipientId: number) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [r] = await db.select().from(shareRecipients).where(eq(shareRecipients.id, recipientId));
    if (!r) return { ok: false as const, error: "Not found." };
    const [folder] = await db.select().from(shareFolders).where(eq(shareFolders.id, r.folderId));
    if (!folder) return { ok: false as const, error: "Folder not found." };
    // Re-issuing resets the clock and clears any prior expiry/revocation.
    const expiresAt = new Date(Date.now() + expiryDaysForType(folder.type) * 86_400_000);
    await db.update(shareRecipients).set({ expiresAt, revoked: false }).where(eq(shareRecipients.id, r.id));
    const res = await sendInvite(folder.name, folder.caseNumber, folder.type, r.email, r.name, r.token, expiresAt, await shareCc(), folder.requireAuth);
    revalidatePath(`/admin/share-folders/${r.folderId}`);
    return res.sent ? { ok: true as const } : { ok: false as const, error: "Email didn't send (check email settings)." };
  } catch (err) {
    console.error("[share] resendInvite failed:", err);
    return { ok: false as const, error: "Couldn't resend — try again." };
  }
}

export async function setRecipientPermission(recipientId: number, permission: string) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  if (!["view", "download", "upload", "manage"].includes(permission)) return { ok: false as const, error: "Invalid access level." };
  try {
    const [r] = await db.select().from(shareRecipients).where(eq(shareRecipients.id, recipientId));
    if (!r) return { ok: false as const, error: "Not found." };
    await db.update(shareRecipients).set({ permission }).where(eq(shareRecipients.id, recipientId));
    await audit(session.email, "update", "share-recipient", String(recipientId), `Access → ${permissionLabel(permission)} for ${r.email}`);
    revalidatePath(`/admin/share-folders/${r.folderId}`);
    return { ok: true as const };
  } catch (err) {
    console.error("[share] setRecipientPermission failed:", err);
    return { ok: false as const, error: "Couldn't update access — try again." };
  }
}

/** Change (or clear) a recipient's link-expiry date. A "YYYY-MM-DD" string sets
 *  it to the end of that day; null means the link never expires. */
export async function setRecipientExpiry(recipientId: number, dateIso: string | null) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [r] = await db.select().from(shareRecipients).where(eq(shareRecipients.id, recipientId));
    if (!r) return { ok: false as const, error: "Not found." };
    let expiresAt: Date | null = null;
    if (dateIso) {
      const d = new Date(`${dateIso}T23:59:59`);
      if (Number.isNaN(d.getTime())) return { ok: false as const, error: "Invalid date." };
      expiresAt = d;
    }
    await db.update(shareRecipients).set({ expiresAt }).where(eq(shareRecipients.id, recipientId));
    await audit(session.email, "update", "share-recipient", String(recipientId), expiresAt ? `Expiry → ${fmtExpiry(expiresAt)} for ${r.email}` : `Expiry cleared for ${r.email}`);
    revalidatePath(`/admin/share-folders/${r.folderId}`);
    return { ok: true as const };
  } catch (err) {
    console.error("[share] setRecipientExpiry failed:", err);
    return { ok: false as const, error: "Couldn't update the expiry — try again." };
  }
}

export async function setRecipientRevoked(recipientId: number, revoked: boolean) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [r] = await db.select().from(shareRecipients).where(eq(shareRecipients.id, recipientId));
    if (!r) return { ok: false as const, error: "Not found." };
    await db.update(shareRecipients).set({ revoked }).where(eq(shareRecipients.id, recipientId));
    await audit(session.email, "update", "share-recipient", String(recipientId), revoked ? `Revoked ${r.email}` : `Restored ${r.email}`);
    revalidatePath(`/admin/share-folders/${r.folderId}`);
    return { ok: true as const };
  } catch (err) {
    console.error("[share] setRecipientRevoked failed:", err);
    return { ok: false as const, error: "Couldn't update access — try again." };
  }
}

/* ------------------------------ diagnostics ------------------------------ */

const mb = (n: number | null | undefined) => (n == null ? "?" : `${(n / 1048576).toFixed(n < 1048576 ? 2 : 1)} MB`);

/**
 * One copyable text report for a share folder — what the database holds,
 * how the stored files answer a direct request (length, range support,
 * speed), and the recent access log — for pasting to support when a
 * download or a share link misbehaves. Names, sizes and counts only: no
 * links, tokens or secrets.
 */
export async function shareFolderDiagnostics(folderId: number): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  await guard();
  if (!db) return { ok: false, error: "Database not configured." };
  try {
    const [folder] = await db.select().from(shareFolders).where(eq(shareFolders.id, folderId));
    if (!folder) return { ok: false, error: "Folder not found." };
    const meta = normalizeMeta(folder.meta);
    const [files, recipients, dirs, dirLinks] = await Promise.all([
      db.select({ id: shareFiles.id, filename: shareFiles.filename, url: shareFiles.url, pathname: shareFiles.pathname, contentType: shareFiles.contentType, sizeBytes: shareFiles.sizeBytes, createdAt: shareFiles.createdAt }).from(shareFiles).where(eq(shareFiles.folderId, folderId)),
      db.select({ id: shareRecipients.id, email: shareRecipients.email, name: shareRecipients.name, revoked: shareRecipients.revoked, expiresAt: shareRecipients.expiresAt, lastAccessAt: shareRecipients.lastAccessAt, permission: shareRecipients.permission, kind: shareRecipients.kind }).from(shareRecipients).where(eq(shareRecipients.folderId, folderId)),
      db.select({ path: shareDirs.path }).from(shareDirs).where(eq(shareDirs.folderId, folderId)),
      db.select({ dirPath: shareDirLinks.dirPath, revoked: shareDirLinks.revoked }).from(shareDirLinks).where(eq(shareDirLinks.folderId, folderId)),
    ]);
    const L: string[] = [];
    L.push(`SHARE FOLDER DIAGNOSTICS — ${new Date().toISOString()}`);
    L.push(`  folder #${folder.id}: ${folder.name} · case ${folder.caseNumber || "—"} · type ${folder.type}${folder.archived ? " · ARCHIVED" : ""}`);
    L.push(`  open link: ${folder.requireAuth ? "sign-in required" : "anyone with the link"} · per-file links: ${meta.fileLinks ? "on" : "off"} · public token: ${meta.publicToken ? "set" : "none"}`);
    L.push(`  server: blob store ${isBlobConfigured() ? "configured" : "NOT configured"} · region ${process.env.VERCEL_REGION ?? "local"} · node ${process.version}`);

    const total = files.reduce((n, f) => n + (f.sizeBytes ?? 0), 0);
    const noSize = files.filter((f) => !f.sizeBytes || f.sizeBytes <= 0);
    const huge = files.filter((f) => (f.sizeBytes ?? 0) > 3.8 * 1024 ** 3);
    const hosts = new Map<string, number>();
    for (const f of files) { let h = "?"; try { h = new URL(f.url).host; } catch { /* keep ? */ } hosts.set(h, (hosts.get(h) ?? 0) + 1); }
    L.push("");
    L.push(`FILES: ${files.length} · ${mb(total)} total · ${dirs.length} sub-folder(s) · ${dirLinks.length} sub-folder link(s) (${dirLinks.filter((d) => d.revoked).length} revoked)`);
    L.push(`  without a recorded size: ${noSize.length}${noSize.length ? ` (${noSize.slice(0, 5).map((f) => f.filename).join("; ")}${noSize.length > 5 ? "; …" : ""})` : ""}`);
    L.push(`  over 3.8 GB (needs its own archive, may fail): ${huge.length}${huge.length ? ` (${huge.map((f) => `${f.filename} ${mb(f.sizeBytes)}`).join("; ")})` : ""}`);
    L.push(`  storage hosts: ${[...hosts.entries()].map(([h, n]) => `${h} ×${n}`).join(", ") || "none"}`);
    const types = new Map<string, number>();
    for (const f of files) { const t = (f.contentType || "unknown").split(";")[0]; types.set(t, (types.get(t) ?? 0) + 1); }
    L.push(`  types: ${[...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t, n]) => `${t} ×${n}`).join(", ") || "—"}`);
    const largest = [...files].sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0)).slice(0, 5);
    L.push(`  largest: ${largest.map((f) => `${f.filename} (${mb(f.sizeBytes)})`).join("; ") || "—"}`);

    // Ask storage directly about the largest files: does it answer, with what
    // length, and does it accept byte ranges (what resumable downloads need)?
    L.push("");
    L.push("STORAGE CHECK (largest files, asked directly from the server):");
    for (const f of largest) {
      const t0 = Date.now();
      try {
        const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), 8000);
        const head = await fetch(f.url, { method: "HEAD", signal: ac.signal, cache: "no-store" });
        clearTimeout(timer);
        const len = Number(head.headers.get("content-length") ?? 0);
        const ac2 = new AbortController(); const timer2 = setTimeout(() => ac2.abort(), 8000);
        const r = await fetch(f.url, { headers: { Range: "bytes=0-1023" }, signal: ac2.signal, cache: "no-store" });
        clearTimeout(timer2);
        const body = await r.arrayBuffer();
        const sizeNote = f.sizeBytes && len && f.sizeBytes !== len ? ` ⚠ recorded ${f.sizeBytes} ≠ actual ${len}` : "";
        L.push(`  ${f.filename}: HEAD ${head.status} length ${len || "?"}${sizeNote} · range request → ${r.status}${r.status === 206 ? " (resumable)" : r.status === 200 ? ` (NOT resumable; sent ${body.byteLength} bytes)` : ""} · ${Date.now() - t0} ms`);
      } catch (err) {
        L.push(`  ${f.filename}: FAILED after ${Date.now() - t0} ms — ${(err as Error).message}`);
      }
    }
    if (!largest.length) L.push("  (no files)");

    L.push("");
    const now = Date.now();
    L.push(`RECIPIENTS: ${recipients.length} · active ${recipients.filter((r) => !r.revoked && !(r.expiresAt && r.expiresAt.getTime() < now)).length} · revoked ${recipients.filter((r) => r.revoked).length} · expired ${recipients.filter((r) => !r.revoked && r.expiresAt && r.expiresAt.getTime() < now).length}`);
    for (const r of recipients.slice(0, 25)) L.push(`  ${r.name || r.email} <${r.email}> · ${r.kind || "—"} / ${r.permission}${r.revoked ? " · revoked" : ""}${r.expiresAt ? ` · expires ${r.expiresAt.toISOString().slice(0, 10)}` : ""} · last opened ${r.lastAccessAt ? r.lastAccessAt.toISOString() : "never"}`);

    const since = new Date(now - 14 * 86400_000);
    const [recent, counts, audits] = await Promise.all([
      db.select().from(shareAccessLog).where(eq(shareAccessLog.folderId, folderId)).orderBy(desc(shareAccessLog.at)).limit(40),
      db.select({ action: shareAccessLog.action, n: sql<number>`count(*)::int` }).from(shareAccessLog).where(and(eq(shareAccessLog.folderId, folderId), gte(shareAccessLog.at, since))).groupBy(shareAccessLog.action),
      db.select({ at: auditLog.createdAt, action: auditLog.action, who: auditLog.adminEmail, detail: auditLog.summary }).from(auditLog).where(and(eq(auditLog.entity, "share-folder"), eq(auditLog.entityId, String(folderId)))).orderBy(desc(auditLog.createdAt)).limit(15).catch(() => [] as { at: Date; action: string; who: string | null; detail: string | null }[]),
    ]);
    const recById = new Map(recipients.map((r) => [r.id, r]));
    const fileById = new Map(files.map((f) => [f.id, f.filename]));
    L.push("");
    L.push(`RECIPIENT ACTIVITY — last 14 days: ${counts.map((c) => `${c.action} ×${c.n}`).join(", ") || "none"}`);
    L.push(`  last ${recent.length} entries:`);
    for (const r of recent) {
      const rec = r.recipientId ? recById.get(r.recipientId) : null;
      const d = describeAccess({ action: r.action, meta: (r.meta ?? {}) as Record<string, unknown>, fileName: r.fileId ? fileById.get(r.fileId) : undefined });
      L.push(`    ${r.at.toISOString()} · ${rec ? rec.name || rec.email : `(${d.viaLabel})`} · ${d.label}${d.document ? ` · ${d.document}` : ""}${d.detail ? ` · ${d.detail}` : ""}${r.userAgent ? ` · ${r.userAgent.slice(0, 60)}` : ""}`);
    }
    if (!recent.length) L.push("    (none)");
    if (audits.length) {
      L.push("");
      L.push("FIRM ACTIONS ON THIS FOLDER (recent):");
      for (const a of audits) L.push(`  ${a.at.toISOString()} · ${a.who ?? "—"} · ${a.action} · ${(a.detail ?? "").slice(0, 160)}`);
    }
    return { ok: true, text: L.join("\n") };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
