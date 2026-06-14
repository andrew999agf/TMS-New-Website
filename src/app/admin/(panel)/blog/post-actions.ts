"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { blogPosts, glossaryTerms } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { slugify } from "@/lib/utils";

export type PostInput = {
  id?: number;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  bannerImage?: string;
  bannerFocal?: string;
  category?: string;
  tags?: string[];
  isFirmNews?: boolean;
  status: "draft" | "hidden" | "scheduled" | "published";
  publishAt?: string;
  seoTitle?: string;
  seoDescription?: string;
  relatedPractices?: string[];
  relatedPosts?: string[];
};

export async function savePost(input: PostInput): Promise<{ ok: boolean; error?: string; slug?: string }> {
  const session = await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  if (!input.title.trim()) return { ok: false, error: "Title is required." };

  const slug = (input.slug || slugify(input.title)).trim();
  const publishAt = input.publishAt ? new Date(input.publishAt) : null;
  const publishedAt = input.status === "published" ? publishAt ?? new Date() : null;

  const values = {
    slug,
    title: input.title,
    excerpt: input.excerpt,
    body: input.body,
    bannerImage: input.bannerImage || null,
    bannerFocal: input.bannerFocal || "center",
    category: input.category || null,
    tags: input.tags ?? [],
    isFirmNews: input.isFirmNews ?? false,
    status: input.status,
    publishAt,
    publishedAt,
    seoTitle: input.seoTitle || null,
    seoDescription: input.seoDescription || null,
    relatedPractices: input.relatedPractices ?? [],
    relatedPosts: input.relatedPosts ?? [],
    updatedAt: new Date(),
  };

  try {
    if (input.id && input.id > 0) {
      await db.update(blogPosts).set(values).where(eq(blogPosts.id, input.id));
    } else {
      await db.insert(blogPosts).values(values).onConflictDoUpdate({
        target: blogPosts.slug,
        set: values,
      });
    }
    await audit(session.email, input.id ? "update" : "create", "post", slug, `Saved post (${input.status})`);
    revalidatePath("/admin/blog");
    revalidatePath("/blog");
    revalidatePath(`/blog/${slug}`);
    return { ok: true, slug };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deletePost(id: number) {
  const session = await requireAdmin();
  if (!db) return { ok: false };
  await db.delete(blogPosts).where(eq(blogPosts.id, id));
  await audit(session.email, "delete", "post", String(id), "Deleted post");
  revalidatePath("/admin/blog");
  revalidatePath("/blog");
  return { ok: true };
}

/** Inline glossary term creation from the post editor's "mark as term" flow. */
export async function createGlossaryTerm(input: {
  term: string;
  definition: string;
  hypothetical: string;
}): Promise<{ ok: boolean; slug?: string; error?: string }> {
  const session = await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  const slug = slugify(input.term);
  try {
    await db
      .insert(glossaryTerms)
      .values({
        slug,
        term: input.term,
        definition: input.definition,
        hypothetical: input.hypothetical,
        relatedPractices: [],
        aliases: [],
      })
      .onConflictDoUpdate({
        target: glossaryTerms.slug,
        set: { definition: input.definition, hypothetical: input.hypothetical },
      });
    await audit(session.email, "create", "glossary", slug, `Created term: ${input.term}`);
    revalidatePath("/glossary");
    return { ok: true, slug };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
