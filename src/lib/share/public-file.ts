import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { shareFolders, shareRecipients } from "@/db/schema";
import { normalizeMeta } from "@/lib/share/types";

/** Resolve a folder-level public token to its folder, only when file links are
 *  enabled. Works for both open and secure folders (auth is enforced separately). */
export async function resolvePublicFolder(token: string) {
  if (!db || !token) return null;
  const [folder] = await db.select().from(shareFolders).where(sql`${shareFolders.meta}->>'publicToken' = ${token}`);
  if (!folder) return null;
  const meta = normalizeMeta(folder.meta);
  if (!meta.fileLinks || meta.publicToken !== token) return null;
  return { folder, meta };
}

/** The active recipient grant for an email on a folder, or null. */
export async function recipientOfFolder(folderId: number, email: string | null | undefined) {
  if (!db || !email) return null;
  const [r] = await db.select().from(shareRecipients).where(and(eq(shareRecipients.folderId, folderId), eq(shareRecipients.email, email.toLowerCase())));
  if (!r || r.revoked) return null;
  if (r.expiresAt && r.expiresAt < new Date()) return null;
  return r;
}
