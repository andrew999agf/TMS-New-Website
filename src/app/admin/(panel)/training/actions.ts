"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { getModule } from "@/lib/training/modules";

/**
 * Per-user training completion. Stored in a settings row keyed by the user id
 * (training.completion.<id>) → { [moduleSlug]: ISO timestamp }. The key is
 * derived from the session, never the client, so a user can only ever change
 * their own record. Any logged-in account (including timekeepers) may call this.
 */
export type CompletionMap = Record<string, string>;

const keyFor = (userId: string) => `training.completion.${userId}`;

export async function getMyCompletion(): Promise<CompletionMap> {
  const session = await requireAdmin();
  if (!db) return {};
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, keyFor(session.sub)));
    return (row?.value as CompletionMap) ?? {};
  } catch {
    return {};
  }
}

export async function setModuleComplete(slug: string, complete: boolean) {
  const session = await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  if (!getModule(slug)) return { ok: false, error: "Unknown module." };

  const key = keyFor(session.sub);
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  const map: CompletionMap = { ...((row?.value as CompletionMap) ?? {}) };
  if (complete) map[slug] = new Date().toISOString();
  else delete map[slug];

  await db
    .insert(settings)
    .values({ key, value: map, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value: map, updatedAt: new Date() } });

  await audit(session.email, complete ? "complete" : "reopen", "training", slug, `${complete ? "Completed" : "Reopened"} training: ${slug}`);
  revalidatePath("/admin/training");
  revalidatePath(`/admin/training/${slug}`);
  return { ok: true };
}
