"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";

/**
 * Save a Patriot Series settings row (branding, teams, …). Mirrors the firm's
 * saveSetting: requires a signed-in admin, upserts the key/value JSON, audits,
 * and revalidates so the public pages pick up the change.
 */
export async function savePatriotSetting(key: string, value: unknown) {
  const session = await requireAdmin();
  if (!db) return { ok: false as const, error: "Database not configured." };
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  await audit(session.email, "update", "settings", key, `Updated ${key}`);
  revalidatePath("/", "layout");
  return { ok: true as const };
}
