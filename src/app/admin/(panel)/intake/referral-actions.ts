"use server";

import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { referralAttorneys } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";

export type ReferralAttorneyInput = {
  id?: number;
  name: string;
  firm?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  practiceArea?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function saveReferralAttorney(input: ReferralAttorneyInput) {
  const session = await requireAdmin();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const name = input.name.trim();
  if (!name) return { ok: false as const, error: "Enter the attorney or firm name." };
  const email = (input.email ?? "").trim();
  if (email && !EMAIL_RE.test(email)) return { ok: false as const, error: "Enter a valid email address (or leave it blank)." };
  const values = {
    name,
    firm: (input.firm ?? "").trim(),
    address: (input.address ?? "").trim(),
    phone: (input.phone ?? "").trim(),
    email,
    website: (input.website ?? "").trim(),
    practiceArea: (input.practiceArea ?? "").trim(),
  };
  try {
    if (input.id && input.id > 0) {
      await db.update(referralAttorneys).set(values).where(eq(referralAttorneys.id, input.id));
    } else {
      // Place new entries at the end.
      const rows = await db.select({ sort: referralAttorneys.sort }).from(referralAttorneys).orderBy(asc(referralAttorneys.sort));
      const nextSort = rows.reduce((m, r) => Math.max(m, r.sort), 0) + 1;
      await db.insert(referralAttorneys).values({ ...values, sort: nextSort }).onConflictDoUpdate({ target: referralAttorneys.name, set: values });
    }
    await audit(session.email, input.id ? "update" : "create", "referral-attorney", input.id ? String(input.id) : undefined, `Saved referral attorney ${name}`);
    revalidatePath("/admin/intake");
    return { ok: true as const };
  } catch (err) {
    console.error("[referral] save failed:", err);
    return { ok: false as const, error: "Couldn't save — run Settings → Database updates, then retry." };
  }
}

export async function deleteReferralAttorney(id: number) {
  const session = await requireAdmin();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    await db.delete(referralAttorneys).where(eq(referralAttorneys.id, id));
    await audit(session.email, "delete", "referral-attorney", String(id), "Deleted referral attorney");
    revalidatePath("/admin/intake");
    return { ok: true as const };
  } catch (err) {
    console.error("[referral] delete failed:", err);
    return { ok: false as const, error: "Couldn't delete — try again." };
  }
}
