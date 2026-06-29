import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { getModules } from "./modules";

/**
 * Per-user training state, stored as settings rows keyed by user id:
 *   training.completion.<id> → { [moduleSlug]: ISO timestamp }
 *   training.access.<id>     → string[] of allowed module slugs
 *
 * Access is "open by default": if a user has no access row, they can see every
 * module. Once an admin edits access, an explicit allowlist is written. Reads
 * intersect with the live catalog so removed modules drop out automatically.
 */
export type CompletionMap = Record<string, string>;

const compKey = (id: string) => `training.completion.${id}`;
const accessKey = (id: string) => `training.access.${id}`;

async function readRow<T>(key: string): Promise<T | null> {
  if (!db) return null;
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, key));
    return (row?.value as T) ?? null;
  } catch {
    return null;
  }
}

async function writeRow(key: string, value: unknown): Promise<boolean> {
  if (!db) return false;
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  return true;
}

export async function readCompletion(userId: string): Promise<CompletionMap> {
  return (await readRow<CompletionMap>(compKey(userId))) ?? {};
}

export async function writeCompletion(userId: string, map: CompletionMap): Promise<boolean> {
  return writeRow(compKey(userId), map);
}

/** The raw access allowlist, or null when the user has no record (= all allowed). */
export async function readAccessRecord(userId: string): Promise<string[] | null> {
  const v = await readRow<string[]>(accessKey(userId));
  return Array.isArray(v) ? v : null;
}

export async function writeAccess(userId: string, slugs: string[]): Promise<boolean> {
  return writeRow(accessKey(userId), slugs);
}

/** Resolved set of module slugs a user may access (all catalog modules if no record). */
export async function allowedSlugs(userId: string): Promise<string[]> {
  const all = getModules().map((m) => m.slug);
  const rec = await readAccessRecord(userId);
  if (!rec) return all;
  return all.filter((s) => rec.includes(s));
}
