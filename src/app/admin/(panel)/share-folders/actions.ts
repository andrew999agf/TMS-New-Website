"use server";

import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/db";
import { shareFolders, shareFiles, shareRecipients } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { sendEmail } from "@/lib/email";
import { FIRM } from "@/lib/firm";
import { shareType, recipientWarnings, type ShareWarning } from "@/lib/share/types";

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

export async function createFolder(input: { caseNumber: string; name: string; type: string }) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const name = input.name.trim();
  if (!name) return { ok: false as const, error: "Enter a client / matter name." };
  if (!shareType(input.type)) return { ok: false as const, error: "Pick a folder type." };
  const [row] = await db
    .insert(shareFolders)
    .values({ caseNumber: input.caseNumber.trim(), name, type: input.type, createdBy: session.email })
    .returning({ id: shareFolders.id });
  await audit(session.email, "create", "share-folder", String(row.id), `${input.type} folder: ${name}`);
  revalidatePath("/admin/share-folders");
  return { ok: true as const, id: row.id };
}

export async function updateFolder(id: number, patch: { caseNumber?: string; name?: string; type?: string; notes?: string }) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.caseNumber !== undefined) set.caseNumber = patch.caseNumber.trim();
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.type !== undefined && shareType(patch.type)) set.type = patch.type;
  if (patch.notes !== undefined) set.notes = patch.notes;
  await db.update(shareFolders).set(set).where(eq(shareFolders.id, id));
  await audit(session.email, "update", "share-folder", String(id), "Updated folder");
  revalidatePath("/admin/share-folders");
  revalidatePath(`/admin/share-folders/${id}`);
  return { ok: true as const };
}

export async function archiveFolder(id: number, archived: boolean) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  await db.update(shareFolders).set({ archived, updatedAt: new Date() }).where(eq(shareFolders.id, id));
  await audit(session.email, "update", "share-folder", String(id), archived ? "Archived" : "Unarchived");
  revalidatePath("/admin/share-folders");
  revalidatePath(`/admin/share-folders/${id}`);
  return { ok: true as const };
}

export async function deleteFolder(id: number) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
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
}

/* ---------------------------------- files ---------------------------------- */

export async function registerShareFile(folderId: number, file: { url: string; pathname: string; filename: string; contentType?: string; size?: number }) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
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
}

export async function deleteFile(id: number) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const [f] = await db.select().from(shareFiles).where(eq(shareFiles.id, id));
  if (!f) return { ok: false as const, error: "Not found." };
  try { await del(f.url); } catch { /* best-effort */ }
  await db.delete(shareFiles).where(eq(shareFiles.id, id));
  await audit(session.email, "delete", "share-file", String(id), f.filename);
  revalidatePath(`/admin/share-folders/${f.folderId}`);
  return { ok: true as const };
}

/* -------------------------------- recipients ------------------------------- */

async function sendInvite(folderName: string, caseNumber: string, typeKey: string, email: string, name: string, token: string) {
  const link = `${await baseUrl()}/share/${token}`;
  const t = shareType(typeKey);
  const who = name.trim() ? esc(name.trim()) : "there";
  const caseLine = caseNumber ? `<p style="margin:0 0 14px;color:#555;font-size:13px">Case: ${esc(caseNumber)}</p>` : "";
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
      <p style="margin:0;font-size:12px;color:#999">This link is unique to you — please don't forward it. If you weren't expecting this, you can ignore this email.</p>
    </div>`;
  return sendEmail({ to: email, fromName: `${FIRM.name} — Secure Share`, subject: `${FIRM.shortName} shared "${folderName}" with you`, html });
}

export async function addRecipient(folderId: number, email: string, name: string, acknowledged: boolean): Promise<{ ok: boolean; error?: string; warnings?: ShareWarning[]; needsAck?: boolean }> {
  const session = await guard();
  if (!db) return { ok: false, error: "Database not configured." };
  const cleanEmail = email.trim().toLowerCase();
  if (!EMAIL_RE.test(cleanEmail)) return { ok: false, error: "Enter a valid email address." };
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
  await db.insert(shareRecipients).values({ folderId, email: cleanEmail, name: name.trim(), token, invitedBy: session.email });
  await db.update(shareFolders).set({ updatedAt: new Date() }).where(eq(shareFolders.id, folderId));
  const res = await sendInvite(folder.name, folder.caseNumber, folder.type, cleanEmail, name, token);
  await audit(session.email, "create", "share-recipient", String(folderId), `Shared with ${cleanEmail}`);
  revalidatePath(`/admin/share-folders/${folderId}`);
  return { ok: true, error: res.sent ? undefined : "Added, but the invite email didn't send (check email settings)." };
}

export async function resendInvite(recipientId: number) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const [r] = await db.select().from(shareRecipients).where(eq(shareRecipients.id, recipientId));
  if (!r) return { ok: false as const, error: "Not found." };
  const [folder] = await db.select().from(shareFolders).where(eq(shareFolders.id, r.folderId));
  if (!folder) return { ok: false as const, error: "Folder not found." };
  const res = await sendInvite(folder.name, folder.caseNumber, folder.type, r.email, r.name, r.token);
  return res.sent ? { ok: true as const } : { ok: false as const, error: "Email didn't send (check email settings)." };
}

export async function setRecipientRevoked(recipientId: number, revoked: boolean) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const [r] = await db.select().from(shareRecipients).where(eq(shareRecipients.id, recipientId));
  if (!r) return { ok: false as const, error: "Not found." };
  await db.update(shareRecipients).set({ revoked }).where(eq(shareRecipients.id, recipientId));
  await audit(session.email, "update", "share-recipient", String(recipientId), revoked ? `Revoked ${r.email}` : `Restored ${r.email}`);
  revalidatePath(`/admin/share-folders/${r.folderId}`);
  return { ok: true as const };
}
