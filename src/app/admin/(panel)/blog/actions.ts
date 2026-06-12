"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { blogPosts } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";

export async function togglePostVisibility(id: number, makePublished: boolean) {
  const session = await requireAdmin();
  if (!db) return { ok: false };
  const status = makePublished ? "published" : "hidden";
  await db
    .update(blogPosts)
    .set({ status, publishedAt: makePublished ? new Date() : null })
    .where(eq(blogPosts.id, id));
  await audit(session.email, "publish", "post", String(id), `Post → ${status}`);
  revalidatePath("/admin/blog");
  revalidatePath("/blog");
  return { ok: true };
}

export async function reschedulePost(id: number, publishAt: string) {
  const session = await requireAdmin();
  if (!db) return { ok: false };
  await db
    .update(blogPosts)
    .set({ status: "scheduled", publishAt: new Date(publishAt) })
    .where(eq(blogPosts.id, id));
  await audit(session.email, "update", "post", String(id), `Rescheduled → ${publishAt}`);
  revalidatePath("/admin/blog");
  return { ok: true };
}
