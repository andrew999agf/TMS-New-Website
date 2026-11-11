import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { sbAccounts, sbCompanies, sbTaxRules } from "@/db/schema";
import { DEFAULT_CHART, DEFAULT_COMPANY, DEFAULT_RULES } from "./seed";

/** Idempotent DDL for the books module — also run by Settings → Database updates. */
export const BOOKS_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS sb_companies (
    id serial PRIMARY KEY, name varchar(191) NOT NULL, legal_name varchar(255) NOT NULL DEFAULT '', dba varchar(191) NOT NULL DEFAULT '',
    ein varchar(16) NOT NULL DEFAULT '', entity_type varchar(24) NOT NULL DEFAULT 'pllc', tax_election varchar(24) NOT NULL DEFAULT 'disregarded',
    state varchar(2) NOT NULL DEFAULT 'TX', formation_state varchar(2) NOT NULL DEFAULT 'TX', fiscal_year_start_month integer NOT NULL DEFAULT 1,
    address_line varchar(255) NOT NULL DEFAULT '', city varchar(96) NOT NULL DEFAULT '', address_state varchar(2) NOT NULL DEFAULT 'TX', zip varchar(16) NOT NULL DEFAULT '',
    phone varchar(32) NOT NULL DEFAULT '', email varchar(255) NOT NULL DEFAULT '',
    operating_bank_name varchar(128) NOT NULL DEFAULT '', operating_last4 varchar(4) NOT NULL DEFAULT '', iolta_bank_name varchar(128) NOT NULL DEFAULT '', iolta_last4 varchar(4) NOT NULL DEFAULT '',
    settings jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS sb_users (
    id serial PRIMARY KEY, email varchar(255) NOT NULL UNIQUE, name varchar(191) NOT NULL DEFAULT '', password_hash text NOT NULL,
    otp_hash varchar(128), otp_expires timestamptz, otp_attempts integer NOT NULL DEFAULT 0, failed_logins integer NOT NULL DEFAULT 0, locked_until timestamptz,
    last_login_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`,
  `ALTER TABLE sb_users ADD COLUMN IF NOT EXISTS reset_token varchar(128)`,
  `ALTER TABLE sb_users ADD COLUMN IF NOT EXISTS reset_expires timestamptz`,
  `CREATE TABLE IF NOT EXISTS sb_memberships (id serial PRIMARY KEY, user_id integer NOT NULL, company_id integer NOT NULL, role varchar(16) NOT NULL DEFAULT 'viewer', created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sb_memberships_uq ON sb_memberships (user_id, company_id)`,
  `CREATE TABLE IF NOT EXISTS sb_accounts (
    id serial PRIMARY KEY, company_id integer NOT NULL, number varchar(16) NOT NULL, name varchar(191) NOT NULL, type varchar(16) NOT NULL, subtype varchar(32) NOT NULL DEFAULT '',
    parent_id integer, is_trust boolean NOT NULL DEFAULT false, system_key varchar(48), active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sb_accounts_uq ON sb_accounts (company_id, number)`,
  `CREATE INDEX IF NOT EXISTS sb_accounts_company_idx ON sb_accounts (company_id)`,
  `CREATE TABLE IF NOT EXISTS sb_tax_rules (
    id serial PRIMARY KEY, year integer NOT NULL, jurisdiction varchar(8) NOT NULL, key varchar(64) NOT NULL, label varchar(255) NOT NULL DEFAULT '', value jsonb, unit varchar(24) NOT NULL DEFAULT '',
    source text NOT NULL DEFAULT '', note text NOT NULL DEFAULT '', verified boolean NOT NULL DEFAULT false, verified_by varchar(255), verified_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sb_tax_rules_uq ON sb_tax_rules (year, jurisdiction, key)`,
  `ALTER TABLE sb_companies ADD COLUMN IF NOT EXISTS primary_user_id integer`,
  `CREATE TABLE IF NOT EXISTS sb_access_requests (
    id serial PRIMARY KEY, company_id integer NOT NULL, email varchar(255) NOT NULL, name varchar(191) NOT NULL DEFAULT '', admin_role varchar(24) NOT NULL DEFAULT '',
    status varchar(16) NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz, resolved_by varchar(255))`,
  `CREATE INDEX IF NOT EXISTS sb_access_requests_company_idx ON sb_access_requests (company_id, status)`,
  // Outside services a company has linked (payroll first). Tokens are stored
  // encrypted; the site only ever reads from these services.
  `CREATE TABLE IF NOT EXISTS sb_integrations (
    id serial PRIMARY KEY, company_id integer NOT NULL, provider varchar(32) NOT NULL, status varchar(16) NOT NULL DEFAULT 'connected',
    environment varchar(16) NOT NULL DEFAULT 'production', external_id varchar(128) NOT NULL DEFAULT '', external_name varchar(255) NOT NULL DEFAULT '',
    access_token_enc text NOT NULL DEFAULT '', refresh_token_enc text NOT NULL DEFAULT '', token_expires_at timestamptz, scope text NOT NULL DEFAULT '',
    connected_by varchar(255) NOT NULL DEFAULT '', connected_at timestamptz NOT NULL DEFAULT now(), last_checked_at timestamptz, last_error text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sb_integrations_uq ON sb_integrations (company_id, provider)`,
  `CREATE TABLE IF NOT EXISTS sb_audit (
    id serial PRIMARY KEY, company_id integer, user_email varchar(255) NOT NULL DEFAULT '', action varchar(32) NOT NULL, entity varchar(48) NOT NULL DEFAULT '', entity_id varchar(64) NOT NULL DEFAULT '',
    detail text NOT NULL DEFAULT '', ip varchar(64) NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS sb_audit_company_idx ON sb_audit (company_id, created_at)`,
  // The ledger. Whole cents; entries are voided, never edited or deleted.
  `CREATE TABLE IF NOT EXISTS sb_clients (id serial PRIMARY KEY, company_id integer NOT NULL, name varchar(191) NOT NULL, matter varchar(255) NOT NULL DEFAULT '', reference varchar(64) NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS sb_clients_company_idx ON sb_clients (company_id)`,
  `CREATE TABLE IF NOT EXISTS sb_entries (
    id serial PRIMARY KEY, company_id integer NOT NULL, entry_date date NOT NULL, memo text NOT NULL DEFAULT '', source varchar(16) NOT NULL DEFAULT 'manual', source_ref varchar(128) NOT NULL DEFAULT '',
    kind varchar(24) NOT NULL DEFAULT '', status varchar(8) NOT NULL DEFAULT 'posted', created_by varchar(255) NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
    voided_by varchar(255), voided_at timestamptz, void_reason text NOT NULL DEFAULT '')`,
  `CREATE INDEX IF NOT EXISTS sb_entries_company_idx ON sb_entries (company_id, entry_date)`,
  `CREATE TABLE IF NOT EXISTS sb_lines (
    id serial PRIMARY KEY, entry_id integer NOT NULL, company_id integer NOT NULL, account_id integer NOT NULL, debit bigint NOT NULL DEFAULT 0, credit bigint NOT NULL DEFAULT 0,
    memo varchar(255) NOT NULL DEFAULT '', client_id integer, payee varchar(191) NOT NULL DEFAULT '', ref varchar(64) NOT NULL DEFAULT '', reconcile_id integer)`,
  `CREATE INDEX IF NOT EXISTS sb_lines_entry_idx ON sb_lines (entry_id)`,
  `CREATE INDEX IF NOT EXISTS sb_lines_account_idx ON sb_lines (company_id, account_id)`,
  `CREATE TABLE IF NOT EXISTS sb_bank_txns (
    id serial PRIMARY KEY, company_id integer NOT NULL, account_id integer NOT NULL, txn_date date NOT NULL, amount bigint NOT NULL, description text NOT NULL DEFAULT '', ref varchar(64) NOT NULL DEFAULT '',
    fingerprint varchar(64) NOT NULL, import_id integer, status varchar(12) NOT NULL DEFAULT 'new', entry_id integer, line_id integer, created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sb_bank_txns_uq ON sb_bank_txns (company_id, account_id, fingerprint)`,
  `CREATE INDEX IF NOT EXISTS sb_bank_txns_account_idx ON sb_bank_txns (company_id, account_id, status)`,
  `CREATE TABLE IF NOT EXISTS sb_imports (id serial PRIMARY KEY, company_id integer NOT NULL, account_id integer NOT NULL, filename varchar(255) NOT NULL DEFAULT '', row_count integer NOT NULL DEFAULT 0, added integer NOT NULL DEFAULT 0, duplicates integer NOT NULL DEFAULT 0, created_by varchar(255) NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS sb_reconciliations (
    id serial PRIMARY KEY, company_id integer NOT NULL, account_id integer NOT NULL, statement_date date NOT NULL, statement_balance bigint NOT NULL, status varchar(8) NOT NULL DEFAULT 'open',
    snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, created_by varchar(255) NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), finalized_by varchar(255), finalized_at timestamptz)`,
  `CREATE INDEX IF NOT EXISTS sb_reconciliations_account_idx ON sb_reconciliations (company_id, account_id)`,
  `CREATE TABLE IF NOT EXISTS sb_payroll_runs (
    id serial PRIMARY KEY, company_id integer NOT NULL, provider varchar(32) NOT NULL, external_id varchar(128) NOT NULL, environment varchar(16) NOT NULL DEFAULT 'production',
    check_date date NOT NULL, period_start date, period_end date, totals jsonb NOT NULL DEFAULT '{}'::jsonb, entry_id integer, posted_by varchar(255), posted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sb_payroll_runs_uq ON sb_payroll_runs (company_id, provider, external_id)`,
  // The safekeeping rule was renumbered from 1.14 to 1.15 effective October 1, 2024.
  `UPDATE sb_tax_rules SET label = 'Trust account records retention (Texas Rule 1.15)' WHERE key = 'trust_record_retention_years' AND label = 'Trust account records retention (Texas Rule 1.14)'`,
];

let ensured: Promise<void> | null = null;

/** Create the tables once per server and seed company #1 with the firm's defaults. */
export async function ensureBooks(): Promise<void> {
  if (!db) return;
  if (!ensured) {
    ensured = (async () => {
      for (const stmt of BOOKS_DDL) await db!.execute(sql.raw(stmt));
      await seedBooksDefaults();
    })().catch((err) => { console.error("[books] ensure:", err); ensured = null; });
  }
  return ensured;
}

/** Company #1, its chart of accounts and this year's tax rules — only where missing. */
export async function seedBooksDefaults(): Promise<number> {
  if (!db) return 0;
  let [company] = await db.select().from(sbCompanies).orderBy(sbCompanies.id).limit(1);
  if (!company) {
    [company] = await db.insert(sbCompanies).values({ ...DEFAULT_COMPANY }).returning();
  }
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(sbAccounts).where(eq(sbAccounts.companyId, company.id));
  if (Number(n) === 0) {
    const idByNumber = new Map<string, number>();
    for (const a of DEFAULT_CHART) {
      const [row] = await db.insert(sbAccounts).values({
        companyId: company.id, number: a.number, name: a.name, type: a.type, subtype: a.subtype,
        parentId: a.parent ? idByNumber.get(a.parent) ?? null : null, isTrust: !!a.trust, systemKey: a.key ?? null,
      }).onConflictDoNothing().returning({ id: sbAccounts.id });
      if (row) idByNumber.set(a.number, row.id);
    }
  }
  for (const r of DEFAULT_RULES) {
    await db.insert(sbTaxRules).values({ year: r.year, jurisdiction: r.jurisdiction, key: r.key, label: r.label, value: r.value as never, unit: r.unit, source: r.source, note: r.note ?? "", verified: r.verified }).onConflictDoNothing();
  }
  return company.id;
}
