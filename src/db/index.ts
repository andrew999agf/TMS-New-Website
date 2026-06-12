import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Database connection.
 *
 * The connection is lazy and optional: if `DATABASE_URL` is not set, `db` is
 * null and the content layer falls back to seed defaults. This lets the entire
 * site build and render before the database is provisioned — exactly what we
 * need while the human-supplied infrastructure is still pending.
 */

declare global {
  var __tms_pg__: ReturnType<typeof postgres> | undefined;
}

const connectionString = process.env.DATABASE_URL;

export const hasDb = Boolean(connectionString);

let _db: PostgresJsDatabase<typeof schema> | null = null;

if (connectionString) {
  // Reuse the client across hot reloads / serverless invocations.
  const client =
    global.__tms_pg__ ??
    postgres(connectionString, {
      max: 1,
      prepare: false,
      idle_timeout: 20,
    });
  if (process.env.NODE_ENV !== "production") global.__tms_pg__ = client;
  _db = drizzle(client, { schema });
}

export const db = _db;
export { schema };

/** Throwing accessor for code paths that genuinely require the database. */
export function requireDb(): PostgresJsDatabase<typeof schema> {
  if (!_db) {
    throw new Error(
      "DATABASE_URL is not configured. This operation requires a database connection.",
    );
  }
  return _db;
}
