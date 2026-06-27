import "server-only";
import Fuse from "fuse.js";
import {
  getPracticeAreas,
  getPublishedPosts,
  getGlossaryTerms,
  getTeam,
  getResults,
  getSetting,
} from "@/lib/content";
import { TEXAS_RULES_KEY, DEFAULT_TEXAS_RULES, type TexasRule } from "@/lib/texas-rules";

/**
 * Site-wide search index. It is assembled from the same live content getters
 * the public pages use, so it stays current automatically as practice areas,
 * posts, team members, glossary terms, and results are added/edited/removed —
 * no separate index to maintain. Cached briefly per server instance so rapid
 * keystrokes don't rebuild it every time.
 */

export type SearchType =
  | "Practice Area"
  | "Insight"
  | "Team"
  | "Glossary"
  | "Texas Rule"
  | "Result"
  | "Page";

export type SearchDoc = {
  id: string;
  type: SearchType;
  title: string;
  subtitle?: string;
  url: string;
  keywords: string;
};

/** Inclusive [start, end] character ranges in the title that matched the query. */
export type MatchRange = [number, number];

export type SearchResult = Pick<SearchDoc, "type" | "title" | "subtitle" | "url"> & {
  /** Highlight ranges for the title, so the UI can emphasize what matched. */
  matches?: MatchRange[];
};

const stripHtml = (s?: string) => (s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const clip = (s: string, n = 400) => (s.length > n ? s.slice(0, n) : s);

// Top-level pages that aren't generated from a content collection.
const STATIC_PAGES: SearchDoc[] = [
  { id: "page-home", type: "Page", title: "Home", url: "/", keywords: "home firm trial texas" },
  { id: "page-about", type: "Page", title: "Our Team", url: "/about", keywords: "team attorney about staff people" },
  { id: "page-practice", type: "Page", title: "Practice Areas", url: "/practice-areas", keywords: "practice areas services what we handle" },
  { id: "page-results", type: "Page", title: "Results", url: "/results", keywords: "results record verdicts settlements appeals" },
  { id: "page-blog", type: "Page", title: "Insights", url: "/blog", keywords: "insights blog articles news" },
  { id: "page-glossary", type: "Page", title: "Glossary", url: "/glossary", keywords: "glossary terms definitions plain english" },
  { id: "page-texas-rules", type: "Page", title: "Texas Rules", url: "/texas-rules", keywords: "texas rules civil procedure appellate evidence judicial conduct disciplinary guardianship download pdf statewide" },
  { id: "page-contact", type: "Page", title: "Contact", url: "/contact", keywords: "contact phone office locations fort worth bosque weatherford" },
  { id: "page-consult", type: "Page", title: "Request a Consultation", url: "/consultation", keywords: "consultation intake request appointment talk to a lawyer" },
  { id: "page-payment", type: "Page", title: "Make a Payment", url: "/payment", keywords: "payment pay bill invoice clio" },
];

const FUSE_OPTS = {
  keys: [
    { name: "title", weight: 0.6 },
    { name: "subtitle", weight: 0.2 },
    { name: "keywords", weight: 0.2 },
  ],
  threshold: 0.35,
  ignoreLocation: true,
  minMatchCharLength: 2,
  includeMatches: true,
  includeScore: true,
};

let cache: { at: number; fuse: Fuse<SearchDoc> } | null = null;
const TTL = 60_000;

async function buildDocs(): Promise<SearchDoc[]> {
  const [practices, posts, glossary, team, results, rules] = await Promise.all([
    getPracticeAreas(),
    getPublishedPosts(),
    getGlossaryTerms(),
    getTeam(),
    getResults(),
    getSetting<TexasRule[]>(TEXAS_RULES_KEY, DEFAULT_TEXAS_RULES),
  ]);

  const docs: SearchDoc[] = [];

  for (const p of practices) {
    docs.push({
      id: `pa-${p.slug}`,
      type: "Practice Area",
      title: p.title,
      subtitle: p.tagline,
      url: `/practice-areas/${p.slug}`,
      keywords: clip([p.title, p.tagline, ...(p.keywords ?? []), (p.body ?? []).join(" "), p.approach].join(" ")),
    });
  }

  for (const b of posts) {
    docs.push({
      id: `post-${b.slug}`,
      type: "Insight",
      title: b.title,
      subtitle: b.excerpt,
      url: `/blog/${b.slug}`,
      keywords: clip([b.title, b.excerpt, b.category ?? "", ...(b.tags ?? []), stripHtml(b.body)].join(" ")),
    });
  }

  for (const m of team) {
    docs.push({
      id: `team-${m.slug}`,
      type: "Team",
      title: m.name,
      subtitle: m.role,
      url: `/about/${m.slug}`,
      keywords: clip([m.name, m.role, m.bioProfessional ?? "", ...(m.practiceAreas ?? [])].join(" ")),
    });
  }

  for (const g of glossary) {
    docs.push({
      id: `gl-${g.slug}`,
      type: "Glossary",
      title: g.term,
      subtitle: "Glossary term",
      url: `/glossary/${g.slug}`,
      keywords: clip([g.term, g.definition, ...(g.aliases ?? [])].join(" ")),
    });
  }

  for (const r of results) {
    docs.push({
      id: `res-${r.sort}`,
      type: "Result",
      title: r.statLabel ?? r.title,
      subtitle: r.stat ?? "Case result",
      url: "/results",
      keywords: clip([r.title, r.statLabel ?? "", r.summary ?? "", r.stat ?? ""].join(" ")),
    });
  }

  for (const r of rules) {
    docs.push({
      id: `rule-${r.id}`,
      type: "Texas Rule",
      title: r.title,
      subtitle: r.lastAmended ? `Last amended ${r.lastAmended}` : "Statewide rule",
      url: "/texas-rules",
      keywords: clip([r.title, "texas rule statewide", r.lastAmended ?? ""].join(" ")),
    });
  }

  docs.push(...STATIC_PAGES);
  return docs;
}

async function getFuse(): Promise<Fuse<SearchDoc>> {
  if (cache && Date.now() - cache.at < TTL) return cache.fuse;
  const docs = await buildDocs();
  const fuse = new Fuse(docs, FUSE_OPTS);
  cache = { at: Date.now(), fuse };
  return fuse;
}

export async function searchSite(query: string, limit = 12): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const fuse = await getFuse();
  return fuse.search(q, { limit }).map((r) => {
    const titleMatch = r.matches?.find((m) => m.key === "title");
    return {
      type: r.item.type,
      title: r.item.title,
      subtitle: r.item.subtitle,
      url: r.item.url,
      matches: titleMatch ? titleMatch.indices.map(([s, e]) => [s, e] as MatchRange) : undefined,
    };
  });
}
