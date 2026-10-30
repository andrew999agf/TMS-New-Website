import type { MetadataRoute } from "next";
import { getPracticeAreas, getPublishedPosts, getGlossaryTerms, getTeam, getResults } from "@/lib/content";
import { slugify } from "@/lib/utils";
import { SITE_URL } from "@/lib/seo";
import { OFFICES } from "@/lib/firm";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL;
  const staticPaths = [
    "",
    "/about",
    "/practice-areas",
    "/results",
    "/blog",
    "/glossary",
    "/texas-rules",
    "/contact",
    "/consultation",
    "/privacy",
    "/disclaimer",
  ];

  const [practices, posts, terms, team, results] = await Promise.all([
    getPracticeAreas(),
    getPublishedPosts(),
    getGlossaryTerms(),
    getTeam(),
    getResults(),
  ]);

  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    ...staticPaths.map((p) => ({
      url: `${base}${p}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: p === "" ? 1 : 0.7,
    })),
    ...OFFICES.map((o) => ({
      url: `${base}/locations/${o.id}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...practices.map((p) => ({
      url: `${base}/practice-areas/${p.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...posts.map((p) => ({
      url: `${base}/blog/${p.slug}`,
      lastModified: p.publishAt ? new Date(p.publishAt) : now,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
    ...terms.map((t) => ({
      url: `${base}/glossary/${t.slug}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.4,
    })),
    ...team.map((m) => ({
      url: `${base}/about/${m.slug}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.5,
    })),
    ...results.map((r) => ({
      url: `${base}/blog/results/${slugify(r.title)}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
  ];
  return entries;
}
