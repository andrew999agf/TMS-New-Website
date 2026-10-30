"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sbAccessRequests, sbCompanies, sbMemberships, sbTaxRules, sbUsers } from "@/db/schema";
import { requireBooks, sbAudit_, upsertBooksUser, sendBooksSetupLink, booksCompany, primaryAdmin } from "@/lib/books/auth";
import bcrypt from "bcryptjs";
import { ENTITY_TYPES, TAX_ELECTIONS, US_STATES } from "@/lib/books/seed";

const str = (v: unknown, max = 191) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function updateCompany(patch: Record<string, unknown>) {
  const s = await requireBooks();
  if (s.role !== "owner") return { ok: false as const, error: "Only an owner can change the company profile." };
  if (!db) return { ok: false as const, error: "Database not configured." };
  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ["name", "legalName", "dba", "addressLine", "city", "zip", "phone", "email", "operatingBankName", "ioltaBankName"]) if (k in patch) set[k] = str(patch[k], k === "legalName" ? 255 : 191);
  if ("ein" in patch) { const ein = str(patch.ein, 16).replace(/[^0-9-]/g, ""); if (ein && !/^\d{2}-?\d{7}$/.test(ein)) return { ok: false as const, error: "EIN should look like 12-3456789." }; set.ein = ein ? `${ein.replace("-", "").slice(0, 2)}-${ein.replace("-", "").slice(2)}` : ""; }
  if ("entityType" in patch) { const v = str(patch.entityType, 24); if (!ENTITY_TYPES.some((e) => e.id === v)) return { ok: false as const, error: "Pick an entity type." }; set.entityType = v; }
  if ("taxElection" in patch) { const v = str(patch.taxElection, 24); if (!TAX_ELECTIONS.some((e) => e.id === v)) return { ok: false as const, error: "Pick a tax election." }; set.taxElection = v; }
  for (const k of ["state", "formationState", "addressState"]) if (k in patch) { const v = str(patch[k], 2).toUpperCase(); if (!(US_STATES as readonly string[]).includes(v)) return { ok: false as const, error: "Pick a state." }; set[k] = v; }
  if ("fiscalYearStartMonth" in patch) { const m = Math.floor(Number(patch.fiscalYearStartMonth)); if (!(m >= 1 && m <= 12)) return { ok: false as const, error: "Fiscal year start must be a month 1–12." }; set.fiscalYearStartMonth = m; }
  for (const k of ["operatingLast4", "ioltaLast4"]) if (k in patch) set[k] = str(patch[k], 4).replace(/\D/g, "");
  if (!str(set.name ?? "x")) return { ok: false as const, error: "The company needs a name." };
  await db.update(sbCompanies).set(set).where(eq(sbCompanies.id, s.companyId));
  await sbAudit_(s.companyId, s.email, "update", "company", String(s.companyId), `Profile: ${Object.keys(set).filter((k) => k !== "updatedAt").join(", ")}`);
  revalidatePath("/books"); revalidatePath("/books/settings");
  return { ok: true as const };
}

export async function addUser(input: { email: string; name: string; password: string; role: "owner" | "bookkeeper" | "viewer" }) {
  const s = await requireBooks();
  if (s.role !== "owner") return { ok: false as const, error: "Only an owner can add logins." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return { ok: false as const, error: "Enter a valid email." };
  if ((input.password ?? "").length < 12) return { ok: false as const, error: "Use a password of at least 12 characters." };
  if (!["owner", "bookkeeper", "viewer"].includes(input.role)) return { ok: false as const, error: "Pick a role." };
  const r = await upsertBooksUser(input.email, input.name, input.password, s.companyId, input.role);
  await sbAudit_(s.companyId, s.email, r.created ? "create" : "update", "user", String(r.user.id), `${r.created ? "Added" : "Reset password for"} ${r.user.email} (${input.role})`);
  // An open access request from this address is answered by the login itself.
  await db!.update(sbAccessRequests).set({ status: "granted", resolvedAt: new Date(), resolvedBy: s.email })
    .where(and(eq(sbAccessRequests.companyId, s.companyId), eq(sbAccessRequests.email, r.user.email), eq(sbAccessRequests.status, "pending")));
  revalidatePath("/books/settings");
  return { ok: true as const, created: r.created };
}

export async function removeUser(userId: number) {
  const s = await requireBooks();
  if (s.role !== "owner") return { ok: false as const, error: "Only an owner can remove logins." };
  if (!db) return { ok: false as const, error: "Database not configured." };
  if (String(userId) === s.sub) return { ok: false as const, error: "You can't remove your own login." };
  const target = await memberOf(userId, s.companyId);
  if (target?.role === "owner" && (await ownersLeft(s.companyId, userId)) === 0) return { ok: false as const, error: "That's the only owner — make someone else an owner first." };
  await db.delete(sbMemberships).where(and(eq(sbMemberships.userId, userId), eq(sbMemberships.companyId, s.companyId)));
  const [u] = await db.select({ email: sbUsers.email }).from(sbUsers).where(eq(sbUsers.id, userId));
  await sbAudit_(s.companyId, s.email, "delete", "user", String(userId), `Removed ${u?.email ?? userId} from this company`);
  revalidatePath("/books/settings");
  return { ok: true as const };
}

export async function setRuleVerified(id: number, verified: boolean, value?: unknown) {
  const s = await requireBooks();
  if (s.role !== "owner") return { ok: false as const, error: "Only an owner can confirm tax rules." };
  if (!db) return { ok: false as const, error: "Database not configured." };
  const set: Record<string, unknown> = { verified, verifiedBy: verified ? s.email : null, verifiedAt: verified ? new Date() : null, updatedAt: new Date() };
  if (value !== undefined) set.value = value;
  await db.update(sbTaxRules).set(set).where(eq(sbTaxRules.id, id));
  await sbAudit_(s.companyId, s.email, "update", "tax-rule", String(id), `${verified ? "Confirmed" : "Unconfirmed"}${value !== undefined ? ` value=${JSON.stringify(value)}` : ""}`);
  revalidatePath("/books/settings"); revalidatePath("/books");
  return { ok: true as const };
}

const ROLES = ["owner", "bookkeeper", "viewer"] as const;
type Role = (typeof ROLES)[number];

async function ownerGuard() {
  const s = await requireBooks();
  if (s.role !== "owner") throw new Error("Only an owner can manage logins.");
  if (!db) throw new Error("Database not configured.");
  return s;
}
async function memberOf(userId: number, companyId: number) {
  const [m] = await db!.select().from(sbMemberships).where(and(eq(sbMemberships.userId, userId), eq(sbMemberships.companyId, companyId)));
  return m ?? null;
}
async function ownersLeft(companyId: number, exceptUserId: number) {
  const rows = await db!.select({ id: sbMemberships.id }).from(sbMemberships).where(and(eq(sbMemberships.companyId, companyId), eq(sbMemberships.role, "owner")));
  const mine = await memberOf(exceptUserId, companyId);
  return rows.length - (mine?.role === "owner" ? 1 : 0);
}

/** Name, email and role — fix a typo, or promote/demote. The last owner can't be demoted. */
export async function updateUser(userId: number, patch: { name?: string; email?: string; role?: Role }) {
  try {
    const s = await ownerGuard();
    const m = await memberOf(userId, s.companyId);
    if (!m) return { ok: false as const, error: "That login isn't on this company." };
    const set: Record<string, unknown> = {};
    if (patch.name !== undefined) set.name = str(patch.name, 191);
    if (patch.email !== undefined) {
      const email = str(patch.email, 255).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false as const, error: "Enter a valid email." };
      const [dupe] = await db!.select({ id: sbUsers.id }).from(sbUsers).where(eq(sbUsers.email, email));
      if (dupe && dupe.id !== userId) return { ok: false as const, error: "Another login already uses that email." };
      set.email = email;
    }
    if (Object.keys(set).length) await db!.update(sbUsers).set(set).where(eq(sbUsers.id, userId));
    if (patch.role !== undefined) {
      if (!ROLES.includes(patch.role)) return { ok: false as const, error: "Pick a role." };
      if (m.role === "owner" && patch.role !== "owner" && (await ownersLeft(s.companyId, userId)) === 0) return { ok: false as const, error: "That's the only owner — make someone else an owner first." };
      await db!.update(sbMemberships).set({ role: patch.role }).where(eq(sbMemberships.id, m.id));
    }
    await sbAudit_(s.companyId, s.email, "update", "user", String(userId), `Login edited: ${Object.keys({ ...set, ...(patch.role !== undefined ? { role: patch.role } : {}) }).join(", ")}`);
    revalidatePath("/books/settings");
    return { ok: true as const };
  } catch (err) { return { ok: false as const, error: (err as Error).message }; }
}

/** Turn down an access request. The requester can ask again after a day. */
export async function dismissAccessRequest(id: number) {
  try {
    const s = await ownerGuard();
    const [r] = await db!.update(sbAccessRequests).set({ status: "dismissed", resolvedAt: new Date(), resolvedBy: s.email })
      .where(and(eq(sbAccessRequests.id, id), eq(sbAccessRequests.companyId, s.companyId), eq(sbAccessRequests.status, "pending"))).returning({ email: sbAccessRequests.email });
    if (!r) return { ok: false as const, error: "That request is no longer open." };
    await sbAudit_(s.companyId, s.email, "update", "access-request", String(id), `Dismissed request from ${r.email}`);
    revalidatePath("/books/settings");
    return { ok: true as const };
  } catch (err) { return { ok: false as const, error: (err as Error).message }; }
}

/** Hand the primary-admin role to another owner: they receive access requests from then on. */
export async function setPrimaryAdmin(userId: number) {
  try {
    const s = await ownerGuard();
    const m = await memberOf(userId, s.companyId);
    if (!m || m.role !== "owner") return { ok: false as const, error: "The primary admin must be an owner on this company." };
    await db!.update(sbCompanies).set({ primaryUserId: userId, updatedAt: new Date() }).where(eq(sbCompanies.id, s.companyId));
    const p = await primaryAdmin(s.companyId);
    await sbAudit_(s.companyId, s.email, "update", "company", String(s.companyId), `Primary admin is now ${p?.email ?? userId}`);
    revalidatePath("/books/settings");
    return { ok: true as const };
  } catch (err) { return { ok: false as const, error: (err as Error).message }; }
}

/** An owner types a password for someone (hand it over out of band). */
export async function setUserPassword(userId: number, password: string) {
  try {
    const s = await ownerGuard();
    if (!(await memberOf(userId, s.companyId))) return { ok: false as const, error: "That login isn't on this company." };
    if ((password ?? "").length < 12) return { ok: false as const, error: "Use at least 12 characters." };
    await db!.update(sbUsers).set({ passwordHash: await bcrypt.hash(password, 12), failedLogins: 0, lockedUntil: null, resetToken: null, resetExpires: null }).where(eq(sbUsers.id, userId));
    await sbAudit_(s.companyId, s.email, "update", "user", String(userId), "Password set by an owner");
    revalidatePath("/books/settings");
    return { ok: true as const };
  } catch (err) { return { ok: false as const, error: (err as Error).message }; }
}

/** Email (or re-email) a one-hour set-your-password link. */
export async function sendSetupLink(userId: number) {
  try {
    const s = await ownerGuard();
    if (!(await memberOf(userId, s.companyId))) return { ok: false as const, error: "That login isn't on this company." };
    const c = await booksCompany(s.companyId);
    const r = await sendBooksSetupLink(userId, s.name || s.email, c?.name ?? "the company");
    if (r.ok) await sbAudit_(s.companyId, s.email, "update", "user", String(userId), "Set-password link emailed");
    revalidatePath("/books/settings");
    return r;
  } catch (err) { return { ok: false as const, error: (err as Error).message }; }
}
