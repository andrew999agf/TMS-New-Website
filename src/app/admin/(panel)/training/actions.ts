"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, audit } from "@/lib/auth";
import { getModule } from "@/lib/training/modules";
import {
  readCompletion,
  writeCompletion,
  allowedSlugs,
  type CompletionMap,
} from "@/lib/training/store";

/**
 * User-facing training actions. The user id always comes from the session, so a
 * person can only ever read or change their own completion record.
 */
export async function getMyCompletion(): Promise<CompletionMap> {
  const session = await requireAdmin();
  return readCompletion(session.sub);
}

export async function getMyAllowedSlugs(): Promise<string[]> {
  const session = await requireAdmin();
  return allowedSlugs(session.sub);
}

export async function setModuleComplete(slug: string, complete: boolean) {
  const session = await requireAdmin();
  if (!getModule(slug)) return { ok: false, error: "Unknown module." };

  const map = { ...(await readCompletion(session.sub)) };
  if (complete) map[slug] = new Date().toISOString();
  else delete map[slug];

  const ok = await writeCompletion(session.sub, map);
  if (!ok) return { ok: false, error: "Database not configured." };

  await audit(session.email, complete ? "complete" : "reopen", "training", slug, `${complete ? "Completed" : "Reopened"} training: ${slug}`);
  revalidatePath("/admin/training");
  revalidatePath(`/admin/training/${slug}`);
  return { ok: true };
}
