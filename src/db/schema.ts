/**
 * Database schema (Drizzle ORM, Postgres).
 *
 * Design principle from the build spec: EVERYTHING user-visible is a
 * database-backed, editable record. There is no hard-coded copy on the public
 * site — pages read through the content data-access layer (src/lib/content),
 * which falls back to seed defaults when a row is absent so the site renders
 * even before the database is populated.
 */
import {
  pgTable,
  serial,
  text,
  varchar,
  timestamp,
  boolean,
  integer,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/* ----------------------------------------------------------------------------
 * Auth & audit
 * ------------------------------------------------------------------------- */

export const adminRole = pgEnum("admin_role", ["owner", "editor"]);

export const admins = pgTable("admins", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  role: adminRole("role").notNull().default("owner"),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").references(() => admins.id, { onDelete: "set null" }),
  adminEmail: varchar("admin_email", { length: 255 }),
  action: varchar("action", { length: 64 }).notNull(), // create | update | publish | delete | login | theme
  entity: varchar("entity", { length: 64 }).notNull(),
  entityId: varchar("entity_id", { length: 128 }),
  summary: text("summary"),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------------------------------------------------------
 * Settings (singleton-ish key/value: theme, SEO defaults, analytics, etc.)
 * ------------------------------------------------------------------------- */

export const settings = pgTable("settings", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------------------------------------------------------
 * Content blocks — generic editable strings/assets, addressed by a stable key
 * like "home.hero.headline". Supports a draft → publish workflow.
 * ------------------------------------------------------------------------- */

export const blockType = pgEnum("block_type", [
  "text",
  "richtext",
  "image",
  "video",
  "number",
  "url",
  "json",
]);

export const contentBlocks = pgTable(
  "content_blocks",
  {
    key: varchar("key", { length: 191 }).primaryKey(),
    page: varchar("page", { length: 64 }).notNull(), // grouping: home, about, contact, footer, global...
    section: varchar("section", { length: 64 }).notNull(), // hero, firmStrip, ...
    label: varchar("label", { length: 191 }).notNull(),
    type: blockType("type").notNull().default("text"),
    value: jsonb("value"), // published value
    draft: jsonb("draft"), // unpublished edits
    hasDraft: boolean("has_draft").notNull().default(false),
    sort: integer("sort").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pageIdx: index("content_blocks_page_idx").on(t.page) }),
);

/* Generic revision log — restore previous versions of any record. */
export const revisions = pgTable(
  "revisions",
  {
    id: serial("id").primaryKey(),
    entity: varchar("entity", { length: 64 }).notNull(),
    entityId: varchar("entity_id", { length: 191 }).notNull(),
    snapshot: jsonb("snapshot").notNull(),
    adminEmail: varchar("admin_email", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ entIdx: index("revisions_entity_idx").on(t.entity, t.entityId) }),
);

/* ----------------------------------------------------------------------------
 * Pages — SEO metadata per route (body content lives in content_blocks)
 * ------------------------------------------------------------------------- */

export const pages = pgTable("pages", {
  slug: varchar("slug", { length: 128 }).primaryKey(), // "", "about", "results"...
  title: varchar("title", { length: 191 }).notNull(),
  navLabel: varchar("nav_label", { length: 64 }),
  navOrder: integer("nav_order").notNull().default(0),
  showInNav: boolean("show_in_nav").notNull().default(true),
  seoTitle: varchar("seo_title", { length: 191 }),
  seoDescription: text("seo_description"),
  ogImage: text("og_image"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------------------------------------------------------
 * Practice areas (15) — grouped under three positioning headers
 * ------------------------------------------------------------------------- */

export const practiceGroup = pgEnum("practice_group", [
  "litigation",
  "defense",
  "counsel",
]);

export const practiceAreas = pgTable("practice_areas", {
  slug: varchar("slug", { length: 128 }).primaryKey(),
  title: varchar("title", { length: 191 }).notNull(),
  group: practiceGroup("group").notNull(),
  sort: integer("sort").notNull().default(0),
  tagline: text("tagline"),
  /** Ordered array of paragraph strings (firm-voice copy) */
  body: jsonb("body").$type<string[]>(),
  /** "How we approach it" trial-readiness block */
  approach: text("approach"),
  heroImage: text("hero_image"),
  /** Keyword/synonym map for the intake wizard fuzzy matcher */
  keywords: jsonb("keywords").$type<string[]>(),
  seoTitle: varchar("seo_title", { length: 191 }),
  seoDescription: text("seo_description"),
  visible: boolean("visible").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------------------------------------------------------
 * Case results / settlements / appellate record / jury trials
 * ------------------------------------------------------------------------- */

export const resultCategory = pgEnum("result_category", [
  "marquee",
  "appellate",
  "settlement",
  "jury",
  "other",
]);

export const caseResults = pgTable("case_results", {
  id: serial("id").primaryKey(),
  category: resultCategory("category").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  /** Big stat string for cards, e.g. "$11.2M" */
  stat: varchar("stat", { length: 64 }),
  statLabel: varchar("stat_label", { length: 191 }),
  year: varchar("year", { length: 16 }),
  summary: text("summary"),
  detail: text("detail"),
  cite: text("cite"),
  link: text("link"),
  practiceSlug: varchar("practice_slug", { length: 128 }),
  featuredHome: boolean("featured_home").notNull().default(false),
  visible: boolean("visible").notNull().default(true),
  sort: integer("sort").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------------------------------------------------------
 * Blog / Insights
 * ------------------------------------------------------------------------- */

export const postStatus = pgEnum("post_status", [
  "draft",
  "hidden",
  "scheduled",
  "published",
]);

export const blogPosts = pgTable(
  "blog_posts",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 191 }).notNull().unique(),
    title: varchar("title", { length: 255 }).notNull(),
    excerpt: text("excerpt"),
    body: text("body"), // rich HTML
    bannerImage: text("banner_image"),
    category: varchar("category", { length: 128 }), // practice-area slug
    tags: jsonb("tags").$type<string[]>(),
    author: varchar("author", { length: 191 }).notNull().default("T. Maxwell Smith"),
    isFirmNews: boolean("is_firm_news").notNull().default(false),
    status: postStatus("status").notNull().default("draft"),
    publishAt: timestamp("publish_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    seoTitle: varchar("seo_title", { length: 191 }),
    seoDescription: text("seo_description"),
    ogImage: text("og_image"),
    relatedPosts: jsonb("related_posts").$type<string[]>(),
    relatedPractices: jsonb("related_practices").$type<string[]>(),
    views: integer("views").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("blog_status_idx").on(t.status),
    categoryIdx: index("blog_category_idx").on(t.category),
  }),
);

/* ----------------------------------------------------------------------------
 * Glossary / index of terms
 * ------------------------------------------------------------------------- */

export const glossaryTerms = pgTable("glossary_terms", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 191 }).notNull().unique(),
  term: varchar("term", { length: 191 }).notNull(),
  definition: text("definition").notNull(),
  /** Law-school-flashcard-style hypothetical */
  hypothetical: text("hypothetical"),
  relatedPractices: jsonb("related_practices").$type<string[]>(),
  aliases: jsonb("aliases").$type<string[]>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------------------------------------------------------
 * Media library (Vercel Blob metadata)
 * ------------------------------------------------------------------------- */

export const mediaAssets = pgTable("media_assets", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  pathname: text("pathname").notNull(),
  kind: varchar("kind", { length: 16 }).notNull().default("image"), // image | video
  alt: text("alt"),
  caption: text("caption"),
  width: integer("width"),
  height: integer("height"),
  sizeBytes: integer("size_bytes"),
  folder: varchar("folder", { length: 128 }),
  tags: jsonb("tags").$type<string[]>(),
  /** Where it is used, for safe-delete warnings */
  usage: jsonb("usage").$type<string[]>(),
  /** Non-destructive editor: original blob URL kept when edits are saved */
  originalUrl: text("original_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------------------------------------------------------
 * Hero banner sequence (ordered video clips + stills with transitions)
 * ------------------------------------------------------------------------- */

export const bannerItems = pgTable("banner_items", {
  id: serial("id").primaryKey(),
  kind: varchar("kind", { length: 16 }).notNull().default("image"), // image | video
  url: text("url"),
  posterUrl: text("poster_url"),
  alt: text("alt"),
  durationMs: integer("duration_ms").notNull().default(6000),
  /** Ken Burns config for stills */
  kenBurns: jsonb("ken_burns").$type<{
    enabled: boolean;
    direction: string;
    intensity: number;
  }>(),
  sort: integer("sort").notNull().default(0),
  visible: boolean("visible").notNull().default(true),
});

/* ----------------------------------------------------------------------------
 * Testimonials (CRUD present even if empty at launch)
 * ------------------------------------------------------------------------- */

export const testimonials = pgTable("testimonials", {
  id: serial("id").primaryKey(),
  quote: text("quote").notNull(),
  attribution: varchar("attribution", { length: 191 }),
  context: varchar("context", { length: 191 }),
  visible: boolean("visible").notNull().default(true),
  sort: integer("sort").notNull().default(0),
});

/* ----------------------------------------------------------------------------
 * Intake submissions
 * ------------------------------------------------------------------------- */

export const intakeStatus = pgEnum("intake_status", [
  "new",
  "contacted",
  "scheduled",
  "declined",
]);

export const intakeSubmissions = pgTable(
  "intake_submissions",
  {
    id: serial("id").primaryKey(),
    branch: varchar("branch", { length: 64 }).notNull(),
    practiceSlug: varchar("practice_slug", { length: 128 }),
    /** Full ordered answer set */
    answers: jsonb("answers").$type<Record<string, unknown>>().notNull(),
    name: varchar("name", { length: 191 }),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 64 }),
    county: varchar("county", { length: 128 }),
    preferredContact: varchar("preferred_contact", { length: 32 }),
    opposingParty: text("opposing_party"),
    deadline: varchar("deadline", { length: 64 }),
    isUrgent: boolean("is_urgent").notNull().default(false),
    message: text("message"),
    status: intakeStatus("status").notNull().default("new"),
    referrer: text("referrer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("intake_status_idx").on(t.status),
    practiceIdx: index("intake_practice_idx").on(t.practiceSlug),
  }),
);

/* ----------------------------------------------------------------------------
 * Lightweight internal analytics (page views)
 * ------------------------------------------------------------------------- */

export const pageViews = pgTable(
  "page_views",
  {
    id: serial("id").primaryKey(),
    path: varchar("path", { length: 255 }).notNull(),
    referrer: text("referrer"),
    day: varchar("day", { length: 10 }).notNull(), // YYYY-MM-DD
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pathIdx: index("page_views_path_idx").on(t.path),
    dayIdx: index("page_views_day_idx").on(t.day),
  }),
);

export type Admin = typeof admins.$inferSelect;
export type ContentBlock = typeof contentBlocks.$inferSelect;
export type PracticeArea = typeof practiceAreas.$inferSelect;
export type CaseResult = typeof caseResults.$inferSelect;
export type BlogPost = typeof blogPosts.$inferSelect;
export type GlossaryTerm = typeof glossaryTerms.$inferSelect;
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type BannerItem = typeof bannerItems.$inferSelect;
export type Testimonial = typeof testimonials.$inferSelect;
export type IntakeSubmission = typeof intakeSubmissions.$inferSelect;
export type PageRecord = typeof pages.$inferSelect;
