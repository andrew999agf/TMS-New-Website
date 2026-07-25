"use server";

import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/db";
import { shareFolders, shareFiles, shareRecipients, shareDirs, portalUsers } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { sendEmail } from "@/lib/email";
import { getSetting } from "@/lib/content";
import { FIRM } from "@/lib/firm";
import { shareType, recipientWarnings, expiryDaysForType, permissionLabel, rolePhrase, normalizeMeta, type ShareWarning, type ShareFolderMeta } from "@/lib/share/types";
import { cleanDirPath, DIGEST_DELAY_MS } from "@/lib/share/access";
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

export async function createFolder(input: { caseNumber: string; name: string; matter?: string; court?: string; type: string }) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const name = input.name.trim();
  if (!name) return { ok: false as const, error: "Enter the client name." };
  try {
    const [row] = await db
      .insert(shareFolders)
      .values({
        caseNumber: input.caseNumber.trim(),
        name,
        matter: (input.matter ?? "").trim(),
        court: (input.court ?? "").trim(),
        type: input.type,
        requireAuth: true, // secure by default — the sender unchecks to send an open link
        createdBy: session.email,
      })
      .returning({ id: shareFolders.id });
    await audit(session.email, "create", "share-folder", String(row.id), `${input.type} folder: ${name}`);
    revalidatePath("/admin/share-folders");
    return { ok: true as const, id: row.id };
  } catch (err) {
    console.error("[share] createFolder failed:", err);
    return { ok: false as const, error: "Couldn't create the folder. Open Settings → Database updates, click it once, then try again." };
  }
}

export async function updateFolder(id: number, patch: { caseNumber?: string; name?: string; matter?: string; court?: string; type?: string; notes?: string; requireAuth?: boolean }) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.caseNumber !== undefined) set.caseNumber = patch.caseNumber.trim();
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.matter !== undefined) set.matter = patch.matter.trim();
  if (patch.court !== undefined) set.court = patch.court.trim();
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
    const [row] = await db
      .insert(shareFiles)
      .values({
        folderId,
        url: file.url,
        pathname: file.pathname,
        filename: file.filename.slice(0, 255),
        contentType: file.contentType ?? null,
        sizeBytes: file.size ?? null,
        uploadedBy: session.email,
      })
      .returning({ id: shareFiles.id });
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (progress) { set.uploadTotal = progress.total; set.uploadDone = progress.done; set.uploadAt = new Date(); }
    await db.update(shareFolders).set(set).where(eq(shareFolders.id, folderId));
    // Arm the "new documents" digest clock — only if not already armed (so a burst
    // of uploads doesn't keep resetting it).
    await db.update(shareFolders).set({ notifyDueAt: new Date(Date.now() + DIGEST_DELAY_MS) }).where(and(eq(shareFolders.id, folderId), isNull(shareFolders.notifyDueAt)));
    revalidatePath(`/admin/share-folders/${folderId}`);
    return { ok: true as const, id: row.id };
  } catch (err) {
    console.error("[share] registerShareFile failed:", err);
    return { ok: false as const, error: "The file uploaded but couldn't be recorded. Run Settings → Database updates, then re-upload." };
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

/* -------------------------------- recipients ------------------------------- */

async function sendInvite(folderName: string, caseNumber: string, typeKey: string, email: string, name: string, token: string, expiresAt: Date, cc: string[], secure: boolean) {
  const link = `${await baseUrl()}/share/${token}`;
  const who = name.trim() ? esc(name.trim()) : "there";
  const caseLine = caseNumber ? `<p style="margin:0 0 14px;color:#555;font-size:13px">Case: ${esc(caseNumber)}</p>` : "";
  const days = expiryDaysForType(typeKey);
  const role = rolePhrase(typeKey);
  const openLabel = secure ? "Sign in to open the folder" : "Open the folder";
  const accessNote = secure
    ? `This access is specific to you. Opening the folder requires you to sign in with your password or a one-time code emailed to <strong>${esc(email)}</strong>, so a forwarded link will not work for anyone else. If someone else at your firm or office needs access, they must be invited separately — please have them request it, or email <a href="mailto:${REISSUE_CONTACT}" style="color:#7a1f2b">${REISSUE_CONTACT}</a> and we will send a link directly to them.`
    : `This is a private link that opens without a sign-in, so anyone who has it can view these documents — please do not forward or share it. If someone else needs access, email <a href="mailto:${REISSUE_CONTACT}" style="color:#7a1f2b">${REISSUE_CONTACT}</a> so we can send them their own link.`;
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
      <p style="margin:0 0 16px;font-size:12px;color:#666">${accessNote}</p>
      <p style="margin:16px 0 0;padding-top:12px;border-top:1px solid #e5e5e5;font-style:italic;font-size:10px;line-height:1.5;color:#8a8a8a">
        Confidentiality &amp; clawback notice: This message and the linked documents are confidential and may be protected by the attorney-client privilege, the attorney work-product doctrine, or other applicable privileges and protections. They are intended solely for the named recipient. If you are not the intended recipient, you are hereby notified that any review, use, disclosure, copying, or distribution is strictly prohibited. Please notify ${esc(FIRM.name)} immediately at <a href="mailto:${REISSUE_CONTACT}" style="color:#8a8a8a">${REISSUE_CONTACT}</a>, do not open or access the documents, and permanently delete and purge all copies from your files and systems. Any inadvertent disclosure of privileged or protected material is not intended to and shall not operate as a waiver of any privilege or protection, and ${esc(FIRM.name)} expressly reserves the right to demand the return or destruction of such material pursuant to Texas Rule of Civil Procedure 193.3(d) and Texas Rule of Evidence 511.
      </p>
    </div>`;
  // A per-recipient subject keeps Gmail from threading separate invites (to
  // different people, CC'd to the same person) into one conversation.
  const recipientLabel = name.trim() || email;
  return sendEmail({ to: email, cc, fromName: `${FIRM.name} — Secure Share`, subject: `${FIRM.shortName} shared "${folderName}" with ${recipientLabel}`, html });
}

export async function addRecipient(folderId: number, email: string, name: string, permission: string, kind: string, acknowledged: boolean): Promise<{ ok: boolean; error?: string; warnings?: ShareWarning[]; needsAck?: boolean }> {
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
    const expiresAt = new Date(Date.now() + expiryDaysForType(folder.type) * 86_400_000);
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
