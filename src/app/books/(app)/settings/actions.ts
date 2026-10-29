"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sbCompanies, sbMemberships, sbTaxRules, sbUsers } from "@/db/schema";
import { requireBooks, sbAudit_, upsertBooksUser } from "@/lib/books/auth";
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
  revalidatePath("/books/settings");
  return { ok: true as const, created: r.created };
}

export async function removeUser(userId: number) {
  const s = await requireBooks();
  if (s.role !== "owner") return { ok: false as const, error: "Only an owner can remove logins." };
  if (!db) return { ok: false as const, error: "Database not configured." };
  if (String(userId) === s.sub) return { ok: false as const, error: "You can't remove your own login." };
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
