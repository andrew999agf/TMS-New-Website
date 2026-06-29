"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { admins, settings } from "@/db/schema";
import { requireFullAdmin, audit } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { FIRM } from "@/lib/firm";
import { TOGGLEABLE_SECTIONS } from "@/lib/admin-sections";

/** Per-admin default Time Tracker activity user, keyed by admin id. */
const TT_USER_DEFAULTS_KEY = "tt.userDefaults";

/** Tie an admin login to a Time Tracker activity user (their default). */
export async function setUserActivityDefault(adminId: number, activityUserName: string) {
  const session = await requireFullAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  const [row] = await db.select().from(settings).where(eq(settings.key, TT_USER_DEFAULTS_KEY));
  const map: Record<string, string> = { ...((row?.value as Record<string, string>) ?? {}) };
  const name = activityUserName.trim();
  if (name) map[String(adminId)] = name;
  else delete map[String(adminId)];
  await db
    .insert(settings)
    .values({ key: TT_USER_DEFAULTS_KEY, value: map, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value: map, updatedAt: new Date() } });
  await audit(session.email, "update", "tt-user-default", String(adminId), `Default activity user → ${name || "(name match)"}`);
  revalidatePath("/admin/time-tracker-4");
  revalidatePath("/admin/time-tracker");
  return { ok: true };
}

type Role = "owner" | "editor" | "timekeeper";
const ROLES: Role[] = ["owner", "editor", "timekeeper"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createLogin(input: { name: string; email: string; role: Role; password: string }) {
  const session = await requireFullAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  const email = input.email.trim().toLowerCase();
  if (!input.name.trim()) return { ok: false, error: "Name is required." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email." };
  if (!ROLES.includes(input.role)) return { ok: false, error: "Invalid role." };
  if (input.password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };

  try {
    const passwordHash = await bcrypt.hash(input.password, 12);
    await db.insert(admins).values({ name: input.name.trim(), email, role: input.role, passwordHash });
    await audit(session.email, "create", "login", email, `Created ${input.role} login`);
    revalidatePath("/admin/logins");
    return { ok: true };
  } catch (err) {
    const msg = (err as Error).message;
    if (/unique|duplicate/i.test(msg)) return { ok: false, error: "A login with that email already exists." };
    return { ok: false, error: msg };
  }
}

export async function resetLoginPassword(id: number, password: string) {
  const session = await requireFullAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  const passwordHash = await bcrypt.hash(password, 12);
  await db.update(admins).set({ passwordHash, failedLogins: 0, lockedUntil: null }).where(eq(admins.id, id));
  await audit(session.email, "update", "login", String(id), "Reset password");
  revalidatePath("/admin/logins");
  return { ok: true };
}

export async function updateLoginRole(id: number, role: Role) {
  const session = await requireFullAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  if (!ROLES.includes(role)) return { ok: false, error: "Invalid role." };
  await db.update(admins).set({ role }).where(eq(admins.id, id));
  await audit(session.email, "update", "login", String(id), `Role → ${role}`);
  revalidatePath("/admin/logins");
  return { ok: true };
}

export async function updateLoginPermissions(id: number, permissions: string[]) {
  const session = await requireFullAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  const allowed = new Set(TOGGLEABLE_SECTIONS.map((s) => s.key));
  const clean = [...new Set(permissions.filter((p) => allowed.has(p)))];
  await db.update(admins).set({ permissions: clean }).where(eq(admins.id, id));
  await audit(session.email, "update", "login", String(id), `Permissions: ${clean.join(", ") || "none"}`);
  revalidatePath("/admin/logins");
  return { ok: true };
}

/** Generate a setup/reset link and email it from the office mailbox. If email
 *  isn't configured, returns the link so the admin can share it manually. */
export async function sendSetupLink(id: number) {
  const session = await requireFullAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  const [a] = await db.select().from(admins).where(eq(admins.id, id));
  if (!a) return { ok: false, error: "Not found." };

  const token = randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.update(admins).set({ resetToken: token, resetExpires: expires }).where(eq(admins.id, id));

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${FIRM.domain}`;
  const link = `${base}/admin/reset?token=${token}&email=${encodeURIComponent(a.email)}`;
  const html = `
    <div style="font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;max-width:560px;line-height:1.55">
      <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a1f2b;margin:0 0 16px">T. Maxwell Smith, PLLC</p>
      <p style="margin:0 0 14px">Hello ${a.name.replace(/</g, "")},</p>
      <p style="margin:0 0 14px">A login has been created for you to access the firm's time tracker. Click below to set your password and sign in:</p>
      <p style="margin:0 0 18px"><a href="${link}" style="background:#7a1f2b;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;display:inline-block">Set your password</a></p>
      <p style="margin:0 0 8px;font-size:13px;color:#777">Or paste this link into your browser:</p>
      <p style="margin:0 0 16px;font-size:12px;color:#777;word-break:break-all">${link}</p>
      <p style="margin:0;font-size:13px;color:#777">This link expires in 7 days. If you weren't expecting it, you can ignore this email.</p>
    </div>`;
  const res = await sendEmail({ to: a.email, fromName: `${FIRM.name} — Accounts`, subject: "Set up your T. Maxwell Smith login", html });
  await audit(session.email, "update", "login", String(id), "Sent setup link");
  revalidatePath("/admin/logins");
  return { ok: true, sent: res.sent, link: res.sent ? undefined : link };
}

export async function deleteLogin(id: number) {
  const session = await requireFullAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  if (Number(session.sub) === id) return { ok: false, error: "You can't delete your own login." };
  await db.delete(admins).where(eq(admins.id, id));
  await audit(session.email, "delete", "login", String(id), "Deleted login");
  revalidatePath("/admin/logins");
  return { ok: true };
}
