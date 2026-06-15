"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { requireFullAdmin, audit } from "@/lib/auth";

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

export async function deleteLogin(id: number) {
  const session = await requireFullAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  if (Number(session.sub) === id) return { ok: false, error: "You can't delete your own login." };
  await db.delete(admins).where(eq(admins.id, id));
  await audit(session.email, "delete", "login", String(id), "Deleted login");
  revalidatePath("/admin/logins");
  return { ok: true };
}
