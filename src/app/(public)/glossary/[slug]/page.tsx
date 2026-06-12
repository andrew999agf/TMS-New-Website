import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero, Breadcrumbs } from "@/components/site/PageHero";
import { JsonLd } from "@/components/site/JsonLd";
import {
  getGlossaryTerm,
  getGlossaryTerms,
  getPublishedPosts,
  getPracticeArea,
} from "@/lib/content";

export async function generateStaticParams() {
  const terms = await getGlossaryTerms();
  return terms.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const term = await getGlossaryTerm(slug);
  if (!term) return {};
  return {
    title: `${term.term} — Glossary`,
    description: term.definition,
  };
}

export default async function GlossaryTermPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const term = await getGlossaryTerm(slug);
  if (!term) notFound();

  const posts = await getPublishedPosts();
  const appearsIn = posts.filter(
    (p) =>
      p.body.toLowerCase().includes(term.term.toLowerCase()) ||
      (term.aliases ?? []).some((a) => p.body.toLowerCase().includes(a.toLowerCase())),
  );

  const practices = await Promise.all(
    (term.relatedPractices ?? []).map((s) => getPracticeArea(s)),
  );

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "DefinedTerm",
          name: term.term,
          description: term.definition,
          inDefinedTermSet: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/glossary`,
        }}
      />
      <PageHero eyebrow="Glossary Term" title={term.term}>
        <div className="mt-6">
          <Breadcrumbs items={[{ label: "Glossary", href: "/glossary" }, { label: term.term }]} />
        </div>
      </PageHero>

      <div className="container-prose py-16 lg:py-20">
        <h2 className="eyebrow eyebrow-muted">Definition</h2>
        <p className="mt-3 text-xl leading-relaxed">{term.definition}</p>

        {term.hypothetical && (
          <div className="mt-10 border-l-2 border-[var(--c-accent)] pl-6 py-1">
            <h2 className="eyebrow">Hypothetical</h2>
            <p className="mt-3 leading-relaxed text-[var(--c-ink-muted)]">{term.hypothetical}</p>
          </div>
        )}

        {practices.filter(Boolean).length > 0 && (
          <div className="mt-10">
            <h2 className="eyebrow eyebrow-muted mb-3">Related practice areas</h2>
            <div className="flex flex-wrap gap-2">
              {practices.filter(Boolean).map((p) => (
                <Link
                  key={p!.slug}
                  href={`/practice-areas/${p!.slug}`}
                  className="px-3.5 py-1.5 text-sm border border-[var(--c-border)] rounded-full hover:border-[var(--c-accent)] hover:text-[var(--c-accent)] transition-colors"
                >
                  {p!.title}
                </Link>
              ))}
            </div>
          </div>
        )}

        {appearsIn.length > 0 && (
          <div className="mt-10 border-t border-[var(--c-border)] pt-8">
            <h2 className="eyebrow eyebrow-muted mb-3">Appears in</h2>
            <ul className="space-y-2">
              {appearsIn.map((p) => (
                <li key={p.slug}>
                  <Link href={`/blog/${p.slug}`} className="link-underline">
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
