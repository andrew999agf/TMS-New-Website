import "server-only";
import { db } from "@/db";
import {
  contentBlocks,
  practiceAreas as paTable,
  caseResults as crTable,
  blogPosts,
  glossaryTerms,
  bannerItems,
  settings,
  testimonials as testimonialsTable,
  teamMembers as teamTable,
  badges as badgesTable,
  intakeRecipients as intakeRecipientsTable,
  type CaseResult,
} from "@/db/schema";
import { and, asc, desc, eq, inArray, lte, or } from "drizzle-orm";
import { BLOCK_DEFAULTS } from "./defaults/blocks";
import { PRACTICE_AREAS, type PracticeAreaSeed } from "./defaults/practice-areas";
import { CASE_RESULTS, type CaseResultSeed } from "./defaults/results";
import { GLOSSARY_TERMS, type GlossaryTermSeed } from "./defaults/glossary";
import { BLOG_POSTS, type BlogPostSeed } from "./defaults/posts";
import {
  DEFAULT_COLOR_PALETTE_ID,
  DEFAULT_FONT_PALETTE_ID,
} from "@/lib/theme/palettes";
import type { ActiveTheme } from "@/lib/theme/css";

/**
 * Content data-access layer. Every getter tries the database first and falls
 * back to seed defaults if the DB is absent, unmigrated, or empty. All DB
 * access is wrapped so a configuration gap degrades gracefully to the seed
 * content instead of crashing a page render.
 */

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  if (!db) return fallback;
  try {
    return await fn();
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[content] DB read failed, using defaults:", (err as Error).message);
    }
    return fallback;
  }
}

/* ---- Content blocks ---- */

export async function getBlocks(page: string): Promise<Record<string, string>> {
  const defaults = Object.fromEntries(
    Object.entries(BLOCK_DEFAULTS).filter(([k]) => k.startsWith(page + ".")),
  );
  const rows = await safe(
    () => db!.select().from(contentBlocks).where(eq(contentBlocks.page, page)),
    [],
  );
  const map = { ...defaults };
  for (const r of rows) {
    const v = (r.value ?? null) as unknown;
    if (typeof v === "string") map[r.key] = v;
    else if (v != null) map[r.key] = String(v);
  }
  return map;
}

/** Convenience: fetch every block group needed across the layout (global + footer). */
export async function getGlobalBlocks(): Promise<Record<string, string>> {
  const [global, footer] = await Promise.all([getBlocks("global"), getBlocks("footer")]);
  return { ...global, ...footer };
}

/* ---- Theme ---- */

export async function getActiveTheme(): Promise<ActiveTheme> {
  const fallback: ActiveTheme = {
    colorPaletteId: DEFAULT_COLOR_PALETTE_ID,
    fontPaletteId: DEFAULT_FONT_PALETTE_ID,
  };
  const rows = await safe(
    () => db!.select().from(settings).where(eq(settings.key, "theme")),
    [],
  );
  if (rows.length && rows[0].value) {
    return { ...fallback, ...(rows[0].value as object) } as ActiveTheme;
  }
  return fallback;
}

export async function getSetting<T = unknown>(key: string, fallback: T): Promise<T> {
  const rows = await safe(
    () => db!.select().from(settings).where(eq(settings.key, key)),
    [],
  );
  if (rows.length) return rows[0].value as T;
  return fallback;
}

/* ---- Practice areas ---- */

export type PracticeAreaView = PracticeAreaSeed & { heroImage?: string | null; heroFocal?: string | null };

export async function getPracticeAreas(): Promise<PracticeAreaView[]> {
  const rows = await safe(
    () =>
      db!
        .select()
        .from(paTable)
        .where(eq(paTable.visible, true))
        .orderBy(asc(paTable.sort)),
    [],
  );
  if (rows.length) {
    return rows.map((r) => ({
      slug: r.slug,
      title: r.title,
      group: r.group as PracticeAreaSeed["group"],
      sort: r.sort,
      tagline: r.tagline ?? "",
      body: (r.body as string[]) ?? [],
      approach: r.approach ?? "",
      keywords: (r.keywords as string[]) ?? [],
      seoTitle: r.seoTitle ?? r.title,
      seoDescription: r.seoDescription ?? "",
      heroImage: r.heroImage,
      heroFocal: r.heroFocal ?? "center",
    }));
  }
  return PRACTICE_AREAS;
}

export async function getPracticeArea(slug: string): Promise<PracticeAreaView | null> {
  const all = await getPracticeAreas();
  return all.find((p) => p.slug === slug) ?? null;
}

/* ---- Case results ---- */

function normalizeResult(r: CaseResult): CaseResultSeed {
  return {
    category: r.category as CaseResultSeed["category"],
    title: r.title,
    stat: r.stat ?? undefined,
    statLabel: r.statLabel ?? undefined,
    year: r.year ?? undefined,
    summary: r.summary ?? undefined,
    detail: r.detail ?? undefined,
    cite: r.cite ?? undefined,
    link: r.link ?? undefined,
    practiceSlug: r.practiceSlug ?? undefined,
    featuredHome: r.featuredHome,
    sort: r.sort,
  };
}

export async function getResults(): Promise<CaseResultSeed[]> {
  const rows = await safe(
    () =>
      db!
        .select()
        .from(crTable)
        .where(eq(crTable.visible, true))
        .orderBy(asc(crTable.sort)),
    [],
  );
  if (rows.length) return rows.map(normalizeResult);
  return CASE_RESULTS;
}

export async function getFeaturedResults(limit = 6): Promise<CaseResultSeed[]> {
  const all = await getResults();
  const featured = all.filter((r) => r.featuredHome || r.category === "marquee");
  const rest = all.filter((r) => !featured.includes(r) && (r.stat || r.summary));
  return [...featured, ...rest].slice(0, limit);
}

export async function getResultsForPractice(slug: string): Promise<CaseResultSeed[]> {
  const all = await getResults();
  return all.filter((r) => r.practiceSlug === slug);
}

/* ---- Blog ---- */

export type PostView = BlogPostSeed & { publishedAtDate?: Date };

function postFromRow(r: typeof blogPosts.$inferSelect): PostView {
  return {
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt ?? "",
    body: r.body ?? "",
    bannerImage: r.bannerImage ?? undefined,
    bannerFocal: r.bannerFocal ?? "center",
    category: r.category ?? undefined,
    tags: (r.tags as string[]) ?? [],
    author: r.author,
    isFirmNews: r.isFirmNews,
    status: r.status as BlogPostSeed["status"],
    publishAt: r.publishAt ? r.publishAt.toISOString() : undefined,
    seoTitle: r.seoTitle ?? undefined,
    seoDescription: r.seoDescription ?? undefined,
    relatedPractices: (r.relatedPractices as string[]) ?? [],
    relatedPosts: (r.relatedPosts as string[]) ?? [],
    publishedAtDate: r.publishedAt ?? r.publishAt ?? undefined,
  };
}

/** Public list: only posts that should currently be visible to the world. */
export async function getPublishedPosts(): Promise<PostView[]> {
  const now = new Date();
  const rows = await safe(
    () =>
      db!
        .select()
        .from(blogPosts)
        .where(
          or(
            eq(blogPosts.status, "published"),
            and(eq(blogPosts.status, "scheduled"), lte(blogPosts.publishAt, now)),
          ),
        )
        .orderBy(desc(blogPosts.publishAt)),
    [],
  );
  if (rows.length) return rows.map(postFromRow);

  // Fallback to seed: published, or scheduled whose time has arrived.
  return BLOG_POSTS.filter((p) => {
    if (p.status === "published") return true;
    if (p.status === "scheduled" && p.publishAt) return new Date(p.publishAt) <= now;
    return false;
  }).sort((a, b) => (b.publishAt ?? "").localeCompare(a.publishAt ?? ""));
}

export async function getPost(slug: string): Promise<PostView | null> {
  const rows = await safe(
    () => db!.select().from(blogPosts).where(eq(blogPosts.slug, slug)).limit(1),
    [],
  );
  if (rows.length) return postFromRow(rows[0]);
  return BLOG_POSTS.find((p) => p.slug === slug) ?? null;
}

export async function getPostsForPractice(slug: string, limit = 3): Promise<PostView[]> {
  const all = await getPublishedPosts();
  return all
    .filter((p) => p.category === slug || (p.relatedPractices ?? []).includes(slug))
    .slice(0, limit);
}

/* ---- Glossary ---- */

export async function getGlossaryTerms(): Promise<GlossaryTermSeed[]> {
  const rows = await safe(() => db!.select().from(glossaryTerms).orderBy(asc(glossaryTerms.term)), []);
  if (rows.length) {
    return rows.map((r) => ({
      slug: r.slug,
      term: r.term,
      definition: r.definition,
      hypothetical: r.hypothetical ?? "",
      relatedPractices: (r.relatedPractices as string[]) ?? [],
      aliases: (r.aliases as string[]) ?? [],
    }));
  }
  return [...GLOSSARY_TERMS].sort((a, b) => a.term.localeCompare(b.term));
}

export async function getGlossaryTerm(slug: string): Promise<GlossaryTermSeed | null> {
  const all = await getGlossaryTerms();
  return all.find((t) => t.slug === slug) ?? null;
}

/* ---- Banner ---- */

export async function getBannerItems() {
  const rows = await safe(
    () =>
      db!
        .select()
        .from(bannerItems)
        .where(eq(bannerItems.visible, true))
        .orderBy(asc(bannerItems.sort)),
    [],
  );
  return rows;
}

/* ---- Testimonials ---- */

export type TestimonialView = {
  id: number;
  quote: string;
  attribution: string | null;
  context: string | null;
  visible: boolean;
  sort: number;
};

export async function getTestimonials(visibleOnly = true): Promise<TestimonialView[]> {
  const rows = await safe(
    () => db!.select().from(testimonialsTable).orderBy(asc(testimonialsTable.sort)),
    [],
  );
  return rows.filter((r) => (visibleOnly ? r.visible : true));
}

/* ---- Intake notification recipients ---- */

export type IntakeRecipientView = {
  id: number;
  name: string;
  email: string;
  branches: string[];
  active: boolean;
  sort: number;
};

export async function getIntakeRecipients(activeOnly = false): Promise<IntakeRecipientView[]> {
  const rows = await safe(
    () => db!.select().from(intakeRecipientsTable).orderBy(asc(intakeRecipientsTable.sort)),
    [],
  );
  return rows
    .map((r) => ({
      id: r.id,
      name: r.name ?? "",
      email: r.email,
      branches: (r.branches as string[]) ?? [],
      active: r.active,
      sort: r.sort,
    }))
    .filter((r) => (activeOnly ? r.active : true));
}

/** Resolve which addresses should be emailed for a given intake branch. */
export async function recipientsForBranch(branch: string): Promise<string[]> {
  const all = await getIntakeRecipients(true);
  const matched = all.filter((r) => r.branches.length === 0 || r.branches.includes(branch));
  return [...new Set(matched.map((r) => r.email.trim()).filter(Boolean))];
}

/* ---- Team ---- */

import { TEAM, type TeamMemberSeed } from "./defaults/team";

export async function getTeam(visibleOnly = true): Promise<TeamMemberSeed[]> {
  const rows = await safe(
    () => db!.select().from(teamTable).orderBy(asc(teamTable.sort)),
    [],
  );
  if (rows.length) {
    return rows
      .filter((r) => (visibleOnly ? r.visible : true))
      .map((r) => ({
        slug: r.slug,
        name: r.name,
        role: r.role,
        isAttorney: r.isAttorney,
        isLead: r.isLead,
        teamLabel: r.teamLabel,
        office: r.office ?? undefined,
        email: r.email ?? undefined,
        directPhone: r.directPhone ?? undefined,
        barNumber: r.barNumber ?? undefined,
        languages: r.languages ?? undefined,
        photo: r.photo ?? undefined,
        bioProfessional: r.bioProfessional ?? undefined,
        bioBeyond: r.bioBeyond ?? undefined,
        bioPersonal: r.bioPersonal ?? undefined,
        experience: r.experience ?? undefined,
        education: r.education ?? undefined,
        representativeMatters: r.representativeMatters ?? undefined,
        services: r.services ?? undefined,
        practiceAreas: r.practiceAreas ?? undefined,
        memberships: r.memberships ?? undefined,
        barAdmissions: r.barAdmissions ?? undefined,
        courtAdmissions: r.courtAdmissions ?? undefined,
        sort: r.sort,
      }));
  }
  return TEAM;
}

export async function getTeamMember(slug: string): Promise<TeamMemberSeed | null> {
  const all = await getTeam(false);
  return all.find((m) => m.slug === slug) ?? null;
}

export async function getLeadMember(): Promise<TeamMemberSeed | null> {
  const all = await getTeam();
  return all.find((m) => m.isLead) ?? all.find((m) => m.isAttorney) ?? all[0] ?? null;
}

/* ---- Badges ---- */

import { BADGES, type BadgeSeed } from "./defaults/badges";

export type BadgeView = { id: number; name: string; logo: string | null; url: string | null; sort: number; visible: boolean };

export async function getBadges(visibleOnly = true): Promise<BadgeView[]> {
  const rows = await safe(() => db!.select().from(badgesTable).orderBy(asc(badgesTable.sort)), []);
  if (rows.length) {
    return rows
      .filter((r) => (visibleOnly ? r.visible : true))
      .map((r) => ({ id: r.id, name: r.name, logo: r.logo, url: r.url, sort: r.sort, visible: r.visible }));
  }
  return BADGES.map((b: BadgeSeed, i) => ({
    id: -(i + 1),
    name: b.name,
    logo: b.logo ?? null,
    url: b.url ?? null,
    sort: b.sort,
    visible: true,
  }));
}

/* ---- Admin: editable block metadata (merges defaults + DB values) ---- */

import { CONTENT_BLOCKS } from "./defaults/blocks";

export type EditableBlock = {
  key: string;
  page: string;
  section: string;
  label: string;
  type: string;
  value: string;
};

export async function getEditableBlocks(page: string): Promise<EditableBlock[]> {
  const defaults = CONTENT_BLOCKS.filter((b) => b.page === page);
  const rows = await safe(
    () => db!.select().from(contentBlocks).where(eq(contentBlocks.page, page)),
    [],
  );
  const dbMap = new Map(rows.map((r) => [r.key, r]));
  return defaults.map((d) => {
    const row = dbMap.get(d.key);
    const v = row?.value;
    return {
      key: d.key,
      page: d.page,
      section: d.section,
      label: d.label,
      type: d.type,
      value: typeof v === "string" ? v : v != null ? String(v) : d.value,
    };
  });
}

export const EDITABLE_PAGES = [
  { id: "global", label: "Global / Brand" },
  { id: "home", label: "Home" },
  { id: "about", label: "Our Team" },
  { id: "practiceareas", label: "Practice Areas (index)" },
  { id: "results", label: "Results" },
  { id: "blog", label: "Insights / Blog" },
  { id: "glossary", label: "Glossary" },
  { id: "contact", label: "Contact" },
  { id: "consultation", label: "Consultation / Intake" },
  { id: "payment", label: "Payment" },
  { id: "footer", label: "Footer & Disclaimers" },
];

export { inArray }; // re-export for callers that filter by slug sets
