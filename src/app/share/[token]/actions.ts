"use server";

import { randomBytes } from "crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/db";
import { shareFiles, shareDirs, shareFolders, shareAccessLog } from "@/db/schema";
import { resolveRecipient, cleanDirPath, DIGEST_DELAY_MS } from "@/lib/share/access";
import { shareCan, normalizeMeta } from "@/lib/share/types";
import { sanitizeRichText, hasRichText } from "@/lib/share/sanitize";
import { shareNotifyList } from "@/lib/share/notify";
import { sendEmail } from "@/lib/email";
import { FIRM } from "@/lib/firm";

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
    // Arm the "new documents" digest clock (only if not already armed).
    await db.update(shareFolders).set({ notifyDueAt: new Date(Date.now() + DIGEST_DELAY_MS) }).where(and(eq(shareFolders.id, ctx.folder.id), isNull(shareFolders.notifyDueAt)));
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't save the file." };
  }
}

/** A viewer with upload/manage rights checks a to-do done (or reopens it),
 *  stamping their name/initials and the date. */
export async function recipientToggleTodo(token: string, todoId: string, done: boolean, who: string) {
  const ctx = await resolveRecipient(token);
  if (!ctx || !shareCan(ctx.rec.permission, "upload")) return { ok: false as const, error: "Not allowed." };
  if (!db) return { ok: false as const, error: "Unavailable." };
  const meta = normalizeMeta(ctx.folder.meta);
  const todo = (meta.todos ?? []).find((t) => t.id === todoId);
  if (!todo) return { ok: false as const, error: "Task not found." };
  if (done) {
    todo.doneBy = (who || ctx.rec.name || ctx.rec.email).slice(0, 60);
    todo.doneAt = new Date().toISOString();
  } else {
    delete todo.doneBy;
    delete todo.doneAt;
  }
  try {
    await db.update(shareFolders).set({ meta: meta as Record<string, unknown> }).where(eq(shareFolders.id, ctx.folder.id));
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't update the task." };
  }
}

/** A recipient types (or updates) their answer to a task's question. Any recipient
 *  with access may answer — it's not gated on upload rights. HTML is sanitized. */
export async function recipientSetTaskAnswer(token: string, todoId: string, html: string) {
  const ctx = await resolveRecipient(token);
  if (!ctx) return { ok: false as const, error: "Not allowed." };
  if (!db) return { ok: false as const, error: "Unavailable." };
  const meta = normalizeMeta(ctx.folder.meta);
  const todo = (meta.todos ?? []).find((t) => t.id === todoId);
  if (!todo || !todo.answerEnabled) return { ok: false as const, error: "This task doesn't take an answer." };
  const clean = sanitizeRichText(html);
  todo.answer = clean || undefined;
  todo.answerAt = clean ? new Date().toISOString() : undefined;
  try {
    await db.update(shareFolders).set({ meta: meta as Record<string, unknown> }).where(eq(shareFolders.id, ctx.folder.id));
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't save your answer." };
  }
}

/** The recipient confirms their answer: it's saved and the firm is emailed. */
export async function recipientSubmitAnswer(token: string, todoId: string, html: string) {
  const ctx = await resolveRecipient(token);
  if (!ctx) return { ok: false as const, error: "Not allowed." };
  if (!db) return { ok: false as const, error: "Unavailable." };
  const meta = normalizeMeta(ctx.folder.meta);
  const todo = (meta.todos ?? []).find((t) => t.id === todoId);
  if (!todo || !todo.answerEnabled) return { ok: false as const, error: "This task doesn't take an answer." };
  const clean = sanitizeRichText(html);
  if (!hasRichText(clean)) return { ok: false as const, error: "Please type an answer first." };
  todo.answer = clean;
  todo.answerAt = new Date().toISOString();
  try {
    await db.update(shareFolders).set({ meta: meta as Record<string, unknown> }).where(eq(shareFolders.id, ctx.folder.id));
  } catch {
    return { ok: false as const, error: "Couldn't save your answer." };
  }
  // Notify the firm: the folder's creator plus the shared notification list.
  try {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const to = Array.from(new Set([(ctx.folder.createdBy ?? "").trim().toLowerCase(), ...(await shareNotifyList())].filter(Boolean)));
    if (to.length) {
      const base = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${FIRM.domain}`;
      const who = ctx.rec.name?.trim() || ctx.rec.email;
      const body = `
        <div style="font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;max-width:560px;line-height:1.55">
          <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a1f2b;margin:0 0 16px">${esc(FIRM.name)}</p>
          <p style="margin:0 0 6px"><strong>${esc(who)}</strong> answered a task in <strong>${esc(ctx.folder.name)}</strong>${ctx.folder.caseNumber ? ` (Case ${esc(ctx.folder.caseNumber)})` : ""}.</p>
          <p style="margin:14px 0 4px;font-weight:bold">Task</p>
          <p style="margin:0 0 12px">${esc(todo.text)}</p>
          <p style="margin:14px 0 4px;font-weight:bold">Their answer</p>
          <div style="margin:0 0 16px;padding:12px 14px;border-left:3px solid #7a1f2b;background:#faf6f2">${clean}</div>
          <p style="margin:0"><a href="${base}/admin/share-folders/${ctx.folder.id}" style="color:#7a1f2b">Open the folder in the admin portal</a></p>
        </div>`;
      const taskShort = todo.text.trim().replace(/\s+/g, " ").slice(0, 50);
      await sendEmail({
        to,
        fromName: `${FIRM.name} — Secure Share`,
        subject: `${who} answered: ${taskShort}${todo.text.length > 50 ? "…" : ""} (${ctx.folder.name})`,
        html: body,
        headers: { "X-Entity-Ref-ID": randomBytes(12).toString("hex") },
      });
    }
  } catch {
    /* the answer is saved; a failed email shouldn't fail the submit */
  }
  return { ok: true as const };
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

/** Rename a folder — recipients with full (manage) access only. */
export async function recipientRenameDir(token: string, path: string, newName: string) {
  const ctx = await resolveRecipient(token);
  if (!ctx || !shareCan(ctx.rec.permission, "delete")) return { ok: false as const, error: "Not allowed." };
  if (!db) return { ok: false as const, error: "Unavailable." };
  const oldClean = cleanDirPath(path);
  if (!oldClean) return { ok: false as const, error: "Invalid folder." };
  const seg = cleanDirPath((newName || "").replace(/[/\\]+/g, " "));
  if (!seg) return { ok: false as const, error: "Enter a folder name." };
  const parent = oldClean.split("/").slice(0, -1).join("/");
  const newPath = parent ? `${parent}/${seg}` : seg;
  if (newPath === oldClean) return { ok: true as const };
  const prefix = `${oldClean}/`;
  try {
    const files = await db.select().from(shareFiles).where(eq(shareFiles.folderId, ctx.folder.id));
    for (const f of files) {
      if (f.filename === oldClean || f.filename.startsWith(prefix)) {
        await db.update(shareFiles).set({ filename: (newPath + f.filename.slice(oldClean.length)).slice(0, 255) }).where(eq(shareFiles.id, f.id));
      }
    }
    const dirs = await db.select().from(shareDirs).where(eq(shareDirs.folderId, ctx.folder.id));
    for (const d of dirs) {
      if (d.path === oldClean || d.path.startsWith(prefix)) {
        await db.update(shareDirs).set({ path: (newPath + d.path.slice(oldClean.length)).slice(0, 512) }).where(eq(shareDirs.id, d.id));
      }
    }
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't rename the folder." };
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
