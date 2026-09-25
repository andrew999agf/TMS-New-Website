import { sql } from "drizzle-orm";
import { db } from "@/db";

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
  `ALTER TABLE discovery_docs ADD COLUMN IF NOT EXISTS served_at varchar(32) NOT NULL DEFAULT ''`,
  `ALTER TABLE discovery_docs ADD COLUMN IF NOT EXISTS served_by varchar(191) NOT NULL DEFAULT ''`,
  `ALTER TABLE discovery_docs ADD COLUMN IF NOT EXISTS served_to varchar(191) NOT NULL DEFAULT ''`,
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
    })().catch(() => {
      // Lack of DDL rights (or a transient failure) must never take down a
      // page render; the select falls back to seed content as before, and
      // the next instance retries.
      ensured = null;
    }) as Promise<void>;
  }
  return ensured;
}
