"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { sbAccessRequests, sbMemberships, sbUsers } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { canRequestBooksAccess } from "@/lib/admin-sections";
import { ensureBooks, seedBooksDefaults } from "@/lib/books/ensure";
import { primaryAdmin, sendAccessRequestEmail, sbAudit_, upsertBooksUser } from "@/lib/books/auth";

export type BridgeState = {
  /** This admin already has a StartBookkeeping login on company #1. */
  hasLogin: boolean;
  lastLoginAt: string | null;
  /** Who issues logins. Null only while the company has no owner at all. */
  primary: { name: string; email: string } | null;
  /** Admin owners always; others only with the "bookkeeper" grant. */
  canRequest: boolean;
  /** When this admin's open request was sent, if one is waiting. */
  pendingSince: string | null;
  /** True only for an admin owner while the company has no login at all —
   *  the one moment a first owner has to be created from here. */
  bootstrap: boolean;
};

async function companyId(): Promise<number> {
  await ensureBooks();
  return seedBooksDefaults();
}

export async function bridgeState(): Promise<BridgeState | null> {
  const session = await requireAdmin();
  if (!db) return null;
  const cid = await companyId();
  const email = session.email.toLowerCase();
  const [mine] = await db.select({ id: sbUsers.id, lastLoginAt: sbUsers.lastLoginAt })
    .from(sbUsers).innerJoin(sbMemberships, and(eq(sbMemberships.userId, sbUsers.id), eq(sbMemberships.companyId, cid)))
    .where(eq(sbUsers.email, email));
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(sbMemberships).where(eq(sbMemberships.companyId, cid));
  const primary = await primaryAdmin(cid);
  const [pending] = await db.select({ createdAt: sbAccessRequests.createdAt }).from(sbAccessRequests)
    .where(and(eq(sbAccessRequests.companyId, cid), eq(sbAccessRequests.email, email), eq(sbAccessRequests.status, "pending")))
    .orderBy(desc(sbAccessRequests.createdAt)).limit(1);
  return {
    hasLogin: !!mine,
    lastLoginAt: mine?.lastLoginAt?.toISOString() ?? null,
    primary: primary ? { name: primary.name, email: primary.email } : null,
    canRequest: canRequestBooksAccess(session.role, session.permissions),
    pendingSince: pending?.createdAt?.toISOString() ?? null,
    bootstrap: session.role === "owner" && Number(n) === 0,
  };
}

const RESEND_AFTER_MS = 24 * 60 * 60_000;

/** Ask the primary admin for a login. Creates nothing — the primary admin adds
 *  the login inside StartBookkeeping. One open request per person; it can be
 *  re-sent after a day. */
export async function requestBooksAccess(): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const session = await requireAdmin();
  if (!canRequestBooksAccess(session.role, session.permissions)) return { ok: false, error: "Only owners and bookkeepers can ask for StartBookkeeping access. An owner can mark you a bookkeeper in User Management." };
  if (!db) return { ok: false, error: "Database not configured." };
  const cid = await companyId();
  const email = session.email.toLowerCase();
  const [mine] = await db.select({ id: sbUsers.id }).from(sbUsers).innerJoin(sbMemberships, and(eq(sbMemberships.userId, sbUsers.id), eq(sbMemberships.companyId, cid))).where(eq(sbUsers.email, email));
  if (mine) return { ok: false, error: "You already have a StartBookkeeping login." };
  const primary = await primaryAdmin(cid);
  if (!primary) return { ok: false, error: "StartBookkeeping has no owner yet to ask." };
  const [open] = await db.select().from(sbAccessRequests)
    .where(and(eq(sbAccessRequests.companyId, cid), eq(sbAccessRequests.email, email), eq(sbAccessRequests.status, "pending")))
    .orderBy(desc(sbAccessRequests.createdAt)).limit(1);
  if (open && Date.now() - open.createdAt.getTime() < RESEND_AFTER_MS) {
    return { ok: false, error: `Your request from ${open.createdAt.toLocaleString("en-US", { timeZone: "America/Chicago" })} is still waiting on ${primary.name || primary.email}. You can send it again tomorrow.` };
  }
  let requestId: number;
  if (open) {
    await db.update(sbAccessRequests).set({ createdAt: new Date(), name: session.name, adminRole: session.role }).where(eq(sbAccessRequests.id, open.id));
    requestId = open.id;
  } else {
    const [row] = await db.insert(sbAccessRequests).values({ companyId: cid, email, name: session.name, adminRole: session.role }).returning({ id: sbAccessRequests.id });
    requestId = row.id;
  }
  const sent = await sendAccessRequestEmail(cid, { email, name: session.name, adminRole: session.role }, requestId);
  await sbAudit_(cid, email, "request", "access-request", String(requestId), sent.ok ? `Access requested; ${primary.email} notified` : `Access requested; email failed: ${sent.error}`);
  await audit(session.email, "create", "startbookkeeping-access-request", String(requestId), sent.ok ? `Asked ${primary.email} for a StartBookkeeping login` : `Asked for a StartBookkeeping login (email failed)`);
  if (!sent.ok) return { ok: false, error: `The request was recorded, but the email to ${primary.name || primary.email} didn't go out: ${sent.error}` };
  return { ok: true, to: primary.name || primary.email };
}

/** The one exception to "no self-made logins": an admin owner creates the
 *  company's FIRST owner while it has no login at all. Once anyone exists,
 *  this refuses and every further login comes from the primary admin. */
export async function bootstrapFirstOwner(password: string) {
  const session = await requireAdmin();
  if (session.role !== "owner") return { ok: false as const, error: "Only an admin owner can set up the first StartBookkeeping owner." };
  if ((password ?? "").length < 12) return { ok: false as const, error: "Use at least 12 characters." };
  if (!db) return { ok: false as const, error: "Database not configured." };
  const cid = await companyId();
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(sbMemberships).where(eq(sbMemberships.companyId, cid));
  if (Number(n) > 0) return { ok: false as const, error: "StartBookkeeping already has a primary admin — ask them for a login." };
  const r = await upsertBooksUser(session.email, session.name, password, cid, "owner");
  await sbAudit_(cid, session.email.toLowerCase(), "create", "user", String(r.user.id), "First owner created from the admin site");
  await audit(session.email, "create", "startbookkeeping-login", String(r.user.id), "StartBookkeeping first owner created");
  return { ok: true as const };
}
