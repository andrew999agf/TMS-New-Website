import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero, Breadcrumbs } from "@/components/site/PageHero";
import { GlossaryBody } from "@/components/site/GlossaryTooltips";
import { ShareButtons } from "@/components/site/ShareButtons";
import { JsonLd } from "@/components/site/JsonLd";
import {
  getPost,
  getPublishedPosts,
  getGlossaryTerms,
  getPracticeArea,
} from "@/lib/content";
import { annotateGlossary } from "@/lib/content/glossary-annotate";
import { formatDate, readingTime } from "@/lib/utils";
import { FIRM } from "@/lib/firm";
const FIRM_NAME = FIRM.name; const BAR_NO = FIRM.attorney.barNumber;
import { SITE_URL, ORG_ID, ATTORNEY_ID, stripFirmSuffix, clampTitle, clampDescription } from "@/lib/seo";
import { getLeadMember } from "@/lib/content";

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
    title: clampTitle(stripFirmSuffix(post.seoTitle ?? post.title)),
    description: clampDescription(post.seoDescription || post.excerpt || post.body, `${post.title} — from the Insights of T. Maxwell Smith, PLLC, a Texas trial firm.`),
    openGraph: { title: post.title, description: post.excerpt, type: "article", ...(post.publishAt ? { publishedTime: post.publishAt } : {}), ...(post.bannerImage ? { images: [{ url: post.bannerImage }] } : {}) },
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

  const [category, lead] = await Promise.all([post.category ? getPracticeArea(post.category) : Promise.resolve(null), getLeadMember()]);

  // Hand-picked related posts first; otherwise the newest in the same
  // practice area (or sharing a tag), so no article is a dead end.
  const picked = (post.relatedPosts ?? []).map((s) => allPosts.find((p) => p.slug === s)).filter(Boolean) as typeof allPosts;
  const auto = allPosts.filter((p) => p.slug !== post.slug && !picked.some((x) => x.slug === p.slug) && ((post.category && p.category === post.category) || (post.tags ?? []).some((t) => (p.tags ?? []).includes(t))));
  const related = [...picked, ...auto].slice(0, 3);
  // Newest-first list → previous is the newer neighbour, next the older one.
  const idx = allPosts.findIndex((p) => p.slug === post.slug);
  const newer = idx > 0 ? allPosts[idx - 1] : null;
  const older = idx >= 0 && idx < allPosts.length - 1 ? allPosts[idx + 1] : null;
  const url = `${SITE_URL}/blog/${post.slug}`;
  const wordCount = post.body.replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length;
  const updated = post.publishedAtDate && post.publishAt && new Date(post.publishedAtDate).getTime() > new Date(post.publishAt).getTime() + 86_400_000 ? post.publishedAtDate : null;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          "@id": `${url}#article`,
          mainEntityOfPage: { "@type": "WebPage", "@id": url },
          url,
          headline: post.title,
          description: post.excerpt,
          author: lead && post.author === lead.name ? { "@id": ATTORNEY_ID } : { "@type": "Person", name: post.author },
          publisher: { "@id": ORG_ID },
          datePublished: post.publishAt,
          dateModified: updated ?? post.publishAt,
          ...(post.bannerImage ? { image: post.bannerImage.startsWith("http") ? post.bannerImage : `${SITE_URL}${post.bannerImage}` } : {}),
          articleSection: category?.title,
          keywords: (post.tags ?? []).join(", ") || undefined,
          wordCount,
          inLanguage: "en-US",
          isAccessibleForFree: true,
        }}
      />
      <PageHero eyebrow={category?.title ?? "Insights"} title={post.title} bgImage={post.bannerImage} focal={post.bannerFocal}>
        <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-[var(--c-dark-ink-muted)]">
          <span>{post.author}</span>
          {post.publishAt && <span>· {formatDate(post.publishAt)}</span>}
          {updated && <span>· Updated {formatDate(updated)}</span>}
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

        <div className="mt-10 border-t border-[var(--c-border)] pt-6">
          <ShareButtons title={post.title} />
        </div>

        {/* Who wrote it — the attorney's own page carries the credentials. */}
        {lead && post.author === lead.name && (
          <div className="mt-10 border-t border-[var(--c-border)] pt-6 text-sm">
            <p className="eyebrow eyebrow-muted mb-2">About the author</p>
            <p><Link href={`/about/${lead.slug}`} className="font-[family-name:var(--font-display)] text-lg hover:text-[var(--c-accent)]">{lead.name}</Link><span className="text-[var(--c-ink-muted)]"> — {lead.role}, {FIRM_NAME}. Texas Bar No. {BAR_NO}.</span></p>
          </div>
        )}

        {(newer || older) && (
          <nav aria-label="More articles" className="mt-10 flex flex-wrap justify-between gap-4 border-t border-[var(--c-border)] pt-6 text-sm">
            {older ? <Link href={`/blog/${older.slug}`} className="max-w-[48%] hover:text-[var(--c-accent)]"><span className="block text-xs text-[var(--c-ink-muted)]">← Earlier</span>{older.title}</Link> : <span />}
            {newer && <Link href={`/blog/${newer.slug}`} className="max-w-[48%] text-right hover:text-[var(--c-accent)]"><span className="block text-xs text-[var(--c-ink-muted)]">Later →</span>{newer.title}</Link>}
          </nav>
        )}

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
