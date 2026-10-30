import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomInt, randomBytes } from "crypto";
import { db } from "@/db";
import { sbAccessRequests, sbAudit, sbCompanies, sbMemberships, sbUsers } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { BOOKS_COOKIE, BOOKS_MAX_AGE, createBooksToken, verifyBooksToken, type BooksSession } from "./session";
import { BOOKS_NAME, booksBase, booksHomeUrl, isBooksHost } from "./host";
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

/** The company's primary admin: the owner marked primary, else the earliest
 *  owner. They issue logins and receive access requests. Null only before the
 *  company has any owner at all. */
export async function primaryAdmin(companyId: number): Promise<{ id: number; email: string; name: string } | null> {
  if (!db) return null;
  const [c] = await db.select({ primaryUserId: sbCompanies.primaryUserId }).from(sbCompanies).where(eq(sbCompanies.id, companyId));
  const owners = await db.select({ id: sbUsers.id, email: sbUsers.email, name: sbUsers.name })
    .from(sbMemberships).innerJoin(sbUsers, eq(sbUsers.id, sbMemberships.userId))
    .where(and(eq(sbMemberships.companyId, companyId), eq(sbMemberships.role, "owner"))).orderBy(asc(sbMemberships.id));
  return owners.find((o) => o.id === c?.primaryUserId) ?? owners[0] ?? null;
}

/** Email the primary admin that someone on the admin site is asking for a login. */
export async function sendAccessRequestEmail(companyId: number, requester: { email: string; name: string; adminRole: string }, requestId: number): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const primary = await primaryAdmin(companyId);
  if (!primary) return { ok: false, error: `${BOOKS_NAME} has no owner yet to ask.` };
  const company = await booksCompany(companyId);
  const link = `${await booksPublicBase()}/settings#users`;
  const who = requester.name ? `${requester.name} (${requester.email})` : requester.email;
  const html = `<div style="font-family:Georgia,serif;max-width:520px;line-height:1.6;color:#1a1a1a">
    <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a1f2b;margin:0 0 16px">${BOOKS_NAME}</p>
    <p>Hi ${primary.name ? primary.name.split(" ")[0] : "there"},</p>
    <p><strong>${who}</strong> is asking for a ${BOOKS_NAME} login for <strong>${company?.name ?? "the company"}</strong>. On the admin site they are ${requester.adminRole === "owner" ? "an owner" : requester.adminRole === "editor" ? "an editor" : "a timekeeper"}.</p>
    <p>You decide. Nothing is created until you add them under Settings → Logins, where you also pick their role (bookkeeper, viewer or owner):</p>
    <p style="margin:18px 0"><a href="${link}" style="background:#7a1f2b;color:#fbf7f0;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;display:inline-block">Review the request</a></p>
    <p style="font-size:13px;color:#555">Request #${requestId}. Replying to this email reaches the requester. If the button doesn't work, copy this into your browser:<br/>${link}</p>
  </div>`;
  const sent = await sendEmail({ to: primary.email, fromName: BOOKS_NAME, subject: `${who} is asking for ${BOOKS_NAME} access`, html, replyTo: requester.email });
  return sent.sent ? { ok: true, to: primary.email } : { ok: false, error: "The email couldn't be sent — check email settings." };
}

/** Where links in emails should point: the product's own hostname on the firm domain, else this host. */
async function booksPublicBase(): Promise<string> {
  const host = await requestHost();
  if (isBooksHost(host)) { const local = host.startsWith("localhost") || host.startsWith("127."); return `${local ? "http" : "https"}://${host}`; }
  const home = booksHomeUrl(host); // "https://startbookkeeping.<domain>/" or "/books"
  if (home.startsWith("http")) return home.replace(/\/$/, "");
  const local = host.startsWith("localhost") || host.startsWith("127.");
  return `${local ? "http" : "https"}://${host}/books`;
}

/** Email a one-hour "set your password" link to a login (owner action). */
export async function sendBooksSetupLink(userId: number, by: string, companyName: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!db) return { ok: false, error: "Database not configured." };
  const [u] = await db.select().from(sbUsers).where(eq(sbUsers.id, userId));
  if (!u) return { ok: false, error: "Login not found." };
  const token = randomBytes(24).toString("base64url");
  await db.update(sbUsers).set({ resetToken: await bcrypt.hash(token, 10), resetExpires: new Date(Date.now() + 60 * 60_000) }).where(eq(sbUsers.id, u.id));
  const link = `${await booksPublicBase()}/reset?u=${u.id}&t=${token}`;
  const html = `<div style="font-family:Georgia,serif;max-width:520px;line-height:1.6;color:#1a1a1a">
    <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a1f2b;margin:0 0 16px">${BOOKS_NAME}</p>
    <p>Hi ${u.name ? u.name.split(" ")[0] : "there"},</p>
    <p>${by} set you up with a ${BOOKS_NAME} login for <strong>${companyName}</strong>. Choose your password here:</p>
    <p style="margin:18px 0"><a href="${link}" style="background:#7a1f2b;color:#fbf7f0;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;display:inline-block">Set my password</a></p>
    <p style="font-size:13px;color:#555">The link works for one hour. Each time you sign in you'll also get a one-time code at this address. If the button doesn't work, copy this into your browser:<br/>${link}</p>
  </div>`;
  const sent = await sendEmail({ to: u.email, fromName: BOOKS_NAME, subject: `Set your ${BOOKS_NAME} password`, html });
  return sent.sent ? { ok: true } : { ok: false, error: "The email couldn't be sent — check email settings." };
}

/** Open requests for a company, newest first. */
export async function pendingAccessRequests(companyId: number) {
  if (!db) return [];
  return db.select().from(sbAccessRequests).where(and(eq(sbAccessRequests.companyId, companyId), eq(sbAccessRequests.status, "pending"))).orderBy(asc(sbAccessRequests.createdAt));
}

/** The link's landing: check the token, store the new password, clear the link. */
export async function booksResetPassword(userId: number, token: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!db) return { ok: false, error: "Database not configured." };
  if ((password ?? "").length < 12) return { ok: false, error: "Use at least 12 characters." };
  const [u] = await db.select().from(sbUsers).where(eq(sbUsers.id, userId));
  if (!u?.resetToken || !u.resetExpires) return { ok: false, error: "This link isn't valid. Ask an owner to send a new one." };
  if (u.resetExpires < new Date()) return { ok: false, error: "This link has expired. Ask an owner to send a new one." };
  if (!(await bcrypt.compare(token, u.resetToken))) return { ok: false, error: "This link isn't valid. Ask an owner to send a new one." };
  await db.update(sbUsers).set({ passwordHash: await bcrypt.hash(password, 12), resetToken: null, resetExpires: null, failedLogins: 0, lockedUntil: null }).where(eq(sbUsers.id, u.id));
  await sbAudit_(null, u.email, "password-set", "user", String(u.id), "Password set from emailed link");
  return { ok: true };
}
