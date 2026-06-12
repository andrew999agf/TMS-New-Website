import { AdminHeader } from "@/components/admin/AdminShell";
import { GlossaryManager } from "@/components/admin/GlossaryManager";
import { getGlossaryTerms, getPracticeAreas } from "@/lib/content";
import { db, hasDb } from "@/db";
import { glossaryTerms } from "@/db/schema";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function GlossaryAdmin() {
  const practices = await getPracticeAreas();

  // Only DB-backed terms have stable numeric ids for editing.
  let terms: { id: number; slug: string; term: string; definition: string; hypothetical: string; relatedPractices: string[]; aliases: string[] }[] = [];
  if (db) {
    try {
      const rows = await db.select().from(glossaryTerms).orderBy(asc(glossaryTerms.term));
      terms = rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        term: r.term,
        definition: r.definition,
        hypothetical: r.hypothetical ?? "",
        relatedPractices: (r.relatedPractices as string[]) ?? [],
        aliases: (r.aliases as string[]) ?? [],
      }));
    } catch {
      terms = [];
    }
  }
  if (terms.length === 0) {
    const seed = await getGlossaryTerms();
    terms = seed.map((t, i) => ({
      id: -(i + 1),
      slug: t.slug,
      term: t.term,
      definition: t.definition,
      hypothetical: t.hypothetical,
      relatedPractices: t.relatedPractices,
      aliases: t.aliases ?? [],
    }));
  }

  return (
    <>
      <AdminHeader
        title="Glossary"
        description="Definitions + flashcard hypotheticals. Terms auto-highlight in posts and populate the public index."
      />
      <div className="p-8">
        <GlossaryManager
          terms={terms}
          practices={practices.map((p) => ({ slug: p.slug, title: p.title }))}
          dbEnabled={hasDb}
        />
      </div>
    </>
  );
}
