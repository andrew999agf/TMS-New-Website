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
  index,
  real,
} from "drizzle-orm/pg-core";

/* ----------------------------------------------------------------------------
 * Auth & audit
 * ------------------------------------------------------------------------- */

export const adminRole = pgEnum("admin_role", ["owner", "editor", "timekeeper"]);

export const admins = pgTable("admins", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  role: adminRole("role").notNull().default("owner"),
  /** Extra admin sections this account may access beyond its role's defaults. */
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  resetToken: varchar("reset_token", { length: 128 }),
  resetExpires: timestamp("reset_expires", { withTimezone: true }),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  /** Hourly staff see the Clock In / Clock Out button in the admin portal. */
  hourly: boolean("hourly").notNull().default(false),
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
  "focal",
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

/**
 * Legacy. The practice-area grouping started as a three-value Postgres enum,
 * which meant every new grouping needed a type migration before the content
 * could be refreshed. The column is plain text now and the display groups are
 * defined in code (PRACTICE_GROUPS), so re-grouping the site is a content
 * change rather than a schema change. The type is left declared because it
 * still exists in provisioned databases.
 */
export const practiceGroup = pgEnum("practice_group", [
  "litigation",
  "defense",
  "counsel",
]);

export const practiceAreas = pgTable("practice_areas", {
  slug: varchar("slug", { length: 128 }).primaryKey(),
  title: varchar("title", { length: 191 }).notNull(),
  /** Display group id — see PRACTICE_GROUPS in content/defaults/practice-areas. */
  group: varchar("group", { length: 32 }).notNull(),
  sort: integer("sort").notNull().default(0),
  tagline: text("tagline"),
  /** Ordered array of paragraph strings (firm-voice copy) */
  body: jsonb("body").$type<string[]>(),
  /** "How we approach it" trial-readiness block */
  approach: text("approach"),
  heroImage: text("hero_image"),
  /** Banner crop position: center | top | bottom | left | right */
  heroFocal: varchar("hero_focal", { length: 16 }).notNull().default("center"),
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
    /** Banner crop position: center | top | bottom | left | right */
    bannerFocal: varchar("banner_focal", { length: 16 }).notNull().default("center"),
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
  /** Focal point / object-position: center | top | bottom | left | right */
  focal: varchar("focal", { length: 16 }).notNull().default("center"),
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
 * Intake notification recipients (who gets emailed when a consultation form is
 * submitted). `branches` scopes a recipient to specific intake types; an empty
 * array means they receive every submission.
 * ------------------------------------------------------------------------- */

export const intakeRecipients = pgTable("intake_recipients", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 191 }).notNull().default(""),
  email: varchar("email", { length: 255 }).notNull(),
  branches: jsonb("branches").$type<string[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  sort: integer("sort").notNull().default(0),
});

/* ----------------------------------------------------------------------------
 * Time tracker (billable hours). Entries are owned by the login that created
 * them (per-user "active" board); exporting to CSV can archive them so they
 * are never billed twice. Activity users, categories, and matters are shared
 * firm-wide and admin-managed.
 * ------------------------------------------------------------------------- */

export const timeEntryStatus = pgEnum("time_entry_status", ["active", "archived"]);

export const timeEntries = pgTable("time_entries", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull(),
  matter: text("matter").notNull().default(""),
  entryDate: varchar("entry_date", { length: 10 }).notNull(), // YYYY-MM-DD
  activityDescription: text("activity_description").notNull().default(""),
  note: text("note").notNull().default(""),
  price: real("price").notNull().default(0),
  quantity: real("quantity").notNull().default(0),
  activityUserName: text("activity_user_name").notNull().default(""),
  nonBillable: boolean("non_billable").notNull().default(false),
  status: timeEntryStatus("status").notNull().default("active"),
  exportedAt: timestamp("exported_at", { withTimezone: true }),
  exportedBy: varchar("exported_by", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const timeActivityUsers = pgTable("time_activity_users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  rate: real("rate").notNull().default(145),
  /** Where this person's monthly billing report is sent (they may have no login). */
  email: varchar("email", { length: 255 }).notNull().default(""),
  sort: integer("sort").notNull().default(0),
});

export const timeCategories = pgTable("time_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 191 }).notNull(),
  sort: integer("sort").notNull().default(0),
});

export const timeMatters = pgTable("time_matters", {
  id: serial("id").primaryKey(),
  displayNumber: text("display_number").notNull(),
  description: text("description").notNull().default(""),
  sort: integer("sort").notNull().default(0),
});

/** Hourly time-clock punches (distinct from billable time entries): one row
 *  per shift; clock_out stays null while the person is on the clock. */
export const timeClockPunches = pgTable("time_clock_punches", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull(),
  clockIn: timestamp("clock_in", { withTimezone: true }).notNull().defaultNow(),
  clockOut: timestamp("clock_out", { withTimezone: true }),
  /** Clock-out was set automatically at midnight (forgotten punch) — needs review. */
  autoClosed: boolean("auto_closed").notNull().default(false),
  /** Punch was auto-started at midnight to continue a shift open across midnight. */
  autoOpen: boolean("auto_open").notNull().default(false),
});

/* ----------------------------------------------------------------------------
 * Secure share folders — case documents shared with specific people (co-counsel,
 * opposing counsel, clients, experts) by email invitation only. Each recipient
 * gets an unguessable token link; access is per-recipient and revocable.
 * ------------------------------------------------------------------------- */

export const shareFolders = pgTable(
  "share_folders",
  {
    id: serial("id").primaryKey(),
    caseNumber: varchar("case_number", { length: 191 }).notNull().default(""),
    name: varchar("name", { length: 191 }).notNull(), // client name (the folder's display name)
    matter: text("matter").notNull().default(""), // Clio/Time-Tracker matter reference
    court: varchar("court", { length: 191 }).notNull().default(""), // court / location
    type: varchar("type", { length: 32 }).notNull(), // SHARE_TYPES key (discovery, client, expert, …)
    notes: text("notes"),
    /** Optional viewer-facing workspace: causes of action, notes, to-do tasks. */
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    /** Require the recipient to authenticate (password or one-time code) before viewing. */
    requireAuth: boolean("require_auth").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    /** Live upload progress so anyone viewing the folder sees "N of M uploading". */
    uploadTotal: integer("upload_total").notNull().default(0),
    uploadDone: integer("upload_done").notNull().default(0),
    uploadAt: timestamp("upload_at", { withTimezone: true }),
    /** Armed when the first new file lands; the digest cron sends ~12h later. */
    notifyDueAt: timestamp("notify_due_at", { withTimezone: true }),
    createdBy: varchar("created_by", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ archivedIdx: index("share_folders_archived_idx").on(t.archived) }),
);

export const shareFiles = pgTable(
  "share_files",
  {
    id: serial("id").primaryKey(),
    folderId: integer("folder_id").notNull(),
    url: text("url").notNull(),
    pathname: text("pathname").notNull(),
    filename: varchar("filename", { length: 1024 }).notNull(),
    contentType: varchar("content_type", { length: 128 }),
    sizeBytes: integer("size_bytes"),
    uploadedBy: varchar("uploaded_by", { length: 255 }),
    /** False until included in a "new documents" digest to recipients. */
    notified: boolean("notified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ folderIdx: index("share_files_folder_idx").on(t.folderId) }),
);

export const shareRecipients = pgTable(
  "share_recipients",
  {
    id: serial("id").primaryKey(),
    folderId: integer("folder_id").notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 191 }).notNull().default(""),
    token: varchar("token", { length: 64 }).notNull().unique(),
    /** view | download | upload | manage — what this person can do in the folder. */
    permission: varchar("permission", { length: 16 }).notNull().default("download"),
    /** Relationship on this matter: client | opposing | co-counsel | expert | witness | prose | consultant | other. */
    kind: varchar("kind", { length: 24 }).notNull().default(""),
    /** This specific recipient must authenticate before viewing (set by policy at send time). */
    requireAuth: boolean("require_auth").notNull().default(false),
    invitedBy: varchar("invited_by", { length: 255 }),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    /** The link stops working after this instant (per-folder-type lifetime). */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastAccessAt: timestamp("last_access_at", { withTimezone: true }),
    revoked: boolean("revoked").notNull().default(false),
  },
  (t) => ({ folderIdx: index("share_recipients_folder_idx").on(t.folderId) }),
);

/** Explicitly-created (possibly empty) folders inside a share, so recipients and
 *  staff can organize documents Dropbox-style even before files land in them. */
export const shareDirs = pgTable(
  "share_dirs",
  {
    id: serial("id").primaryKey(),
    folderId: integer("folder_id").notNull(),
    path: varchar("path", { length: 1024 }).notNull(), // e.g. "Correspondence/2026"
    createdBy: varchar("created_by", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ folderIdx: index("share_dirs_folder_idx").on(t.folderId) }),
);

export const shareAccessLog = pgTable("share_access_log", {
  id: serial("id").primaryKey(),
  folderId: integer("folder_id"),
  recipientId: integer("recipient_id"),
  action: varchar("action", { length: 16 }).notNull(), // view | download
  fileId: integer("file_id"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

/** External portal users (recipients who can log in). One row per person, keyed
 *  by email — identity that persists across every folder shared with them. Their
 *  per-matter role and permission live on the share_recipients grant. */
export const portalUsers = pgTable("portal_users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 191 }).notNull().default(""),
  /** Their usual type (for the one-list, filter-by-type directory). */
  kind: varchar("kind", { length: 24 }).notNull().default(""),
  passwordHash: text("password_hash"),
  verified: boolean("verified").notNull().default(false),
  otpHash: varchar("otp_hash", { length: 128 }),
  otpExpires: timestamp("otp_expires", { withTimezone: true }),
  otpAttempts: integer("otp_attempts").notNull().default(0),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Generated management reports (to-do "tickler" and uploaded-documents digests)
 *  for the share-folder system. The PDF lives in Blob; a small summary is kept
 *  inline for the list view. Auto-archived after six months. */
export const shareReports = pgTable("share_reports", {
  id: serial("id").primaryKey(),
  kind: varchar("kind", { length: 24 }).notNull(), // "todos" | "documents"
  title: text("title").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }),
  periodEnd: timestamp("period_end", { withTimezone: true }),
  pdfUrl: text("pdf_url"),
  pdfPathname: text("pdf_pathname"),
  summary: jsonb("summary"),
  createdBy: varchar("created_by", { length: 255 }),
  archived: boolean("archived").notNull().default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ShareFolder = typeof shareFolders.$inferSelect;
export type ShareFile = typeof shareFiles.$inferSelect;
export type ShareRecipient = typeof shareRecipients.$inferSelect;
export type ShareReport = typeof shareReports.$inferSelect;
export type PortalUser = typeof portalUsers.$inferSelect;

/* ----------------------------------------------------------------------------
 * Intake submissions
 * ------------------------------------------------------------------------- */

export const intakeStatus = pgEnum("intake_status", [
  "new",
  "contacted",
  "scheduled",
  "declined",
  "referred-out",
  "client-declined",
]);

export const intakeSubmissions = pgTable(
  "intake_submissions",
  {
    /** Outcome of the notification email: sent / failed:… */
    emailStatus: varchar("email_status", { length: 255 }),
    /** True while a comprehensive estate questionnaire is saved but unfinished. */
    incomplete: boolean("incomplete").notNull().default(false),
    /** "How did you hear about us?" — the canonical option chosen (for lead-source analytics). */
    referralSource: varchar("referral_source", { length: 191 }),
    /** Browser resume token for saved-progress estate questionnaires. */
    resumeToken: varchar("resume_token", { length: 64 }),
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
    archived: boolean("archived").notNull().default(false),
    /** Referral details (shown inline in the Status column when referred out) */
    referredTo: varchar("referred_to", { length: 191 }),
    feeExpected: boolean("fee_expected").notNull().default(false),
    feeAmount: varchar("fee_amount", { length: 64 }),
    referrer: text("referrer"),
    /** Pending status/archive change awaiting the batched digest email (null = none). */
    notifyChange: varchar("notify_change", { length: 191 }),
    notifyChangeAt: timestamp("notify_change_at", { withTimezone: true }),
    notifyChangeBy: varchar("notify_change_by", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("intake_status_idx").on(t.status),
    practiceIdx: index("intake_practice_idx").on(t.practiceSlug),
  }),
);

/** A stable of attorneys cases can be referred to — used for the referral
 *  autocomplete and included in "turn-back" emails to prospective clients. */
export const referralAttorneys = pgTable("referral_attorneys", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 191 }).notNull().unique(),
  firm: varchar("firm", { length: 191 }).notNull().default(""),
  address: text("address").notNull().default(""),
  phone: varchar("phone", { length: 64 }).notNull().default(""),
  email: varchar("email", { length: 255 }).notNull().default(""),
  website: varchar("website", { length: 255 }).notNull().default(""),
  practiceArea: varchar("practice_area", { length: 191 }).notNull().default(""),
  sort: integer("sort").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ReferralAttorney = typeof referralAttorneys.$inferSelect;

/* ----------------------------------------------------------------------------
 * Team members (attorneys + staff)
 * ------------------------------------------------------------------------- */

export type TeamExperience = {
  title: string;
  org: string;
  dates?: string;
  location?: string;
  bullets?: string[];
};
export type TeamEducation = {
  degree: string;
  school: string;
  year?: string;
  location?: string;
  note?: string;
};
export type TeamMatter = {
  title: string;
  cite?: string;
  court?: string;
  description?: string;
};

export const teamMembers = pgTable(
  "team_members",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 128 }).notNull().unique(),
    name: varchar("name", { length: 191 }).notNull(),
    role: varchar("role", { length: 191 }).notNull(),
    isAttorney: boolean("is_attorney").notNull().default(false),
    /** Lead member (Max) is featured at the top of the team page. */
    isLead: boolean("is_lead").notNull().default(false),
    teamLabel: varchar("team_label", { length: 64 }).notNull().default("Texas Team"),
    office: varchar("office", { length: 128 }),
    email: varchar("email", { length: 255 }),
    directPhone: varchar("direct_phone", { length: 64 }),
    barNumber: varchar("bar_number", { length: 64 }),
    languages: varchar("languages", { length: 191 }),
    photo: text("photo"),
    bioProfessional: text("bio_professional"),
    bioBeyond: text("bio_beyond"),
    bioPersonal: text("bio_personal"),
    experience: jsonb("experience").$type<TeamExperience[]>(),
    education: jsonb("education").$type<TeamEducation[]>(),
    representativeMatters: jsonb("representative_matters").$type<TeamMatter[]>(),
    services: jsonb("services").$type<string[]>(),
    practiceAreas: jsonb("practice_areas").$type<string[]>(),
    memberships: jsonb("memberships").$type<string[]>(),
    barAdmissions: jsonb("bar_admissions").$type<string[]>(),
    courtAdmissions: jsonb("court_admissions").$type<string[]>(),
    visible: boolean("visible").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ sortIdx: index("team_sort_idx").on(t.sort) }),
);

export type TeamMember = typeof teamMembers.$inferSelect;

/* ----------------------------------------------------------------------------
 * Badges — organizations, bar associations, and awards shown below the hero
 * ------------------------------------------------------------------------- */

export const badges = pgTable(
  "badges",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 191 }).notNull(),
    logo: text("logo"),
    url: text("url"),
    visible: boolean("visible").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ sortIdx: index("badges_sort_idx").on(t.sort) }),
);

export type Badge = typeof badges.$inferSelect;

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

/**
 * Voice-entry diagnostics (Time Tracker 3.0). One row per voice attempt so we
 * can SEE what happens on real staff devices instead of guessing. Deliberately
 * carries NO audio, NO transcript, NO email, NO IP — only device capability and
 * which pipeline stage succeeded/failed.
 */
export const voiceDiagnostics = pgTable(
  "voice_diagnostics",
  {
    id: serial("id").primaryKey(),
    day: varchar("day", { length: 10 }).notNull(), // YYYY-MM-DD
    platformLabel: varchar("platform_label", { length: 128 }), // "Chrome on Android"
    os: varchar("os", { length: 16 }),
    browser: varchar("browser", { length: 16 }),
    engineGroup: varchar("engine_group", { length: 16 }), // chromium | safari | none
    capture: varchar("capture", { length: 24 }), // audioworklet | scriptprocessor | none
    backend: varchar("backend", { length: 16 }), // webgpu | wasm | none
    permission: varchar("permission", { length: 16 }), // granted|prompt|denied|unknown|unsupported
    secure: boolean("secure"),
    standalone: boolean("standalone"),
    stage: varchar("stage", { length: 24 }), // capability|permission|capture|vad|stt|tts|done
    success: boolean("success").notNull().default(false),
    reason: varchar("reason", { length: 32 }), // failure reason enum
    message: varchar("message", { length: 256 }), // raw error, truncated
    sampleRate: integer("sample_rate"),
    captureMs: integer("capture_ms"),
    transcribeMs: integer("transcribe_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dayIdx: index("voice_diag_day_idx").on(t.day),
    browserIdx: index("voice_diag_browser_idx").on(t.browser),
  }),
);

/* ------------------------- Pre-trial deadlines ---------------------------- *
 * A case heading to trial, plus its checklist of pre-trial deadlines. Dates are
 * stored as plain YYYY-MM-DD strings (not timestamps) because these are court
 * calendar dates — they must not shift with a timezone.
 * -------------------------------------------------------------------------- */
export const trialCases = pgTable(
  "trial_cases",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 191 }).notNull(),
    /** Links the case to a Time Tracker matter (display number). */
    matter: text("matter").notNull().default(""),
    causeNumber: varchar("cause_number", { length: 128 }).notNull().default(""),
    court: varchar("court", { length: 191 }).notNull().default(""),
    /** YYYY-MM-DD. Drives the "days out" urgency and the setup template. */
    trialDate: varchar("trial_date", { length: 10 }),
    /** YYYY-MM-DD. The pretrial conference / 166 & 248 setting. */
    pretrialDate: varchar("pretrial_date", { length: 10 }),
    notes: text("notes").notNull().default(""),
    archived: boolean("archived").notNull().default(false),
    createdBy: varchar("created_by", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ archivedIdx: index("trial_cases_archived_idx").on(t.archived) }),
);

export const trialDeadlines = pgTable(
  "trial_deadlines",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id").notNull(),
    /** Null for a top-level task; set to the parent's id for a sub-task. */
    parentId: integer("parent_id"),
    /** Team member responsible — a Time Tracker activity user's name. */
    assignee: varchar("assignee", { length: 191 }).notNull().default(""),
    title: varchar("title", { length: 255 }).notNull(),
    /** YYYY-MM-DD, or null for an item with no date set yet. */
    dueDate: varchar("due_date", { length: 10 }),
    done: boolean("done").notNull().default(false),
    doneAt: timestamp("done_at", { withTimezone: true }),
    doneBy: varchar("done_by", { length: 255 }),
    notes: text("notes").notNull().default(""),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ caseIdx: index("trial_deadlines_case_idx").on(t.caseId) }),
);

/** People who may testify. Side keeps plaintiff/defense lists separate. */
export const trialWitnesses = pgTable(
  "trial_witnesses",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id").notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    side: varchar("side", { length: 16 }).notNull().default("plaintiff"),
    role: varchar("role", { length: 191 }).notNull().default(""),
    phone: varchar("phone", { length: 64 }).notNull().default(""),
    email: varchar("email", { length: 255 }).notNull().default(""),
    /** confirmed | likely | unavailable | unknown */
    available: varchar("available", { length: 16 }).notNull().default("unknown"),
    /** in-person | zoom | deposition */
    appearance: varchar("appearance", { length: 16 }).notNull().default("in-person"),
    notes: text("notes").notNull().default(""),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ caseIdx: index("trial_witnesses_case_idx").on(t.caseId) }),
);

/** The exhibit list — plaintiff's, defendant's, or joint — with optional upload. */
export const trialExhibits = pgTable(
  "trial_exhibits",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id").notNull(),
    side: varchar("side", { length: 16 }).notNull().default("plaintiff"),
    /** Exhibit number/letter as it will be offered, e.g. "P-12". */
    number: varchar("number", { length: 32 }).notNull().default(""),
    title: varchar("title", { length: 255 }).notNull(),
    bates: varchar("bates", { length: 128 }).notNull().default(""),
    description: text("description").notNull().default(""),
    /** listed | objected | admitted | excluded */
    status: varchar("status", { length: 16 }).notNull().default("listed"),
    /** Witness ids this exhibit is expected to come in through (may be several). */
    witnessIds: jsonb("witness_ids").notNull().default([]),
    /** Predicate shortcuts: business-records-affidavit, certified-record, stipulated, self-authenticating. */
    foundation: jsonb("foundation").notNull().default([]),
    url: text("url"),
    pathname: text("pathname"),
    contentType: varchar("content_type", { length: 128 }),
    sizeBytes: integer("size_bytes"),
    notes: text("notes").notNull().default(""),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ caseIdx: index("trial_exhibits_case_idx").on(t.caseId) }),
);

/** A cause of action / count being tried. */
export const trialClaims = pgTable(
  "trial_claims",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    /** Whose claim it is — plaintiff | defendant. */
    party: varchar("party", { length: 16 }).notNull().default("plaintiff"),
    isLead: boolean("is_lead").notNull().default(false),
    notes: text("notes").notNull().default(""),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ caseIdx: index("trial_claims_case_idx").on(t.caseId) }),
);

/** One element the claim must prove. */
export const trialElements = pgTable(
  "trial_elements",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id").notNull(),
    claimId: integer("claim_id").notNull(),
    text: varchar("text", { length: 500 }).notNull(),
    notes: text("notes").notNull().default(""),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ claimIdx: index("trial_elements_claim_idx").on(t.claimId) }),
);

/**
 * How an element gets proved: by an exhibit or by a witness's testimony. The
 * exhibit/witness link is optional so a citation can be recorded before the
 * exhibit is numbered or the witness is added to the list.
 */
export const trialProofs = pgTable(
  "trial_proofs",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id").notNull(),
    elementId: integer("element_id").notNull(),
    /** exhibit | testimony */
    kind: varchar("kind", { length: 16 }).notNull().default("exhibit"),
    exhibitId: integer("exhibit_id"),
    witnessId: integer("witness_id"),
    /** e.g. "Morgan Dep. p. 18, ll. 4-19 (RES_000330)" */
    citation: varchar("citation", { length: 500 }).notNull().default(""),
    summary: text("summary").notNull().default(""),
    /** True for expected trial testimony with no depo transcript behind it yet. */
    anticipated: boolean("anticipated").notNull().default(false),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ elementIdx: index("trial_proofs_element_idx").on(t.elementId) }),
);

/** Deposition and statement transcripts, optionally tied to a witness. */
export const trialTranscripts = pgTable(
  "trial_transcripts",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id").notNull(),
    /** deposition | statement | hearing | other */
    kind: varchar("kind", { length: 16 }).notNull().default("deposition"),
    title: varchar("title", { length: 255 }).notNull(),
    witnessId: integer("witness_id"),
    /** YYYY-MM-DD */
    takenOn: varchar("taken_on", { length: 10 }),
    url: text("url"),
    pathname: text("pathname"),
    contentType: varchar("content_type", { length: 128 }),
    sizeBytes: integer("size_bytes"),
    notes: text("notes").notNull().default(""),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ caseIdx: index("trial_transcripts_case_idx").on(t.caseId) }),
);

/**
 * Trial/Hearing Exhibit Reviewer — a standalone review binder, independent of
 * the pre-trial case tables above. Each "set" is one case's exhibits; the docs
 * are the individual PDFs, ordered by exhibit number and split by side.
 */
export const exhibitSets = pgTable(
  "exhibit_sets",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 191 }).notNull(),
    /** Clio / Time Tracker matter (display number) — the case coding. */
    matter: text("matter").notNull().default(""),
    causeNumber: varchar("cause_number", { length: 128 }).notNull().default(""),
    court: varchar("court", { length: 191 }).notNull().default(""),
    notes: text("notes").notNull().default(""),
    /** Unguessable token for public share links (the link tree). Minted the
     *  first time sharing is turned on; stable thereafter so old links keep
     *  working when sharing is toggled off and back on. */
    publicToken: varchar("public_token", { length: 64 }),
    /** Access mode: off (firm only) | restricted (named people, email code) |
     *  public (anyone with the link). Default off — nothing is shared until asked. */
    access: varchar("access", { length: 16 }).notNull().default("off"),
    /** Kept in step with access ("public") so the open public routes, which key
     *  on this flag, keep working unchanged. */
    isPublic: boolean("is_public").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    createdBy: varchar("created_by", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ archivedIdx: index("exhibit_sets_archived_idx").on(t.archived), tokenIdx: index("exhibit_sets_token_idx").on(t.publicToken) }),
);

/** One exhibit PDF in a set. */
export const exhibitDocs = pgTable(
  "exhibit_docs",
  {
    id: serial("id").primaryKey(),
    setId: integer("set_id").notNull(),
    /** plaintiff | defendant | joint */
    side: varchar("side", { length: 16 }).notNull().default("plaintiff"),
    /** Numeric exhibit number for ordering (null when it couldn't be read). */
    number: integer("number"),
    /** Display designation as offered, e.g. "P-1". */
    label: varchar("label", { length: 64 }).notNull().default(""),
    title: varchar("title", { length: 255 }).notNull().default(""),
    description: text("description").notNull().default(""),
    /** Prep priority flag: none (default) | green (priority) | yellow (neutral) | red (low/bad). */
    priority: varchar("priority", { length: 8 }).notNull().default("none"),
    /** Trial ruling: none (default) | admitted | pending (offered) | excluded. */
    trialStatus: varchar("trial_status", { length: 16 }).notNull().default("none"),
    bates: varchar("bates", { length: 128 }).notNull().default(""),
    /** Sponsoring witnesses this exhibit comes in through (exhibit_witnesses ids). */
    witnessIds: jsonb("witness_ids").notNull().default([]),
    /** Foundation shortcuts: business-records-affidavit | certified-record | self-authenticating | stipulated. */
    foundation: jsonb("foundation").notNull().default([]),
    /** Elements this exhibit helps prove (exhibit_elements ids). */
    elementIds: jsonb("element_ids").notNull().default([]),
    /** Free working notes (the notepad button on the row). */
    notes: text("notes").notNull().default(""),
    url: text("url"),
    pathname: text("pathname"),
    contentType: varchar("content_type", { length: 128 }),
    sizeBytes: integer("size_bytes"),
    /** True page count of the PDF (may exceed the number of stored text pages). */
    pageCount: integer("page_count"),
    /** Per-page extracted text (truncated) that powers content search. */
    pageText: jsonb("page_text").notNull().default([]),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ setIdx: index("exhibit_docs_set_idx").on(t.setId) }),
);

/** A set's witness list — who exhibits get sponsored through. */
export const exhibitWitnesses = pgTable(
  "exhibit_witnesses",
  {
    id: serial("id").primaryKey(),
    setId: integer("set_id").notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ setIdx: index("exhibit_witnesses_set_idx").on(t.setId) }),
);

/** A set's causes of action being tried. */
export const exhibitClaims = pgTable(
  "exhibit_claims",
  {
    id: serial("id").primaryKey(),
    setId: integer("set_id").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ setIdx: index("exhibit_claims_set_idx").on(t.setId) }),
);

/** One element of a cause of action. */
export const exhibitElements = pgTable(
  "exhibit_elements",
  {
    id: serial("id").primaryKey(),
    setId: integer("set_id").notNull(),
    claimId: integer("claim_id").notNull(),
    text: varchar("text", { length: 500 }).notNull(),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ claimIdx: index("exhibit_elements_claim_idx").on(t.claimId) }),
);

/** Named people allowed to view a restricted set — each verified by a one-time
 *  code sent to their own email, and individually revocable. */
export const exhibitRecipients = pgTable(
  "exhibit_recipients",
  {
    id: serial("id").primaryKey(),
    setId: integer("set_id").notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 191 }).notNull().default(""),
    token: varchar("token", { length: 64 }).notNull().unique(),
    revoked: boolean("revoked").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ setIdx: index("exhibit_recipients_set_idx").on(t.setId), tokenIdx: index("exhibit_recipients_token_idx").on(t.token) }),
);

export type ExhibitSet = typeof exhibitSets.$inferSelect;
export type ExhibitDoc = typeof exhibitDocs.$inferSelect;
export type ExhibitRecipient = typeof exhibitRecipients.$inferSelect;
export type ExhibitWitness = typeof exhibitWitnesses.$inferSelect;
export type ExhibitClaim = typeof exhibitClaims.$inferSelect;
export type ExhibitElement = typeof exhibitElements.$inferSelect;

export type TrialCase = typeof trialCases.$inferSelect;
export type TrialDeadline = typeof trialDeadlines.$inferSelect;
export type TrialWitness = typeof trialWitnesses.$inferSelect;
export type TrialExhibit = typeof trialExhibits.$inferSelect;
export type TrialClaim = typeof trialClaims.$inferSelect;
export type TrialElement = typeof trialElements.$inferSelect;
export type TrialProof = typeof trialProofs.$inferSelect;
export type TrialTranscript = typeof trialTranscripts.$inferSelect;

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
