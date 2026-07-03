"use server";

import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { FIRM } from "@/lib/firm";

/** Hosts we'll echo into a reset link. Anything else falls back to the firm
 *  domain so a spoofed Host header can't steer the link somewhere malicious. */
const LINK_HOSTS = new Set([
  "texaslawsmith.com",
  "www.texaslawsmith.com",
  "patriotseriestexas.com",
  "www.patriotseriestexas.com",
  "localhost",
]);

/** Per-email cooldown so the public form can't be used to spam an inbox. */
const RESET_COOLDOWN_MS = 60_000;
const lastRequest = new Map<string, number>();

/**
 * Public "forgot password": if the email has an admin account, store a
 * short-lived token and email a reset link. Always returns the same generic
 * result, so the form can't be used to probe which emails have logins.
 */
export async function requestPasswordReset(emailRaw: string) {
  const generic = { ok: true as const };
  const email = (emailRaw || "").trim().toLowerCase();
  if (!db || !email || !/.+@.+\..+/.test(email)) return generic;

  const now = Date.now();
  if (now - (lastRequest.get(email) ?? 0) < RESET_COOLDOWN_MS) return generic;
  lastRequest.set(email, now);

  const [a] = await db.select().from(admins).where(eq(admins.email, email));
  if (!a) return generic;

  const token = randomBytes(24).toString("hex");
  const expires = new Date(now + 60 * 60 * 1000); // 1 hour
  await db.update(admins).set({ resetToken: token, resetExpires: expires }).where(eq(admins.id, a.id));

  // Build the link on the host the person is actually using (firm or Patriot
  // domain), falling back to the firm site for anything unrecognized.
  const host = ((await headers()).get("host") ?? "").split(":")[0].toLowerCase();
  const base =
    LINK_HOSTS.has(host) || host.endsWith(".vercel.app")
      ? `https://${host}`
      : (process.env.NEXT_PUBLIC_SITE_URL ?? `https://${FIRM.domain}`);
  const link = `${base}/admin/reset?token=${token}&email=${encodeURIComponent(a.email)}`;

  const html = `
    <div style="font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;max-width:560px;line-height:1.55">
      <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a1f2b;margin:0 0 16px">T. Maxwell Smith, PLLC</p>
      <p style="margin:0 0 14px">Hello ${a.name.replace(/</g, "")},</p>
      <p style="margin:0 0 14px">We received a request to reset the password for your admin login. Click below to choose a new password:</p>
      <p style="margin:0 0 18px"><a href="${link}" style="background:#7a1f2b;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;display:inline-block">Reset your password</a></p>
      <p style="margin:0 0 8px;font-size:13px;color:#777">Or paste this link into your browser:</p>
      <p style="margin:0 0 16px;font-size:12px;color:#777;word-break:break-all">${link}</p>
      <p style="margin:0;font-size:13px;color:#777">This link expires in 1 hour. If you didn't request a reset, you can ignore this email — your password is unchanged.</p>
    </div>`;
  await sendEmail({ to: a.email, fromName: `${FIRM.name} — Accounts`, subject: "Reset your admin password", html });
  return generic;
}

/** Set a new password using a valid setup/reset token. Public (no session). */
export async function setPasswordWithToken(email: string, token: string, password: string) {
  if (!db) return { ok: false, error: "Database not configured." };
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  const [a] = await db.select().from(admins).where(eq(admins.email, email.trim().toLowerCase()));
  if (!a || !a.resetToken || a.resetToken !== token) return { ok: false, error: "This link is invalid. Ask your administrator to send a new one." };
  if (!a.resetExpires || a.resetExpires < new Date()) return { ok: false, error: "This link has expired. Ask your administrator to send a new one." };
  const passwordHash = await bcrypt.hash(password, 12);
  await db
    .update(admins)
    .set({ passwordHash, resetToken: null, resetExpires: null, failedLogins: 0, lockedUntil: null })
    .where(eq(admins.id, a.id));
  return { ok: true };
}
