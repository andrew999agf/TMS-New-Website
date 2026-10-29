import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { db } from "@/db";
import { sbAudit, sbCompanies, sbMemberships, sbUsers } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { BOOKS_COOKIE, BOOKS_MAX_AGE, createBooksToken, verifyBooksToken, type BooksSession } from "./session";
import { BOOKS_NAME, booksBase } from "./host";
import { ensureBooks } from "./ensure";

export async function requestHost(): Promise<string> {
  return ((await headers()).get("x-forwarded-host") ?? (await headers()).get("host") ?? "").trim();
}

export async function getBooksSession(): Promise<BooksSession | null> {
  const c = (await cookies()).get(BOOKS_COOKIE)?.value;
  return c ? verifyBooksToken(c) : null;
}

/** Top of every StartBookkeeping page and action: a verified, two-factor session or the login page. */
export async function requireBooks(): Promise<BooksSession> {
  const s = await getBooksSession();
  if (!s) redirect(`${booksBase(await requestHost())}/login`);
  return s;
}

export async function sbAudit_(companyId: number | null, email: string, action: string, entity: string, entityId: string, detail: string) {
  if (!db) return;
  const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 64);
  await db.insert(sbAudit).values({ companyId, userEmail: email, action, entity, entityId, detail: detail.slice(0, 2000), ip }).catch(() => {});
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BLANK_HASH = "$2a$12$............................................";

/** Step 1: password. On success a six-digit code is emailed; nothing is signed in yet. */
export async function booksLoginStart(emailIn: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!db) return { ok: false, error: "The database is not configured." };
  await ensureBooks();
  const email = emailIn.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || !password) return { ok: false, error: "Enter your email and password." };
  const [u] = await db.select().from(sbUsers).where(eq(sbUsers.email, email));
  if (!u) { await bcrypt.compare(password, BLANK_HASH); return { ok: false, error: "Invalid email or password." }; }
  if (u.lockedUntil && u.lockedUntil > new Date()) return { ok: false, error: "This login is locked for a few minutes after too many tries." };
  if (!(await bcrypt.compare(password, u.passwordHash))) {
    const failed = u.failedLogins + 1;
    await db.update(sbUsers).set({ failedLogins: failed, lockedUntil: failed >= 5 ? new Date(Date.now() + 15 * 60_000) : null }).where(eq(sbUsers.id, u.id));
    await sbAudit_(null, email, "login-failed", "user", String(u.id), "Wrong password");
    return { ok: false, error: "Invalid email or password." };
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.update(sbUsers).set({ failedLogins: 0, lockedUntil: null, otpHash: await bcrypt.hash(code, 10), otpExpires: new Date(Date.now() + 10 * 60_000), otpAttempts: 0 }).where(eq(sbUsers.id, u.id));
  const html = `<div style="font-family:Georgia,serif;max-width:480px;line-height:1.6;color:#1a1a1a">
    <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a1f2b;margin:0 0 16px">${BOOKS_NAME}</p>
    <p>Your sign-in code is</p>
    <p style="font-size:32px;letter-spacing:.3em;font-weight:bold;margin:8px 0 16px">${code}</p>
    <p style="font-size:13px;color:#555">It expires in 10 minutes. If you didn't try to sign in to ${BOOKS_NAME}, change your password now.</p>
  </div>`;
  const sent = await sendEmail({ to: email, fromName: BOOKS_NAME, subject: `Your ${BOOKS_NAME} sign-in code: ${code}`, html });
  if (!sent.sent) return { ok: false, error: "Password accepted, but the sign-in code couldn't be emailed. Check email settings and try again." };
  await sbAudit_(null, email, "login-code-sent", "user", String(u.id), "Password ok; code emailed");
  return { ok: true };
}

/** Step 2: the emailed code. Only now is a session issued. */
export async function booksLoginVerify(emailIn: string, codeIn: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!db) return { ok: false, error: "The database is not configured." };
  const email = emailIn.trim().toLowerCase();
  const code = codeIn.replace(/\D/g, "");
  const [u] = await db.select().from(sbUsers).where(eq(sbUsers.email, email));
  if (!u?.otpHash || !u.otpExpires) return { ok: false, error: "Start by entering your password." };
  if (u.otpExpires < new Date()) return { ok: false, error: "That code has expired — sign in again for a new one." };
  if (u.otpAttempts >= 5) { await db.update(sbUsers).set({ otpHash: null, otpExpires: null }).where(eq(sbUsers.id, u.id)); return { ok: false, error: "Too many tries — sign in again for a new code." }; }
  if (code.length !== 6 || !(await bcrypt.compare(code, u.otpHash))) {
    await db.update(sbUsers).set({ otpAttempts: u.otpAttempts + 1 }).where(eq(sbUsers.id, u.id));
    return { ok: false, error: "That code isn't right." };
  }
  const [m] = await db.select().from(sbMemberships).where(eq(sbMemberships.userId, u.id)).orderBy(sbMemberships.companyId).limit(1);
  if (!m) return { ok: false, error: "This login isn't attached to a company yet." };
  await db.update(sbUsers).set({ otpHash: null, otpExpires: null, otpAttempts: 0, lastLoginAt: new Date() }).where(eq(sbUsers.id, u.id));
  const token = await createBooksToken({ sub: String(u.id), email: u.email, name: u.name, role: m.role, companyId: m.companyId, mfa: true });
  (await cookies()).set(BOOKS_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: BOOKS_MAX_AGE });
  await sbAudit_(m.companyId, email, "login", "user", String(u.id), "Signed in (password + emailed code)");
  return { ok: true };
}

export async function booksLogout(): Promise<void> {
  const s = await getBooksSession();
  (await cookies()).set(BOOKS_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  if (s) await sbAudit_(s.companyId, s.email, "logout", "user", s.sub, "Signed out");
}

/** Create or reset a StartBookkeeping login (used by the admin bridge and by company owners). */
export async function upsertBooksUser(email: string, name: string, password: string, companyId: number, role: "owner" | "bookkeeper" | "viewer") {
  if (!db) throw new Error("Database not configured.");
  await ensureBooks();
  const clean = email.trim().toLowerCase();
  const hash = await bcrypt.hash(password, 12);
  const [existing] = await db.select().from(sbUsers).where(eq(sbUsers.email, clean));
  const user = existing
    ? (await db.update(sbUsers).set({ passwordHash: hash, name: name.trim() || existing.name, failedLogins: 0, lockedUntil: null }).where(eq(sbUsers.id, existing.id)).returning())[0]
    : (await db.insert(sbUsers).values({ email: clean, name: name.trim(), passwordHash: hash }).returning())[0];
  const [mem] = await db.select().from(sbMemberships).where(and(eq(sbMemberships.userId, user.id), eq(sbMemberships.companyId, companyId)));
  if (!mem) await db.insert(sbMemberships).values({ userId: user.id, companyId, role });
  return { user, created: !existing };
}

export async function booksCompany(companyId: number) {
  if (!db) return null;
  const [c] = await db.select().from(sbCompanies).where(eq(sbCompanies.id, companyId));
  return c ?? null;
}
