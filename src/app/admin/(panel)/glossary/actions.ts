"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { glossaryTerms } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { slugify } from "@/lib/utils";

export type TermInput = {
  id?: number;
  term: string;
  definition: string;
  hypothetical: string;
  relatedPractices: string[];
  aliases: string[];
};

export async function saveTerm(input: TermInput) {
  const session = await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  if (!input.term.trim() || !input.definition.trim())
    return { ok: false, error: "Term and definition are required." };

  const values = {
    slug: slugify(input.term),
    term: input.term,
    definition: input.definition,
    hypothetical: input.hypothetical,
    relatedPractices: input.relatedPractices,
    aliases: input.aliases,
    updatedAt: new Date(),
  };

  try {
    if (input.id && input.id > 0) {
      await db.update(glossaryTerms).set(values).where(eq(glossaryTerms.id, input.id));
    } else {
      await db.insert(glossaryTerms).values(values).onConflictDoUpdate({
        target: glossaryTerms.slug,
        set: values,
      });
    }
    await audit(session.email, input.id ? "update" : "create", "glossary", values.slug, `Saved term: ${input.term}`);
    revalidatePath("/glossary");
    revalidatePath("/admin/glossary");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteTerm(id: number) {
  const session = await requireAdmin();
  if (!db) return { ok: false };
  await db.delete(glossaryTerms).where(eq(glossaryTerms.id, id));
  await audit(session.email, "delete", "glossary", String(id), "Deleted term");
  revalidatePath("/glossary");
  revalidatePath("/admin/glossary");
  return { ok: true };
}
