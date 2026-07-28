"use server";

import { randomInt } from "crypto";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { portalUsers } from "@/db/schema";
import { resolvePublicFolder, recipientOfFolder } from "@/lib/share/public-file";
import { setPortalCookie } from "@/lib/share/portal-session";
import { sendEmail } from "@/lib/email";
import { FIRM } from "@/lib/firm";

type Result = { ok: boolean; error?: string; hasPassword?: boolean };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Verify the email is an invited recipient of the folder behind this public
 *  token, and whether they already have a password. Doesn't sign anyone in. */
export async function publicFileStart(token: string, email: string): Promise<Result> {
  const e = (email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(e)) return { ok: false, error: "Enter a valid email address." };
  const ctx = await resolvePublicFolder(token);
  if (!ctx || !db) return { ok: false, error: "This link is no longer active." };
  const rec = await recipientOfFolder(ctx.folder.id, e);
  if (!rec) return { ok: false, error: "That email isn't on the access list for this document. Ask the firm to invite you." };
  const [u] = await db.select().from(portalUsers).where(eq(portalUsers.email, e));
  return { ok: true, hasPassword: !!u?.passwordHash };
}

async function ensureUser(email: string, name?: string) {
  if (!db) return null;
  const [existing] = await db.select().from(portalUsers).where(eq(portalUsers.email, email));
  if (existing) return existing;
  const [u] = await db.insert(portalUsers).values({ email, name: name ?? "" }).returning();
  return u;
}

/** Email a 6-digit one-time code to the recipient. */
export async function publicFileRequestCode(token: string, email: string): Promise<Result> {
  const e = (email || "").trim().toLowerCase();
  const ctx = await resolvePublicFolder(token);
  if (!ctx || !db) return { ok: false, error: "This link is no longer active." };
  const rec = await recipientOfFolder(ctx.folder.id, e);
  if (!rec) return { ok: false, error: "That email isn't on the access list for this document." };
  const u = await ensureUser(e, rec.name);
  if (!u) return { ok: false, error: "Couldn't send a code." };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.update(portalUsers).set({ otpHash: await bcrypt.hash(code, 10), otpExpires: new Date(Date.now() + 10 * 60_000), otpAttempts: 0 }).where(eq(portalUsers.id, u.id));
  const html = `
    <div style="font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;max-width:520px;line-height:1.55">
      <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a1f2b;margin:0 0 16px">${FIRM.name}</p>
      <p style="margin:0 0 10px">Here is your one-time code to open the document ${FIRM.name} shared with you:</p>
      <p style="margin:0 0 12px;font-size:30px;font-weight:bold;letter-spacing:6px;font-family:Menlo,Consolas,monospace">${code}</p>
      <p style="margin:0;font-size:13px;color:#777">This code is specific to you (${e}) and expires in 10 minutes.</p>
    </div>`;
  const res = await sendEmail({ to: e, fromName: `${FIRM.name} — Secure Share`, subject: `Your access code: ${code}`, html });
  return res.sent ? { ok: true } : { ok: false, error: "Couldn't send the code — please try again." };
}

async function checkCode(email: string, code: string): Promise<{ ok: boolean; error?: string; id?: number }> {
  if (!db) return { ok: false, error: "Unavailable." };
  const [u] = await db.select().from(portalUsers).where(eq(portalUsers.email, email));
  if (!u?.otpHash || !u.otpExpires) return { ok: false, error: "Request a code first." };
  if (u.otpExpires < new Date()) return { ok: false, error: "That code has expired — request a new one." };
  if (u.otpAttempts >= 6) return { ok: false, error: "Too many tries — request a new code." };
  if (!(await bcrypt.compare(code.trim(), u.otpHash))) {
    await db.update(portalUsers).set({ otpAttempts: u.otpAttempts + 1 }).where(eq(portalUsers.id, u.id));
    return { ok: false, error: "That code isn't right." };
  }
  return { ok: true, id: u.id };
}

/** Sign in with a one-time code. */
export async function publicFileCodeLogin(token: string, email: string, code: string): Promise<Result> {
  const e = (email || "").trim().toLowerCase();
  const ctx = await resolvePublicFolder(token);
  if (!ctx || !db) return { ok: false, error: "This link is no longer active." };
  if (!(await recipientOfFolder(ctx.folder.id, e))) return { ok: false, error: "That email isn't on the access list." };
  const r = await checkCode(e, code);
  if (!r.ok) return r;
  await db.update(portalUsers).set({ otpHash: null, otpExpires: null, verified: true, lastLoginAt: new Date() }).where(eq(portalUsers.id, r.id!));
  await setPortalCookie(e);
  return { ok: true };
}

/** Sign in with a password already on file. */
export async function publicFilePasswordLogin(token: string, email: string, password: string): Promise<Result> {
  const e = (email || "").trim().toLowerCase();
  const ctx = await resolvePublicFolder(token);
  if (!ctx || !db) return { ok: false, error: "This link is no longer active." };
  if (!(await recipientOfFolder(ctx.folder.id, e))) return { ok: false, error: "That email isn't on the access list." };
  const [u] = await db.select().from(portalUsers).where(eq(portalUsers.email, e));
  if (!u?.passwordHash) return { ok: false, error: "No password is set — use a one-time code instead." };
  if (!(await bcrypt.compare(password, u.passwordHash))) return { ok: false, error: "Incorrect password." };
  await db.update(portalUsers).set({ lastLoginAt: new Date() }).where(eq(portalUsers.id, u.id));
  await setPortalCookie(e);
  return { ok: true };
}
