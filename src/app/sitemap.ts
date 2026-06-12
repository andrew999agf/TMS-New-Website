import type { MetadataRoute } from "next";
import { getPracticeAreas, getPublishedPosts, getGlossaryTerms, getTeam } from "@/lib/content";
import { FIRM } from "@/lib/firm";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${FIRM.domain}`;
  const staticPaths = [
    "",
    "/about",
    "/practice-areas",
    "/results",
    "/blog",
    "/glossary",
    "/contact",
    "/consultation",
    "/payment",
    "/privacy",
    "/disclaimer",
  ];

  const [practices, posts, terms, team] = await Promise.all([
    getPracticeAreas(),
    getPublishedPosts(),
    getGlossaryTerms(),
    getTeam(),
  ]);

  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    ...staticPaths.map((p) => ({
      url: `${base}${p}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: p === "" ? 1 : 0.7,
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
  ];
  return entries;
}
