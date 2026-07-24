import type { Metadata } from "next";
import { PageHero } from "@/components/site/PageHero";
import { GlossaryIndex } from "@/components/site/GlossaryIndex";
import { getGlossaryTerms, getBlocks, getPracticeAreas } from "@/lib/content";

export const metadata: Metadata = {
  title: "Glossary",
  description:
    "Plain-English definitions of Texas legal terms, each with a worked hypothetical. From summary judgment to supersedeas bonds.",
};

export const dynamic = "force-dynamic";

export default async function GlossaryPage() {
  const [terms, page, practices] = await Promise.all([getGlossaryTerms(), getBlocks("glossary"), getPracticeAreas()]);
  return (
    <>
      <PageHero
        eyebrow="Index of Terms"
        title="The vocabulary, in plain English."
        lead="Every term below comes with a definition and a worked hypothetical — the way you would actually learn it."
        bgImage={page["glossary.hero.image"] || undefined}
        focal={page["glossary.hero.image.focal"]}
      />
      <div className="container-page py-16 lg:py-24">
        <GlossaryIndex
          terms={terms.map((t) => ({
            slug: t.slug,
            term: t.term,
            definition: t.definition,
            hypothetical: t.hypothetical,
            practices: t.relatedPractices ?? [],
          }))}
          practiceAreas={practices.map((p) => ({ slug: p.slug, title: p.title }))}
        />
      </div>
    </>
  );
}
