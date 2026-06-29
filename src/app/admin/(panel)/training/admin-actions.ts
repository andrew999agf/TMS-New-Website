"use server";

import { requireFullAdmin, audit } from "@/lib/auth";
import { getModules } from "@/lib/training/modules";
import { readCompletion, allowedSlugs, readAccessRecord, writeAccess } from "@/lib/training/store";

/**
 * Admin-facing training actions for User Management — gated to full admins
 * (owner/editor). Lets an admin view any user's module progress and control
 * which modules that user can access.
 */
export type UserTrainingView = {
  modules: { slug: string; title: string; category: string }[];
  completion: Record<string, string>;
  allowed: string[];
};

export async function getUserTraining(userId: string): Promise<UserTrainingView> {
  await requireFullAdmin();
  const [completion, allowed] = await Promise.all([readCompletion(userId), allowedSlugs(userId)]);
  const modules = getModules().map((m) => ({ slug: m.slug, title: m.title, category: m.category }));
  return { modules, completion, allowed };
}

export async function setUserModuleAccess(userId: string, slug: string, allowed: boolean) {
  const session = await requireFullAdmin();
  const all = getModules().map((m) => m.slug);
  if (!all.includes(slug)) return { ok: false, error: "Unknown module." };

  // Start from the user's effective access (all modules if they have no record).
  const rec = await readAccessRecord(userId);
  const current = new Set(rec ?? all);
  if (allowed) current.add(slug);
  else current.delete(slug);

  const next = all.filter((s) => current.has(s));
  const ok = await writeAccess(userId, next);
  if (!ok) return { ok: false, error: "Database not configured." };

  await audit(session.email, "update", "training-access", userId, `${allowed ? "Granted" : "Removed"} module ${slug}`);
  return { ok: true, allowed: next };
}
