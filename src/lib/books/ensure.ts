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
  `CREATE TABLE IF NOT EXISTS sb_audit (
    id serial PRIMARY KEY, company_id integer, user_email varchar(255) NOT NULL DEFAULT '', action varchar(32) NOT NULL, entity varchar(48) NOT NULL DEFAULT '', entity_id varchar(64) NOT NULL DEFAULT '',
    detail text NOT NULL DEFAULT '', ip varchar(64) NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS sb_audit_company_idx ON sb_audit (company_id, created_at)`,
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
