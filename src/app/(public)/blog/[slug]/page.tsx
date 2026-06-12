import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero, Breadcrumbs } from "@/components/site/PageHero";
import { GlossaryBody } from "@/components/site/GlossaryTooltips";
import { JsonLd } from "@/components/site/JsonLd";
import {
  getPost,
  getPublishedPosts,
  getGlossaryTerms,
  getPracticeArea,
} from "@/lib/content";
import { annotateGlossary } from "@/lib/content/glossary-annotate";
import { formatDate, readingTime } from "@/lib/utils";

export async function generateStaticParams() {
  const posts = await getPublishedPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return {};
  return {
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? post.excerpt,
    openGraph: { title: post.title, description: post.excerpt, type: "article" },
  };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  // Only show posts that should be public.
  const now = new Date();
  const isPublic =
    post.status === "published" ||
    (post.status === "scheduled" && post.publishAt && new Date(post.publishAt) <= now);
  if (!isPublic) notFound();

  const [terms, allPosts] = await Promise.all([
    getGlossaryTerms(),
    getPublishedPosts(),
  ]);

  const annotated = annotateGlossary(post.body, terms);
  const usedSlugs = new Set(
    [...annotated.matchAll(/data-slug="([^"]+)"/g)].map((m) => m[1]),
  );
  const glossEntries = terms
    .filter((t) => usedSlugs.has(t.slug))
    .map((t) => ({
      slug: t.slug,
      term: t.term,
      definition: t.definition,
      hypothetical: t.hypothetical,
    }));

  const category = post.category ? await getPracticeArea(post.category) : null;

  const related = (post.relatedPosts ?? [])
    .map((s) => allPosts.find((p) => p.slug === s))
    .filter(Boolean)
    .slice(0, 3) as typeof allPosts;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          description: post.excerpt,
          author: { "@type": "Person", name: post.author },
          datePublished: post.publishAt,
          articleSection: category?.title,
        }}
      />
      <PageHero eyebrow={category?.title ?? "Insights"} title={post.title}>
        <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-[var(--c-dark-ink-muted)]">
          <span>{post.author}</span>
          {post.publishAt && <span>· {formatDate(post.publishAt)}</span>}
          <span>· {readingTime(post.body)}</span>
        </div>
        <div className="mt-6">
          <Breadcrumbs items={[{ label: "Insights", href: "/blog" }, { label: post.title }]} />
        </div>
      </PageHero>

      <article className="container-prose py-16 lg:py-20 relative">
        {post.excerpt && (
          <p className="lead mb-10 text-[var(--c-ink)] font-[family-name:var(--font-display)]">
            {post.excerpt}
          </p>
        )}

        <GlossaryBody html={annotated} entries={glossEntries} />

        {post.isFirmNews && (
          <p className="mt-10 text-sm text-[var(--c-ink-muted)] border-t border-[var(--c-border)] pt-6">
            Past results do not guarantee a similar outcome. Each case depends on its own facts.
          </p>
        )}

        {/* Related practices */}
        {(post.relatedPractices ?? []).length > 0 && (
          <div className="mt-12 border-t border-[var(--c-border)] pt-8">
            <h2 className="eyebrow eyebrow-muted mb-4">Related practice areas</h2>
            <div className="flex flex-wrap gap-2">
              {(post.relatedPractices ?? []).map((s) => (
                <Link
                  key={s}
                  href={`/practice-areas/${s}`}
                  className="px-3.5 py-1.5 text-sm border border-[var(--c-border)] rounded-full hover:border-[var(--c-accent)] hover:text-[var(--c-accent)] transition-colors"
                >
                  {s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>

      {/* Related reading */}
      {related.length > 0 && (
        <section className="bg-[var(--c-surface2)] py-16">
          <div className="container-page">
            <h2 className="eyebrow eyebrow-muted mb-6">Keep reading</h2>
            <div className="grid gap-6 md:grid-cols-3">
              {related.map((p) => (
                <Link
                  key={p.slug}
                  href={`/blog/${p.slug}`}
                  className="group block bg-[var(--c-surface)] border border-[var(--c-border)] p-6 hover:border-[var(--c-accent)] transition-colors"
                >
                  <h3 className="font-[family-name:var(--font-display)] text-lg leading-tight group-hover:text-[var(--c-accent)] transition-colors">
                    {p.title}
                  </h3>
                  <p className="mt-2 text-sm text-[var(--c-ink-muted)] line-clamp-2">
                    {p.excerpt}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
