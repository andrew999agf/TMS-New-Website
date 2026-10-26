import "server-only";
import { db } from "@/db";
import { shareAccessLog } from "@/db/schema";
import { ensureDiscoveryTables } from "@/db/ensure";

/** What a recipient did in a shared folder — kept for the firm's own record
 *  (the admin folder page's downloadable log). Nothing here is shown or
 *  sent to recipients. */
export type ShareAccessAction =
  | "view"      // opened the folder page
  | "preview"   // opened a document inline
  | "download"  // downloaded one document
  | "zip"       // downloaded a ZIP (all / selected / recent / a sub-folder)
  | "upload";   // added documents

export type ShareAccessMeta = {
  /** For zips: everything, a checked set, recent uploads, or a sub-folder link. */
  scope?: "all" | "selected" | "recent" | "dir" | "package";
  /** How many documents the download held, and their total size. */
  files?: number;
  bytes?: number;
  /** Document ids in a bulk download (first 200). */
  ids?: number[];
  /** "part 2 of 3" when a big ZIP went out in pieces. */
  part?: number;
  parts?: number;
  /** Document name for single-file actions. */
  name?: string;
  /** Which door: the recipient's link, a per-file direct link, a sub-folder link. */
  via?: "link" | "file-link" | "dir-link" | "ai-reviewer";
  dir?: string;
};

/** Best-effort: never throws, never blocks the response. */
export async function logShareAccess(req: Request | null, row: { folderId: number; recipientId?: number | null; action: ShareAccessAction; fileId?: number | null; meta?: ShareAccessMeta }) {
  if (!db) return;
  try {
    // The newer columns (meta / ip / browser) are added by the one-time
    // schema pass; make sure it has run on this instance before writing.
    await ensureDiscoveryTables();
    const ip = req ? (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null) : null;
    const ua = req ? (req.headers.get("user-agent") || "").slice(0, 300) || null : null;
    await db.insert(shareAccessLog).values({
      folderId: row.folderId, recipientId: row.recipientId ?? null, action: row.action, fileId: row.fileId ?? null,
      meta: row.meta ?? {}, ip, userAgent: ua,
    });
  } catch { /* the download must not fail because the log did */ }
}
