"use server";

import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { admins } from "@/db/schema";

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
