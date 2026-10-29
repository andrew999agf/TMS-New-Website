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

/** Verify credentials, enforce lockout, set the session cookie. Bare
 *  usernames (no "@") are shorthand for @patriotseriestexas.com accounts, so
 *  broadcast crew can sign in with just a short operator name. */
export async function login(email: string, password: string): Promise<LoginResult> {
  if (!db) return { ok: false, error: "The database is not configured yet." };
  if (!process.env.AUTH_SECRET)
    return { ok: false, error: "AUTH_SECRET is not configured." };
  if (email.trim() && !email.includes("@")) email = `${email.trim()}@patriotseriestexas.com`;

  // Explicit columns only (so login keeps working before the permissions/reset
  // columns are added by "Apply database updates").
  const [admin] = await db
    .select({
      id: admins.id,
      email: admins.email,
      name: admins.name,
      passwordHash: admins.passwordHash,
      role: admins.role,
      failedLogins: admins.failedLogins,
      lockedUntil: admins.lockedUntil,
    })
    .from(admins)
    .where(eq(admins.email, email.toLowerCase()));
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

  // Permissions read defensively (column may not exist before db-sync).
  let permissions: string[] = [];
  try {
    const [p] = await db.select({ permissions: admins.permissions }).from(admins).where(eq(admins.id, admin.id));
    permissions = (p?.permissions as string[]) ?? [];
  } catch {
    /* column not present yet */
  }

  const token = await createSessionToken({
    sub: String(admin.id),
    email: admin.email,
    name: admin.name,
    role: admin.role,
    permissions,
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

/**
 * The role and permissions as they stand in the database right now — the
 * token carries the values from sign-in, and User Management may have
 * changed them since. Returns null when the row can't be read (keep the
 * token's values) or the account is gone.
 */
export async function freshAccess(session: SessionPayload): Promise<{ role: string; permissions: string[]; changed: boolean } | null> {
  if (!db) return null;
  try {
    const [row] = await db.select({ role: admins.role, permissions: admins.permissions }).from(admins).where(eq(admins.id, Number(session.sub)));
    if (!row) return null;
    const permissions = ((row.permissions as string[]) ?? []).slice().sort();
    const changed = row.role !== session.role || JSON.stringify(permissions) !== JSON.stringify((session.permissions ?? []).slice().sort());
    return { role: row.role, permissions, changed };
  } catch {
    return null;
  }
}

/** Use at the top of admin server components / actions. Redirects if unauthed.
 *  Role and section permissions come from the database, not the sign-in
 *  token, so a change in User Management applies on the person's next
 *  request rather than their next login. */
export async function requireAdmin(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  const fresh = await freshAccess(session);
  return fresh ? { ...session, role: fresh.role, permissions: fresh.permissions } : session;
}

/** Re-sign the session cookie with the database's current role and permissions
 *  (server action / route handler context only — cookies can't be set during render). */
export async function refreshSessionCookie(): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  const fresh = await freshAccess(session);
  if (!fresh || !fresh.changed) return false;
  const token = await createSessionToken({ ...session, role: fresh.role, permissions: fresh.permissions });
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE });
  return true;
}

/** True for full administrators (not time-tracker-only logins). */
export function isFullAdmin(role?: string): boolean {
  return role === "owner" || role === "editor";
}

/** Gate full-admin areas. Timekeeper logins are bounced to Time Tracker 4.0. */
export async function requireFullAdmin(): Promise<SessionPayload> {
  const session = await requireAdmin();
  if (!isFullAdmin(session.role)) redirect("/admin/time-tracker-4");
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
