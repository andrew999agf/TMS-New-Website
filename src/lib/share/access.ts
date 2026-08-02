import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { shareRecipients, shareFolders } from "@/db/schema";

/** Resolve a recipient token to its recipient + folder, or null if the link is
 *  invalid, revoked, or expired. Central gate for every recipient-facing route. */
export async function resolveRecipient(token: string) {
  if (!db) return null;
  const [rec] = await db.select().from(shareRecipients).where(eq(shareRecipients.token, token));
  if (!rec || rec.revoked) return null;
  if (rec.expiresAt && rec.expiresAt < new Date()) return null;
  const [folder] = await db.select().from(shareFolders).where(eq(shareFolders.id, rec.folderId));
  if (!folder) return null;
  return { rec, folder };
}

/** How long after the first new upload the "new documents" digest is sent, so a
 *  burst of uploads becomes one calm email instead of many. */
export const DIGEST_DELAY_MS = 12 * 60 * 60 * 1000;

/** Normalize a user-supplied folder path: strip leading/trailing slashes, drop
 *  "." / ".." and empty segments, cap depth and length. Returns "" for root.
 *  The caps are deliberately generous — deep folder trees (a nested folder
 *  dropped inside an already-nested sub-folder) must survive intact. */
export function cleanDirPath(input: string): string {
  const parts = (input || "")
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s && s !== "." && s !== "..")
    .map((s) => s.replace(/[\\:*?"<>|]/g, "").slice(0, 160))
    .filter(Boolean);
  return parts.slice(0, 40).join("/").slice(0, 900);
}
