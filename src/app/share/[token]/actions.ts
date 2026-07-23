"use server";

import { and, eq, inArray } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/db";
import { shareFiles, shareDirs, shareFolders, shareAccessLog } from "@/db/schema";
import { resolveRecipient, cleanDirPath } from "@/lib/share/access";
import { shareCan } from "@/lib/share/types";

/** Record a file a recipient uploaded (after the Blob upload resolves). */
export async function recipientRegisterFile(
  token: string,
  file: { url: string; pathname: string; filename: string; contentType?: string; size?: number; dir?: string },
  progress?: { total: number; done: number },
) {
  const ctx = await resolveRecipient(token);
  if (!ctx || !shareCan(ctx.rec.permission, "upload")) return { ok: false as const, error: "Not allowed." };
  if (!db) return { ok: false as const, error: "Unavailable." };
  const dir = cleanDirPath(file.dir ?? "");
  const base = (file.filename || "file").split("/").pop() || "file";
  const path = (dir ? `${dir}/${base}` : base).slice(0, 255);
  try {
    await db.insert(shareFiles).values({
      folderId: ctx.folder.id,
      url: file.url,
      pathname: file.pathname,
      filename: path,
      contentType: file.contentType ?? null,
      sizeBytes: file.size ?? null,
      uploadedBy: ctx.rec.email,
    });
    await db.insert(shareAccessLog).values({ folderId: ctx.folder.id, recipientId: ctx.rec.id, action: "upload" });
    if (progress) await db.update(shareFolders).set({ uploadTotal: progress.total, uploadDone: progress.done, uploadAt: new Date() }).where(eq(shareFolders.id, ctx.folder.id));
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't save the file." };
  }
}

/** Clear the live upload indicator when a recipient's batch finishes. */
export async function recipientClearUpload(token: string) {
  const ctx = await resolveRecipient(token);
  if (!ctx || !db) return { ok: false as const };
  try {
    await db.update(shareFolders).set({ uploadTotal: 0, uploadDone: 0, uploadAt: null }).where(eq(shareFolders.id, ctx.folder.id));
  } catch { /* best-effort */ }
  return { ok: true as const };
}

/** Create an (empty) folder inside the share. */
export async function recipientMkdir(token: string, path: string) {
  const ctx = await resolveRecipient(token);
  if (!ctx || !shareCan(ctx.rec.permission, "upload")) return { ok: false as const, error: "Not allowed." };
  if (!db) return { ok: false as const, error: "Unavailable." };
  const clean = cleanDirPath(path);
  if (!clean) return { ok: false as const, error: "Enter a folder name." };
  try {
    const existing = await db.select({ id: shareDirs.id }).from(shareDirs).where(and(eq(shareDirs.folderId, ctx.folder.id), eq(shareDirs.path, clean)));
    if (existing.length === 0) await db.insert(shareDirs).values({ folderId: ctx.folder.id, path: clean, createdBy: ctx.rec.email });
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't create the folder." };
  }
}

/** Delete a folder (and everything inside it) — manage permission only. */
export async function recipientDeleteDir(token: string, path: string) {
  const ctx = await resolveRecipient(token);
  if (!ctx || !shareCan(ctx.rec.permission, "delete")) return { ok: false as const, error: "Not allowed." };
  if (!db) return { ok: false as const, error: "Unavailable." };
  const clean = cleanDirPath(path);
  if (!clean) return { ok: false as const, error: "Invalid folder." };
  const prefix = `${clean}/`;
  try {
    const allFiles = await db.select().from(shareFiles).where(eq(shareFiles.folderId, ctx.folder.id));
    const victims = allFiles.filter((f) => f.filename === clean || f.filename.startsWith(prefix));
    for (const f of victims) { try { await del(f.url); } catch { /* best-effort */ } }
    if (victims.length) await db.delete(shareFiles).where(inArray(shareFiles.id, victims.map((f) => f.id)));
    const allDirs = await db.select().from(shareDirs).where(eq(shareDirs.folderId, ctx.folder.id));
    const deadDirs = allDirs.filter((d) => d.path === clean || d.path.startsWith(prefix));
    if (deadDirs.length) await db.delete(shareDirs).where(inArray(shareDirs.id, deadDirs.map((d) => d.id)));
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't delete the folder." };
  }
}

/** Delete a file the recipient can manage (must belong to their folder). */
export async function recipientDeleteFile(token: string, fileId: number) {
  const ctx = await resolveRecipient(token);
  if (!ctx || !shareCan(ctx.rec.permission, "delete")) return { ok: false as const, error: "Not allowed." };
  if (!db) return { ok: false as const, error: "Unavailable." };
  try {
    const [f] = await db.select().from(shareFiles).where(and(eq(shareFiles.id, fileId), eq(shareFiles.folderId, ctx.folder.id)));
    if (!f) return { ok: false as const, error: "Not found." };
    try { await del(f.url); } catch { /* best-effort */ }
    await db.delete(shareFiles).where(eq(shareFiles.id, fileId));
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't remove the file." };
  }
}
