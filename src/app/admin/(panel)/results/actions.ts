"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { caseResults } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { ensureResultsPageColumns } from "@/db/ensure";
import { slugify } from "@/lib/utils";

export type ResultInput = {
  id?: number;
  category: "marquee" | "appellate" | "settlement" | "jury" | "other";
  title: string;
  stat?: string;
  statLabel?: string;
  year?: string;
  summary?: string;
  detail?: string;
  cite?: string;
  link?: string;
  practiceSlug?: string;
  featuredHome: boolean;
  hasPage?: boolean;
  pageBody?: string;
  heroImage?: string;
  heroFocal?: string;
  shareImage?: string;
  shareTitle?: string;
  shareDescription?: string;
};

export async function saveResult(input: ResultInput) {
  const session = await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  if (!input.title.trim()) return { ok: false, error: "Title is required." };
  await ensureResultsPageColumns();

  const values = {
    category: input.category,
    title: input.title,
    stat: input.stat || null,
    statLabel: input.statLabel || null,
    year: input.year || null,
    summary: input.summary || null,
    detail: input.detail || null,
    cite: input.cite || null,
    link: input.link || null,
    practiceSlug: input.practiceSlug || null,
    featuredHome: input.featuredHome,
    hasPage: input.hasPage ?? false,
    pageBody: input.pageBody || null,
    heroImage: input.heroImage || null,
    heroFocal: input.heroFocal || null,
    shareImage: input.shareImage?.trim() || null,
    shareTitle: input.shareTitle?.trim().slice(0, 255) || null,
    shareDescription: input.shareDescription?.trim() || null,
    updatedAt: new Date(),
  };

  try {
    if (input.id && input.id > 0) {
      await db.update(caseResults).set(values).where(eq(caseResults.id, input.id));
    } else {
      const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${caseResults.sort}), 0)` }).from(caseResults);
      await db.insert(caseResults).values({ ...values, sort: Number(max) + 1 });
    }
    await audit(session.email, input.id ? "update" : "create", "result", input.id ? String(input.id) : undefined, `Saved result: ${input.title}`);
    revalidatePath("/results");
    revalidatePath("/");
    revalidatePath("/admin/results");
    revalidatePath(`/blog/results/${slugify(input.title)}`);
    revalidatePath("/blog");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteResult(id: number) {
  const session = await requireAdmin();
  if (!db) return { ok: false };
  await db.delete(caseResults).where(eq(caseResults.id, id));
  await audit(session.email, "delete", "result", String(id), "Deleted result");
  revalidatePath("/results");
  revalidatePath("/admin/results");
  return { ok: true };
}
