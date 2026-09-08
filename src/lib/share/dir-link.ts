import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { shareDirLinks, shareFolders } from "@/db/schema";

/**
 * Resolve a directory view-link token: the share folder plus the directory
 * subtree ("" = root) it exposes. Null when the token is unknown or revoked —
 * a dead link simply doesn't resolve.
 */
export async function resolveDirLink(token: string): Promise<{ folderId: number; folderName: string; dirPath: string } | null> {
  if (!db || !token) return null;
  try {
    const [link] = await db.select().from(shareDirLinks).where(and(eq(shareDirLinks.token, token), eq(shareDirLinks.revoked, false)));
    if (!link) return null;
    const [folder] = await db.select({ id: shareFolders.id, name: shareFolders.name }).from(shareFolders).where(eq(shareFolders.id, link.folderId));
    if (!folder) return null;
    return { folderId: folder.id, folderName: folder.name, dirPath: link.dirPath };
  } catch {
    return null;
  }
}

/** Whether a stored filename (relative path) falls inside the linked directory. */
export function fileInDir(filename: string, dirPath: string): boolean {
  return dirPath === "" || filename === dirPath || filename.startsWith(dirPath + "/");
}

/** The filename relative to the linked directory (for display and ZIP paths). */
export function relToDir(filename: string, dirPath: string): string {
  return dirPath && filename.startsWith(dirPath + "/") ? filename.slice(dirPath.length + 1) : filename;
}
