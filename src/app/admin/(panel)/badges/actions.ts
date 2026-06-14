"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { badges } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";

export type BadgeInput = { id?: number; name: string; logo: string; url: string; visible: boolean };

const NEEDS_SYNC =
  "Could not save. If this is a new section, open Settings → Apply database updates once, then try again.";

export async function saveBadge(input: BadgeInput) {
  const session = await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  if (!input.name.trim()) return { ok: false, error: "Name is required." };
  const values = {
    name: input.name,
    logo: input.logo || null,
    url: input.url || null,
    visible: input.visible,
    updatedAt: new Date(),
  };
  try {
    if (input.id && input.id > 0) {
      await db.update(badges).set(values).where(eq(badges.id, input.id));
    } else {
      const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${badges.sort}), 0)` }).from(badges);
      await db.insert(badges).values({ ...values, sort: Number(max) + 1 });
    }
    await audit(session.email, input.id ? "update" : "create", "badge", undefined, `Saved badge: ${input.name}`);
    revalidatePath("/");
    revalidatePath("/admin/badges");
    return { ok: true };
  } catch (err) {
    const msg = (err as Error).message;
    return { ok: false, error: /relation .* does not exist|no such table/i.test(msg) ? NEEDS_SYNC : msg };
  }
}

export async function deleteBadge(id: number) {
  const session = await requireAdmin();
  if (!db) return { ok: false };
  try {
    await db.delete(badges).where(eq(badges.id, id));
    await audit(session.email, "delete", "badge", String(id), "Deleted badge");
    revalidatePath("/");
    revalidatePath("/admin/badges");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function toggleBadge(id: number, visible: boolean) {
  const session = await requireAdmin();
  if (!db) return { ok: false };
  try {
    await db.update(badges).set({ visible }).where(eq(badges.id, id));
    await audit(session.email, "update", "badge", String(id), `Visibility ${visible}`);
    revalidatePath("/");
    revalidatePath("/admin/badges");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function setBadgeOrder(orderedIds: number[]) {
  const session = await requireAdmin();
  if (!db) return { ok: false };
  try {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.update(badges).set({ sort: i + 1 }).where(eq(badges.id, orderedIds[i]));
    }
    await audit(session.email, "update", "badge", undefined, "Reordered badges");
    revalidatePath("/");
    revalidatePath("/admin/badges");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
