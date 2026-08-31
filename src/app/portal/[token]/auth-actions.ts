"use server";

import { randomInt } from "crypto";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { portalUsers, portalMembers } from "@/db/schema";
import { resolvePortalMember } from "@/lib/portal-access";
import { setPortalCookie } from "@/lib/share/portal-session";
import { sendEmail } from "@/lib/email";
import { FIRM } from "@/lib/firm";

type Result = { ok: boolean; error?: string };

async function ensureUser(email: string, name?: string) {
  if (!db) return null;
  const [existing] = await db.select().from(portalUsers).where(eq(portalUsers.email, email.toLowerCase()));
  if (existing) return existing;
  const [u] = await db.insert(portalUsers).values({ email: email.toLowerCase(), name: name ?? "" }).returning();
  return u;
}

/** Email a 6-digit one-time code to the invited client. */
export async function requestPortalCode(token: string): Promise<Result> {
  const ctx = await resolvePortalMember(token);
  if (!ctx || !db) return { ok: false, error: "This link is no longer active." };
  const u = await ensureUser(ctx.member.email, ctx.member.name);
  if (!u) return { ok: false, error: "Couldn't send a code." };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.update(portalUsers).set({ otpHash: await bcrypt.hash(code, 10), otpExpires: new Date(Date.now() + 10 * 60_000), otpAttempts: 0 }).where(eq(portalUsers.id, u.id));
  const html = `
    <div style="font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;max-width:520px;line-height:1.55">
      <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a1f2b;margin:0 0 16px">${FIRM.name}</p>
      <p style="margin:0 0 10px">Here is your one-time code to sign in to your client portal with ${FIRM.name}:</p>
      <p style="margin:0 0 12px;font-size:30px;font-weight:bold;letter-spacing:6px;font-family:Menlo,Consolas,monospace">${code}</p>
      <p style="margin:0;font-size:13px;color:#777">This code is specific to you (${ctx.member.email}) and expires in 10 minutes. If you didn't request it, you can ignore this email — no one can get in without it.</p>
    </div>`;
  const res = await sendEmail({ to: ctx.member.email, fromName: `${FIRM.name} — Client Portal`, subject: `Your sign-in code: ${code}`, html });
  return res.sent ? { ok: true } : { ok: false, error: "Couldn't send the code — please try again." };
}

/** Verify the code and sign the client in for this email. */
export async function portalCodeLogin(token: string, code: string): Promise<Result> {
  const ctx = await resolvePortalMember(token);
  if (!ctx || !db) return { ok: false, error: "This link is no longer active." };
  const [u] = await db.select().from(portalUsers).where(eq(portalUsers.email, ctx.member.email.toLowerCase()));
  if (!u?.otpHash || !u.otpExpires) return { ok: false, error: "Request a code first." };
  if (u.otpExpires < new Date()) return { ok: false, error: "That code has expired — request a new one." };
  if (u.otpAttempts >= 6) return { ok: false, error: "Too many tries — request a new code." };
  if (!(await bcrypt.compare(code.trim(), u.otpHash))) {
    await db.update(portalUsers).set({ otpAttempts: u.otpAttempts + 1 }).where(eq(portalUsers.id, u.id));
    return { ok: false, error: "That code isn't right." };
  }
  await db.update(portalUsers).set({ otpHash: null, otpExpires: null, verified: true, lastLoginAt: new Date() }).where(eq(portalUsers.id, u.id));
  await db.update(portalMembers).set({ lastAccessAt: new Date() }).where(eq(portalMembers.id, ctx.member.id));
  await setPortalCookie(ctx.member.email);
  return { ok: true };
}
