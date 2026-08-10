import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { shareFiles } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";

export const runtime = "nodejs";

/**
 * Sign-in-checked download/preview proxy for a share-folder document, so the
 * admin panel serves files from the firm's own domain rather than linking out
 * to the raw Blob URL.
 *
 * This is not only cosmetic. A Blob URL is public and permanent: anyone who ends
 * up with one — forwarded, pasted into an email, left in a browser history or a
 * referrer header — can fetch that document forever, with no sign-in and no way
 * to revoke it short of deleting the file. Routing through here means every
 * fetch is checked against the current session, and the underlying storage URL
 * is never shown to anyone.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/share-folders", session.role, session.permissions)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const { id, fileId } = await params;
  const folderId = Number(id);
  const fid = Number(fileId);
  if (!Number.isFinite(folderId) || !Number.isFinite(fid)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // The file must belong to the folder named in the URL.
  const [file] = await db.select().from(shareFiles).where(and(eq(shareFiles.id, fid), eq(shareFiles.folderId, folderId)));
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Forward Range so video and audio can seek in the preview player.
  const range = req.headers.get("range");
  const upstream = await fetch(file.url, range ? { headers: { Range: range } } : undefined);
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: "File unavailable." }, { status: 502 });

  // Uploads from a folder keep their relative path in `filename`; the download
  // should be named for just the file.
  const baseName = file.filename.split("/").pop() || file.filename;
  const safe = baseName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  const preview = new URL(req.url).searchParams.get("preview") === "1";

  const headers = new Headers();
  headers.set("Content-Type", file.contentType || "application/octet-stream");
  headers.set("Content-Disposition", `${preview ? "inline" : "attachment"}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(baseName)}`);
  headers.set("Accept-Ranges", "bytes");
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);
  const upstreamLen = upstream.headers.get("content-length");
  if (upstreamLen) headers.set("Content-Length", upstreamLen);
  else if (file.sizeBytes && !contentRange) headers.set("Content-Length", String(file.sizeBytes));
  headers.set("Cache-Control", "private, no-store");
  // Never let a storage URL leak out through a referrer on links inside a file.
  headers.set("Referrer-Policy", "no-referrer");
  return new NextResponse(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
}
