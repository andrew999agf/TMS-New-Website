import { sql } from "drizzle-orm";
import { db } from "@/db";
import { CASE_RESULTS } from "@/lib/content/defaults/results";

/**
 * Databases provisioned before the result-page feature lack the has_page /
 * page_body columns, and a full-row select would fail against them. Adding
 * the columns here — idempotently, once per server instance — means neither
 * the public site nor the admin panel depends on the operator remembering to
 * press "Sync database" after a deploy.
 */
let ensured: Promise<void> | null = null;

/** DDL for the Discovery Reviewer tables (also run by Settings → Database
 *  updates). Kept here so the feature works the moment the code deploys. */
export const DISCOVERY_DDL = [
  `CREATE TABLE IF NOT EXISTS discovery_sets (
    id serial PRIMARY KEY,
    name varchar(191) NOT NULL,
    matter text NOT NULL DEFAULT '',
    cause_number varchar(128) NOT NULL DEFAULT '',
    court varchar(191) NOT NULL DEFAULT '',
    notes text NOT NULL DEFAULT '',
    archived boolean NOT NULL DEFAULT false,
    created_by varchar(255),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS discovery_sets_archived_idx ON discovery_sets (archived)`,
  `CREATE TABLE IF NOT EXISTS discovery_docs (
    id serial PRIMARY KEY,
    set_id integer NOT NULL,
    name varchar(255) NOT NULL DEFAULT '',
    url text,
    pathname text,
    content_type varchar(128),
    size_bytes integer,
    page_count integer,
    page_text jsonb NOT NULL DEFAULT '[]'::jsonb,
    sort integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS discovery_docs_set_idx ON discovery_docs (set_id)`,
  `CREATE TABLE IF NOT EXISTS discovery_marks (
    id serial PRIMARY KEY,
    set_id integer NOT NULL,
    party varchar(2) NOT NULL DEFAULT 'P',
    number integer NOT NULL,
    label varchar(32) NOT NULL DEFAULT '',
    title varchar(255) NOT NULL DEFAULT '',
    pages jsonb NOT NULL DEFAULT '[]'::jsonb,
    exhibit_set_id integer,
    exhibit_doc_id integer,
    created_by varchar(255),
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS discovery_marks_set_idx ON discovery_marks (set_id)`,
  `ALTER TABLE discovery_docs ADD COLUMN IF NOT EXISTS bucket varchar(12) NOT NULL DEFAULT 'opposing'`,
  `ALTER TABLE discovery_docs ADD COLUMN IF NOT EXISTS served_at varchar(32) NOT NULL DEFAULT ''`,
  `ALTER TABLE discovery_docs ADD COLUMN IF NOT EXISTS served_by varchar(191) NOT NULL DEFAULT ''`,
  `ALTER TABLE discovery_docs ADD COLUMN IF NOT EXISTS served_to varchar(191) NOT NULL DEFAULT ''`,
  `ALTER TABLE discovery_docs ADD COLUMN IF NOT EXISTS ai_label varchar(300) NOT NULL DEFAULT ''`,
  `ALTER TABLE discovery_docs ADD COLUMN IF NOT EXISTS ai_description text NOT NULL DEFAULT ''`,
  `ALTER TABLE discovery_docs ADD COLUMN IF NOT EXISTS ai_label_status varchar(24) NOT NULL DEFAULT ''`,
  `ALTER TABLE discovery_docs ADD COLUMN IF NOT EXISTS ai_labeled_at timestamptz`,
  `ALTER TABLE assistant_prefs ADD COLUMN IF NOT EXISTS preset varchar(32) NOT NULL DEFAULT 'butler'`,
  `ALTER TABLE discovery_sets ADD COLUMN IF NOT EXISTS prod_toc text NOT NULL DEFAULT ''`,
  `ALTER TABLE discovery_sets ADD COLUMN IF NOT EXISTS prod_notes text NOT NULL DEFAULT ''`,
  `ALTER TABLE discovery_sets ADD COLUMN IF NOT EXISTS prod_toc_file text NOT NULL DEFAULT ''`,
  `ALTER TABLE discovery_sets ADD COLUMN IF NOT EXISTS staged_toc text NOT NULL DEFAULT ''`,
  `ALTER TABLE discovery_sets ADD COLUMN IF NOT EXISTS staged_notes text NOT NULL DEFAULT ''`,
  `ALTER TABLE production_docs ADD COLUMN IF NOT EXISTS source_pages jsonb NOT NULL DEFAULT '[]'`,
  `CREATE TABLE IF NOT EXISTS discovery_annotations (
    id serial PRIMARY KEY,
    set_id integer NOT NULL,
    file_key varchar(64) NOT NULL DEFAULT '',
    page integer NOT NULL DEFAULT 1,
    kind varchar(12) NOT NULL DEFAULT 'highlight',
    rect jsonb NOT NULL DEFAULT '{}',
    note text NOT NULL DEFAULT '',
    created_by varchar(255),
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS discovery_annotations_file_idx ON discovery_annotations (set_id, file_key)`,
  `ALTER TABLE discovery_docs ADD COLUMN IF NOT EXISTS text_status varchar(12) NOT NULL DEFAULT ''`,
  `ALTER TABLE share_files ADD COLUMN IF NOT EXISTS page_count integer`,
  `ALTER TABLE share_files ADD COLUMN IF NOT EXISTS page_text jsonb NOT NULL DEFAULT '[]'`,
  `ALTER TABLE share_files ADD COLUMN IF NOT EXISTS text_status varchar(12) NOT NULL DEFAULT ''`,
  `ALTER TABLE production_docs ADD COLUMN IF NOT EXISTS page_text jsonb NOT NULL DEFAULT '[]'`,
  `ALTER TABLE production_docs ADD COLUMN IF NOT EXISTS text_status varchar(12) NOT NULL DEFAULT ''`,
  `ALTER TABLE share_files ADD COLUMN IF NOT EXISTS ai_label varchar(300) NOT NULL DEFAULT ''`,
  `ALTER TABLE share_files ADD COLUMN IF NOT EXISTS ai_description text NOT NULL DEFAULT ''`,
  `ALTER TABLE share_files ADD COLUMN IF NOT EXISTS ai_label_status varchar(24) NOT NULL DEFAULT ''`,
  `ALTER TABLE share_files ADD COLUMN IF NOT EXISTS ai_labeled_at timestamptz`,
  `ALTER TABLE production_docs ADD COLUMN IF NOT EXISTS ai_label varchar(300) NOT NULL DEFAULT ''`,
  `ALTER TABLE production_docs ADD COLUMN IF NOT EXISTS ai_description text NOT NULL DEFAULT ''`,
  `ALTER TABLE production_docs ADD COLUMN IF NOT EXISTS ai_label_status varchar(24) NOT NULL DEFAULT ''`,
  `ALTER TABLE production_docs ADD COLUMN IF NOT EXISTS ai_labeled_at timestamptz`,
  `ALTER TABLE discovery_sets ADD COLUMN IF NOT EXISTS share_token varchar(64)`,
  `ALTER TABLE discovery_docs ADD COLUMN IF NOT EXISTS text_error text NOT NULL DEFAULT ''`,
  `ALTER TABLE share_files ADD COLUMN IF NOT EXISTS text_error text NOT NULL DEFAULT ''`,
  `ALTER TABLE production_docs ADD COLUMN IF NOT EXISTS text_error text NOT NULL DEFAULT ''`,
  `ALTER TABLE discovery_docs ADD COLUMN IF NOT EXISTS page_notes jsonb NOT NULL DEFAULT '[]'`,
  `ALTER TABLE share_files ADD COLUMN IF NOT EXISTS page_notes jsonb NOT NULL DEFAULT '[]'`,
  `ALTER TABLE production_docs ADD COLUMN IF NOT EXISTS page_notes jsonb NOT NULL DEFAULT '[]'`,
  `ALTER TABLE discovery_docs ADD COLUMN IF NOT EXISTS ai_sections jsonb NOT NULL DEFAULT '[]'`,
  `ALTER TABLE share_files ADD COLUMN IF NOT EXISTS ai_sections jsonb NOT NULL DEFAULT '[]'`,
  `ALTER TABLE production_docs ADD COLUMN IF NOT EXISTS ai_sections jsonb NOT NULL DEFAULT '[]'`,
  `ALTER TABLE production_docs ADD COLUMN IF NOT EXISTS page_bates jsonb NOT NULL DEFAULT '[]'`,
  // engagement_letters is created by Database Sync — the e-sign columns are
  // added only when the table exists, so a fresh environment can't wedge the
  // whole ensure list on a missing table.
  `DO $$ BEGIN
    IF to_regclass('engagement_letters') IS NOT NULL THEN
      ALTER TABLE engagement_letters ADD COLUMN IF NOT EXISTS sign_token varchar(64);
      ALTER TABLE engagement_letters ADD COLUMN IF NOT EXISTS sent_to varchar(255) NOT NULL DEFAULT '';
      ALTER TABLE engagement_letters ADD COLUMN IF NOT EXISTS email_template varchar(24) NOT NULL DEFAULT 'engagement';
      ALTER TABLE engagement_letters ADD COLUMN IF NOT EXISTS signer_name varchar(191) NOT NULL DEFAULT '';
      ALTER TABLE engagement_letters ADD COLUMN IF NOT EXISTS signer_email varchar(255) NOT NULL DEFAULT '';
      ALTER TABLE engagement_letters ADD COLUMN IF NOT EXISTS signer_ip varchar(64) NOT NULL DEFAULT '';
      ALTER TABLE engagement_letters ADD COLUMN IF NOT EXISTS signer_user_agent varchar(500) NOT NULL DEFAULT '';
    END IF;
  END $$;`,
  `CREATE TABLE IF NOT EXISTS lit_files (
    id serial PRIMARY KEY,
    filename varchar(255) NOT NULL,
    url text NOT NULL,
    pathname text,
    content_type varchar(128),
    size_bytes integer,
    notes varchar(500) NOT NULL DEFAULT '',
    uploaded_by varchar(191) NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS dwq_packages (
    id serial PRIMARY KEY,
    matter varchar(64) NOT NULL DEFAULT '',
    entity varchar(255) NOT NULL DEFAULT '',
    data jsonb NOT NULL DEFAULT '{}',
    created_by varchar(191) NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE exhibit_docs ADD COLUMN IF NOT EXISTS page_notes jsonb NOT NULL DEFAULT '[]'`,
  `ALTER TABLE exhibit_docs ADD COLUMN IF NOT EXISTS ai_sections jsonb NOT NULL DEFAULT '[]'`,
  `ALTER TABLE exhibit_docs ADD COLUMN IF NOT EXISTS ai_label varchar(300) NOT NULL DEFAULT ''`,
  `ALTER TABLE exhibit_docs ADD COLUMN IF NOT EXISTS ai_description text NOT NULL DEFAULT ''`,
  `ALTER TABLE discovery_sets ADD COLUMN IF NOT EXISTS share_token_received varchar(64)`,
  `ALTER TABLE discovery_sets ADD COLUMN IF NOT EXISTS share_token_staged varchar(64)`,
  `ALTER TABLE discovery_sets ADD COLUMN IF NOT EXISTS share_token_produced varchar(64)`,
  `ALTER TABLE share_folders ADD COLUMN IF NOT EXISTS discovery_request_url text`,
  `ALTER TABLE share_folders ADD COLUMN IF NOT EXISTS discovery_request_pathname text`,
  `ALTER TABLE share_folders ADD COLUMN IF NOT EXISTS discovery_request_name varchar(255)`,
  `ALTER TABLE share_folders ADD COLUMN IF NOT EXISTS discovery_prefix varchar(16) NOT NULL DEFAULT ''`,
  `ALTER TABLE share_folders ADD COLUMN IF NOT EXISTS discovery_numbers jsonb NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE share_folders ADD COLUMN IF NOT EXISTS response_due varchar(10) NOT NULL DEFAULT ''`,
  `ALTER TABLE share_folders ADD COLUMN IF NOT EXISTS client_due varchar(10) NOT NULL DEFAULT ''`,
  `CREATE TABLE IF NOT EXISTS production_docs (
    id serial PRIMARY KEY,
    set_id integer NOT NULL,
    source_key varchar(64) NOT NULL DEFAULT '',
    name varchar(255) NOT NULL DEFAULT '',
    request_label varchar(64) NOT NULL DEFAULT '',
    url text,
    pathname text,
    content_type varchar(128),
    size_bytes integer,
    bates_prefix varchar(32) NOT NULL DEFAULT '',
    bates_start integer NOT NULL DEFAULT 0,
    bates_end integer NOT NULL DEFAULT 0,
    page_count integer,
    status varchar(12) NOT NULL DEFAULT 'staged',
    production_id integer,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS production_docs_set_idx ON production_docs (set_id)`,
  `CREATE TABLE IF NOT EXISTS productions (
    id serial PRIMARY KEY,
    set_id integer NOT NULL,
    seq integer NOT NULL DEFAULT 1,
    label varchar(64) NOT NULL DEFAULT '',
    bates_prefix varchar(32) NOT NULL DEFAULT '',
    bates_start integer NOT NULL DEFAULT 0,
    bates_end integer NOT NULL DEFAULT 0,
    letter_url text,
    letter_pathname text,
    file_url text,
    file_pathname text,
    file_name varchar(255) NOT NULL DEFAULT '',
    token varchar(64) NOT NULL UNIQUE,
    produced_at timestamptz,
    created_by varchar(255),
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS productions_set_idx ON productions (set_id)`,
  `CREATE TABLE IF NOT EXISTS contacts (
    id serial PRIMARY KEY,
    kind varchar(24) NOT NULL DEFAULT 'other',
    name varchar(191) NOT NULL,
    firm varchar(191) NOT NULL DEFAULT '',
    side varchar(16) NOT NULL DEFAULT '',
    email varchar(255) NOT NULL DEFAULT '',
    phone varchar(64) NOT NULL DEFAULT '',
    address text NOT NULL DEFAULT '',
    notes text NOT NULL DEFAULT '',
    archived boolean NOT NULL DEFAULT false,
    created_by varchar(255),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS contacts_kind_idx ON contacts (kind)`,
  `CREATE TABLE IF NOT EXISTS case_hub (
    id serial PRIMARY KEY,
    matter text NOT NULL UNIQUE,
    name varchar(255) NOT NULL DEFAULT '',
    cause_number varchar(128) NOT NULL DEFAULT '',
    court varchar(191) NOT NULL DEFAULT '',
    county varchar(96) NOT NULL DEFAULT '',
    notes text NOT NULL DEFAULT '',
    parties jsonb NOT NULL DEFAULT '[]'::jsonb,
    archived boolean NOT NULL DEFAULT false,
    created_by varchar(255),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  // AI server concierge: start/stop audit trail behind the cost meter.
  `CREATE TABLE IF NOT EXISTS ai_server_log (
    id serial PRIMARY KEY,
    event varchar(16) NOT NULL,
    cost_per_hr real NOT NULL DEFAULT 0,
    by_email varchar(255) NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS ai_server_log_created_idx ON ai_server_log (created_at)`,
  // Assistant personalization: per-user preferences, long-term memories,
  // and shared-conversation provenance.
  `CREATE TABLE IF NOT EXISTS assistant_prefs (
    user_email varchar(255) PRIMARY KEY,
    about text NOT NULL DEFAULT '',
    style text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS assistant_memories (
    id serial PRIMARY KEY,
    scope varchar(12) NOT NULL DEFAULT 'user',
    user_email varchar(255) NOT NULL DEFAULT '',
    content varchar(500) NOT NULL,
    created_by varchar(255) NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS assistant_memories_scope_idx ON assistant_memories (scope, user_email)`,
  `CREATE TABLE IF NOT EXISTS assistant_threads (
    id serial PRIMARY KEY,
    user_email varchar(255) NOT NULL,
    mode varchar(16) NOT NULL DEFAULT 'general',
    title varchar(200) NOT NULL DEFAULT 'New conversation',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS assistant_messages (
    id serial PRIMARY KEY,
    thread_id integer NOT NULL REFERENCES assistant_threads(id) ON DELETE CASCADE,
    role varchar(16) NOT NULL,
    content text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE assistant_threads ADD COLUMN IF NOT EXISTS shared_from varchar(255) NOT NULL DEFAULT ''`,
  // Template bank: firm Word templates + generated-document paper trail.
  `CREATE TABLE IF NOT EXISTS doc_templates (
    id serial PRIMARY KEY,
    name varchar(255) NOT NULL,
    folder varchar(120) NOT NULL DEFAULT '',
    description text NOT NULL DEFAULT '',
    doc_type varchar(40) NOT NULL DEFAULT 'other',
    url text,
    pathname text,
    content_type varchar(128),
    size_bytes integer,
    fields jsonb NOT NULL DEFAULT '[]',
    doc_text text NOT NULL DEFAULT '',
    archived boolean NOT NULL DEFAULT false,
    created_by varchar(255),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS doc_templates_folder_idx ON doc_templates (folder)`,
  `CREATE TABLE IF NOT EXISTS generated_docs (
    id serial PRIMARY KEY,
    template_id integer,
    matter text NOT NULL DEFAULT '',
    name varchar(255) NOT NULL,
    url text,
    pathname text,
    by_email varchar(255) NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS generated_docs_matter_idx ON generated_docs (matter)`,
];

let discoveryEnsured: Promise<void> | null = null;

/** Create the Discovery Reviewer tables if they don't exist yet — once per
 *  server instance, so the feature needs no manual database step. */
export function ensureDiscoveryTables(): Promise<void> {
  if (!db) return Promise.resolve();
  if (!discoveryEnsured) {
    discoveryEnsured = (async () => {
      for (const ddl of DISCOVERY_DDL) await db!.execute(sql.raw(ddl));
    })().catch(() => {
      discoveryEnsured = null;
    }) as Promise<void>;
  }
  return discoveryEnsured;
}

export function ensureResultsPageColumns(): Promise<void> {
  if (!db) return Promise.resolve();
  if (!ensured) {
    ensured = (async () => {
      await db!.execute(
        sql`ALTER TABLE case_results ADD COLUMN IF NOT EXISTS has_page boolean NOT NULL DEFAULT false`,
      );
      await db!.execute(sql`ALTER TABLE case_results ADD COLUMN IF NOT EXISTS page_body text`);
      // One-time content catch-up: when results are DB-managed, the Bosque
      // verdict's detail page (seeded in the defaults file) is applied to the
      // matching row too — but only while the row has no page of its own, so
      // an admin edit is never overwritten.
      const bosque = CASE_RESULTS.find((r) => r.hasPage && r.cite?.includes("CV24-162"));
      if (bosque?.pageBody) {
        // Also upgrades a row holding the exact text of an EARLIER backfill —
        // that text was never touched by an admin, so replacing it is safe.
        const prior1 =
          "The case was tried to a jury in the 220th Judicial District Court in Meridian, the county seat of Bosque County. At the center of the four-day trial was a road — a public road, confirmed under Chapter 258 of the Texas Transportation Code and commonly used by the traveling public.\n\nThe trial itself became part of the story. While the case was being tried, the Hydra Fire was burning two miles outside Meridian, and the town was evacuated on the first day of trial. When the courthouse doors reopened, we came back and finished the job — fully, and professionally, to the end.\n\nAfter four days of evidence and argument, the jury deliberated for two hours and returned its verdict in favor of our client.";
        const prior2 =
          "Our trial team tried the case to a jury in the 220th Judicial District Court in Meridian, the county seat of Bosque County. At the center of the four-day trial was a road — a public road, confirmed under Chapter 258 of the Texas Transportation Code and commonly used by the traveling public.\n\nThe trial itself became part of the story. While the case was being tried, the Hydra Fire was burning two miles outside Meridian, and the town was evacuated on the first day of trial. When the courthouse doors reopened, our trial team came back and finished the job — fully, and professionally, to the end.\n\nAfter four days of evidence and argument, the jury deliberated for two hours and returned its verdict in favor of our client.";
        await db!.execute(sql`
          UPDATE case_results SET has_page = true, page_body = ${bosque.pageBody}
          WHERE title = ${bosque.title}
            AND ((has_page = false AND coalesce(page_body, '') = '') OR page_body = ${prior1} OR page_body = ${prior2})
        `);
      }
    })().catch(() => {
      // Lack of DDL rights (or a transient failure) must never take down a
      // page render; the select falls back to seed content as before, and
      // the next instance retries.
      ensured = null;
    }) as Promise<void>;
  }
  return ensured;
}
