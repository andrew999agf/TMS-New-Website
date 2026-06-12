import type { Metadata } from "next";
import { PageHero } from "@/components/site/PageHero";
import { GlossaryIndex } from "@/components/site/GlossaryIndex";
import { getGlossaryTerms } from "@/lib/content";

export const metadata: Metadata = {
  title: "Glossary",
  description:
    "Plain-English definitions of Texas legal terms, each with a worked hypothetical. From summary judgment to supersedeas bonds.",
};

export default async function GlossaryPage() {
  const terms = await getGlossaryTerms();
  return (
    <>
      <PageHero
        eyebrow="Index of Terms"
        title="The vocabulary, in plain English."
        lead="Every term below comes with a definition and a worked hypothetical — the way you would actually learn it."
      />
      <div className="container-page py-16 lg:py-24">
        <GlossaryIndex
          terms={terms.map((t) => ({
            slug: t.slug,
            term: t.term,
            definition: t.definition,
            hypothetical: t.hypothetical,
          }))}
        />
      </div>
    </>
  );
}
