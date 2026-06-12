"use server";

import { revalidatePath } from "next/cache";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bannerItems } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";

export async function addBannerItem(data: {
  kind: "image" | "video";
  url: string;
  posterUrl?: string;
  alt?: string;
  durationMs: number;
  kenBurns: boolean;
  direction: string;
  intensity: number;
}) {
  const session = await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${bannerItems.sort}), 0)` }).from(bannerItems);
  await db.insert(bannerItems).values({
    kind: data.kind,
    url: data.url,
    posterUrl: data.posterUrl || null,
    alt: data.alt || null,
    durationMs: data.durationMs,
    kenBurns: { enabled: data.kenBurns, direction: data.direction, intensity: data.intensity },
    sort: Number(max) + 1,
  });
  await audit(session.email, "create", "banner", undefined, "Added banner item");
  revalidatePath("/");
  revalidatePath("/admin/banner");
  return { ok: true };
}

export async function deleteBannerItem(id: number) {
  const session = await requireAdmin();
  if (!db) return { ok: false };
  await db.delete(bannerItems).where(eq(bannerItems.id, id));
  await audit(session.email, "delete", "banner", String(id), "Deleted banner item");
  revalidatePath("/");
  revalidatePath("/admin/banner");
  return { ok: true };
}

export async function toggleBannerItem(id: number, visible: boolean) {
  const session = await requireAdmin();
  if (!db) return { ok: false };
  await db.update(bannerItems).set({ visible }).where(eq(bannerItems.id, id));
  await audit(session.email, "update", "banner", String(id), `Visibility ${visible}`);
  revalidatePath("/");
  revalidatePath("/admin/banner");
  return { ok: true };
}

/** Move an item up/down by swapping sort with its neighbor. */
export async function reorderBannerItem(id: number, dir: "up" | "down") {
  const session = await requireAdmin();
  if (!db) return { ok: false };
  const items = await db.select().from(bannerItems).orderBy(asc(bannerItems.sort));
  const idx = items.findIndex((i) => i.id === id);
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= items.length) return { ok: true };
  const a = items[idx];
  const b = items[swapIdx];
  await db.update(bannerItems).set({ sort: b.sort }).where(eq(bannerItems.id, a.id));
  await db.update(bannerItems).set({ sort: a.sort }).where(eq(bannerItems.id, b.id));
  await audit(session.email, "update", "banner", String(id), `Reordered ${dir}`);
  revalidatePath("/");
  revalidatePath("/admin/banner");
  return { ok: true };
}
