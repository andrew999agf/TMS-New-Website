import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { admins, auditLog } from "@/db/schema";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "./session";

export type LoginResult = { ok: true } | { ok: false; error: string };

/** Verify credentials, enforce lockout, set the session cookie. */
export async function login(email: string, password: string): Promise<LoginResult> {
  if (!db) return { ok: false, error: "The database is not configured yet." };
  if (!process.env.AUTH_SECRET)
    return { ok: false, error: "AUTH_SECRET is not configured." };

  const [admin] = await db.select().from(admins).where(eq(admins.email, email.toLowerCase()));
  if (!admin) {
    // Constant-ish time: still run a hash to blunt user enumeration.
    await bcrypt.compare(password, "$2a$12$............................................");
    return { ok: false, error: "Invalid email or password." };
  }

  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    return { ok: false, error: "Account temporarily locked. Try again later." };
  }

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) {
    const failed = admin.failedLogins + 1;
    await db
      .update(admins)
      .set({
        failedLogins: failed,
        lockedUntil: failed >= 5 ? new Date(Date.now() + 15 * 60_000) : null,
      })
      .where(eq(admins.id, admin.id));
    return { ok: false, error: "Invalid email or password." };
  }

  await db
    .update(admins)
    .set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(admins.id, admin.id));

  const token = await createSessionToken({
    sub: String(admin.id),
    email: admin.email,
    name: admin.name,
    role: admin.role,
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  await audit(admin.email, "login", "admin", String(admin.id), "Signed in");
  return { ok: true };
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Use at the top of admin server components / actions. Redirects if unauthed. */
export async function requireAdmin(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  return session;
}

/** Append an audit-log entry (best-effort). */
export async function audit(
  adminEmail: string,
  action: string,
  entity: string,
  entityId?: string,
  summary?: string,
  meta?: Record<string, unknown>,
) {
  if (!db) return;
  try {
    await db.insert(auditLog).values({ adminEmail, action, entity, entityId, summary, meta });
  } catch {
    /* non-fatal */
  }
}
