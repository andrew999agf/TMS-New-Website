import type { Metadata } from "next";
import { PageHero } from "@/components/site/PageHero";
import { BlogIndex } from "@/components/site/BlogIndex";
import { getPublishedPosts, getPracticeAreas } from "@/lib/content";

export const metadata: Metadata = {
  title: "Insights",
  description:
    "Plain-English explainers on Texas litigation, appeals, injury, debt defense, business, estate planning, and probate.",
};

export default async function BlogPage() {
  const [posts, practices] = await Promise.all([
    getPublishedPosts(),
    getPracticeAreas(),
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
      </div>
    </>
  );
}
