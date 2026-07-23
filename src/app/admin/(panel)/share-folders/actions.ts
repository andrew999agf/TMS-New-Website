"use server";

import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/db";
import { shareFolders, shareFiles, shareRecipients, shareDirs } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { sendEmail } from "@/lib/email";
import { getSetting } from "@/lib/content";
import { FIRM } from "@/lib/firm";
import { shareType, recipientWarnings, expiryDaysForType, permissionLabel, type ShareWarning } from "@/lib/share/types";
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

export async function updateFolder(id: number, patch: { caseNumber?: string; name?: string; matter?: string; court?: string; type?: string; notes?: string }) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.caseNumber !== undefined) set.caseNumber = patch.caseNumber.trim();
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.matter !== undefined) set.matter = patch.matter.trim();
  if (patch.court !== undefined) set.court = patch.court.trim();
  if (patch.type !== undefined && shareType(patch.type)) set.type = patch.type;
  if (patch.notes !== undefined) set.notes = patch.notes;
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

export async function registerShareFile(folderId: number, file: { url: string; pathname: string; filename: string; contentType?: string; size?: number }) {
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
    await db.update(shareFolders).set({ updatedAt: new Date() }).where(eq(shareFolders.id, folderId));
    revalidatePath(`/admin/share-folders/${folderId}`);
    return { ok: true as const, id: row.id };
  } catch (err) {
    console.error("[share] registerShareFile failed:", err);
    return { ok: false as const, error: "The file uploaded but couldn't be recorded. Run Settings → Database updates, then re-upload." };
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

async function sendInvite(folderName: string, caseNumber: string, typeKey: string, email: string, name: string, token: string, expiresAt: Date, cc: string[]) {
  const link = `${await baseUrl()}/share/${token}`;
  const who = name.trim() ? esc(name.trim()) : "there";
  const caseLine = caseNumber ? `<p style="margin:0 0 14px;color:#555;font-size:13px">Case: ${esc(caseNumber)}</p>` : "";
  const days = expiryDaysForType(typeKey);
  const html = `
    <div style="font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;max-width:560px;line-height:1.55">
      <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a1f2b;margin:0 0 16px">${esc(FIRM.name)}</p>
      <p style="margin:0 0 14px">Hello ${who},</p>
      <p style="margin:0 0 6px">${esc(FIRM.name)} has shared a secure document folder with you:</p>
      <p style="margin:0 0 4px;font-size:16px;font-weight:bold">${esc(folderName)}</p>
      ${caseLine}
      <p style="margin:0 0 18px"><a href="${link}" style="background:#7a1f2b;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;display:inline-block">Open the folder</a></p>
      <p style="margin:0 0 8px;font-size:13px;color:#777">Or paste this link into your browser:</p>
      <p style="margin:0 0 16px;font-size:12px;color:#777;word-break:break-all">${link}</p>
      <p style="margin:0 0 8px;font-size:13px;color:#444">For security, this link will <strong>automatically expire in ${days} days</strong> — on <strong>${fmtExpiry(expiresAt)}</strong>. If you need it re-issued after that, contact <a href="mailto:${REISSUE_CONTACT}" style="color:#7a1f2b">${REISSUE_CONTACT}</a>.</p>
      <p style="margin:0;font-size:12px;color:#999">This link is unique to you — please don't forward it. If you weren't expecting this, you can ignore this email.</p>
    </div>`;
  return sendEmail({ to: email, cc, fromName: `${FIRM.name} — Secure Share`, subject: `${FIRM.shortName} shared "${folderName}" with you`, html });
}

export async function addRecipient(folderId: number, email: string, name: string, permission: string, acknowledged: boolean): Promise<{ ok: boolean; error?: string; warnings?: ShareWarning[]; needsAck?: boolean }> {
  const session = await guard();
  if (!db) return { ok: false, error: "Database not configured." };
  const cleanEmail = email.trim().toLowerCase();
  if (!EMAIL_RE.test(cleanEmail)) return { ok: false, error: "Enter a valid email address." };
  const perm = ["view", "download", "upload", "manage"].includes(permission) ? permission : "download";
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
    await db.insert(shareRecipients).values({ folderId, email: cleanEmail, name: name.trim(), token, permission: perm, invitedBy: session.email, expiresAt });
    await db.update(shareFolders).set({ updatedAt: new Date() }).where(eq(shareFolders.id, folderId));
    const res = await sendInvite(folder.name, folder.caseNumber, folder.type, cleanEmail, name, token, expiresAt, await shareCc());
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
    const res = await sendInvite(folder.name, folder.caseNumber, folder.type, r.email, r.name, r.token, expiresAt, await shareCc());
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
