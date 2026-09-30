import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHero } from "@/components/site/PageHero";
import { BlogIndex } from "@/components/site/BlogIndex";
import { getPublishedPosts, getPracticeAreas, getBlocks, getResults } from "@/lib/content";
import { slugify } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Insights",
  description:
    "Plain-English explainers on Texas litigation, appeals, injury, debt defense, business, estate planning, and probate.",
};

export const dynamic = "force-dynamic";

export default async function BlogPage() {
  const [posts, practices, page, results] = await Promise.all([
    getPublishedPosts(),
    getPracticeAreas(),
    getBlocks("blog"),
    getResults(),
  ]);

  const usedCategories = new Set(posts.map((p) => p.category).filter(Boolean));
  const categories = practices
    .filter((p) => usedCategories.has(p.slug))
    .map((p) => ({ slug: p.slug, title: p.title }));

  return (
    <>
      <PageHero
        eyebrow="Insights"
        title="What we know, in plain English."
        lead="No invented cases. Just how this actually works — litigation, appeals, injury, debt, business, and estates."
        bgImage={page["blog.hero.image"] || undefined}
        focal={page["blog.hero.image.focal"]}
      />
      <div className="container-page py-16 lg:py-24">
        <BlogIndex
          posts={posts.map((p) => ({
            slug: p.slug,
            title: p.title,
            excerpt: p.excerpt,
            category: p.category,
            publishAt: p.publishAt,
          }))}
          categories={categories}
        />

        {/* Case results live in the blog too — the detail pages are at
            /blog/results/<slug>, and this quiet list makes them findable
            from here as well as from the Results page. */}
        {results.length > 0 && (
          <section className="mt-20">
            <h2 className="h3 border-b border-[var(--c-border)] pb-3">Case results</h2>
            <ul className="mt-6 divide-y divide-[var(--c-border)]">
              {results.map((r, i) => (
                <li key={i} className="flex items-baseline justify-between gap-6 py-4">
                  <span className="leading-snug">
                    <Link href={`/blog/results/${slugify(r.title)}`} className="hover:text-[var(--c-accent)] transition-colors">
                      {r.title} <ArrowRight size={13} className="inline-block align-baseline text-[var(--c-accent)]" />
                    </Link>
                  </span>
                  {r.year && (
                    <span className="text-sm text-[var(--c-ink-muted)] whitespace-nowrap font-[family-name:var(--font-ui)]">{r.year}</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-[var(--c-ink-muted)]">
              Past results do not guarantee a similar outcome. Each case depends on its own facts and circumstances.
            </p>
          </section>
        )}
      </div>
    </>
  );
}
