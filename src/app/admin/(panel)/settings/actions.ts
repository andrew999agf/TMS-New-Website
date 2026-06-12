"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";

export async function saveSetting(key: string, value: unknown) {
  const session = await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  await audit(session.email, "update", "settings", key, `Updated ${key}`);
  revalidatePath("/", "layout");
  return { ok: true };
}
