"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { practiceAreas } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";

export type PracticeInput = {
  slug: string;
  title: string;
  tagline: string;
  body: string[];
  approach: string;
  keywords: string[];
  heroImage?: string;
  heroFocal?: string;
  seoTitle?: string;
  seoDescription?: string;
  visible: boolean;
};

export async function savePracticeArea(input: PracticeInput) {
  const session = await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };

  try {
    await db
      .update(practiceAreas)
      .set({
        title: input.title,
        tagline: input.tagline,
        body: input.body,
        approach: input.approach,
        keywords: input.keywords,
        heroImage: input.heroImage || null,
        heroFocal: input.heroFocal || "center",
        seoTitle: input.seoTitle || null,
        seoDescription: input.seoDescription || null,
        visible: input.visible,
        updatedAt: new Date(),
      })
      .where(eq(practiceAreas.slug, input.slug));
    await audit(session.email, "update", "practice", input.slug, `Updated ${input.title}`);
    revalidatePath(`/practice-areas/${input.slug}`);
    revalidatePath("/practice-areas");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
