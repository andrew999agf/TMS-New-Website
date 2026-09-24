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
