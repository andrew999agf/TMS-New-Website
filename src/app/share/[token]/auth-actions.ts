"use server";

import { randomInt } from "crypto";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { portalUsers } from "@/db/schema";
import { resolveRecipient } from "@/lib/share/access";
import { setPortalCookie } from "@/lib/share/portal-session";
import { sendEmail } from "@/lib/email";
import { FIRM } from "@/lib/firm";

type Result = { ok: boolean; error?: string };

async function userFor(email: string) {
  if (!db) return null;
  const [u] = await db.select().from(portalUsers).where(eq(portalUsers.email, email.toLowerCase()));
  return u ?? null;
}

async function ensureUser(email: string, name?: string) {
  if (!db) return null;
  const existing = await userFor(email);
  if (existing) return existing;
  const [u] = await db.insert(portalUsers).values({ email: email.toLowerCase(), name: name ?? "" }).returning();
  return u;
}

/** Log in with a password already on file. */
export async function portalPasswordLogin(token: string, password: string): Promise<Result> {
  const ctx = await resolveRecipient(token);
  if (!ctx || !db) return { ok: false, error: "This link is no longer active." };
  const u = await userFor(ctx.rec.email);
  if (!u?.passwordHash) return { ok: false, error: "No password is set for this email — use a one-time code instead." };
  if (!(await bcrypt.compare(password, u.passwordHash))) return { ok: false, error: "Incorrect password." };
  await db.update(portalUsers).set({ lastLoginAt: new Date() }).where(eq(portalUsers.id, u.id));
  await setPortalCookie(ctx.rec.email);
  return { ok: true };
}

/** Create a login (set a password) and sign in. */
export async function portalCreateLogin(token: string, password: string): Promise<Result> {
  const ctx = await resolveRecipient(token);
  if (!ctx || !db) return { ok: false, error: "This link is no longer active." };
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  const u = await ensureUser(ctx.rec.email, ctx.rec.name);
  if (!u) return { ok: false, error: "Couldn't set up your login." };
  await db.update(portalUsers).set({ passwordHash: await bcrypt.hash(password, 12), verified: true, lastLoginAt: new Date() }).where(eq(portalUsers.id, u.id));
  await setPortalCookie(ctx.rec.email);
  return { ok: true };
}

/** Email a 6-digit one-time code to the invited address. */
export async function portalRequestCode(token: string): Promise<Result> {
  const ctx = await resolveRecipient(token);
  if (!ctx || !db) return { ok: false, error: "This link is no longer active." };
  const u = await ensureUser(ctx.rec.email, ctx.rec.name);
  if (!u) return { ok: false, error: "Couldn't send a code." };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.update(portalUsers).set({ otpHash: await bcrypt.hash(code, 10), otpExpires: new Date(Date.now() + 10 * 60_000), otpAttempts: 0 }).where(eq(portalUsers.id, u.id));
  const html = `
    <div style="font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;max-width:520px;line-height:1.55">
      <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a1f2b;margin:0 0 16px">${FIRM.name}</p>
      <p style="margin:0 0 10px">Here is your one-time code to open the documents ${FIRM.name} shared with you:</p>
      <p style="margin:0 0 12px;font-size:30px;font-weight:bold;letter-spacing:6px;font-family:Menlo,Consolas,monospace">${code}</p>
      <p style="margin:0;font-size:13px;color:#777">This code is specific to you (${ctx.rec.email}) and expires in 10 minutes. If you didn't request it, you can ignore this email — no one can get in without it.</p>
    </div>`;
  const res = await sendEmail({ to: ctx.rec.email, fromName: `${FIRM.name} — Secure Share`, subject: `Your access code: ${code}`, html });
  return res.sent ? { ok: true } : { ok: false, error: "Couldn't send the code — please try again." };
}

async function checkCode(email: string, code: string): Promise<{ ok: boolean; error?: string; id?: number }> {
  const u = await userFor(email);
  if (!u?.otpHash || !u.otpExpires) return { ok: false, error: "Request a code first." };
  if (u.otpExpires < new Date()) return { ok: false, error: "That code has expired — request a new one." };
  if (u.otpAttempts >= 6) return { ok: false, error: "Too many tries — request a new code." };
  if (!(await bcrypt.compare(code.trim(), u.otpHash))) {
    if (db) await db.update(portalUsers).set({ otpAttempts: u.otpAttempts + 1 }).where(eq(portalUsers.id, u.id));
    return { ok: false, error: "That code isn't right." };
  }
  return { ok: true, id: u.id };
}

/** Sign in with a one-time code. */
export async function portalCodeLogin(token: string, code: string): Promise<Result> {
  const ctx = await resolveRecipient(token);
  if (!ctx || !db) return { ok: false, error: "This link is no longer active." };
  const r = await checkCode(ctx.rec.email, code);
  if (!r.ok) return r;
  await db.update(portalUsers).set({ otpHash: null, otpExpires: null, verified: true, lastLoginAt: new Date() }).where(eq(portalUsers.id, r.id!));
  await setPortalCookie(ctx.rec.email);
  return { ok: true };
}

/** Reset a forgotten password using a one-time code, then sign in. */
export async function portalResetWithCode(token: string, code: string, newPassword: string): Promise<Result> {
  const ctx = await resolveRecipient(token);
  if (!ctx || !db) return { ok: false, error: "This link is no longer active." };
  if (newPassword.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  const r = await checkCode(ctx.rec.email, code);
  if (!r.ok) return r;
  await db.update(portalUsers).set({ passwordHash: await bcrypt.hash(newPassword, 12), otpHash: null, otpExpires: null, verified: true, lastLoginAt: new Date() }).where(eq(portalUsers.id, r.id!));
  await setPortalCookie(ctx.rec.email);
  return { ok: true };
}
