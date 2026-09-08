import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { shareFiles } from "@/db/schema";
import { resolveDirLink, fileInDir } from "@/lib/share/dir-link";

export const runtime = "nodejs";

/**
 * Inline stream for one document behind a directory view link. Access is the
 * unguessable token; only files inside the linked directory's subtree resolve.
 * Storage URLs are never exposed; Range is forwarded for the PDF viewer.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string; fileId: string }> }) {
  if (!db) return new NextResponse("Unavailable", { status: 503 });
  const { token, fileId } = await params;
  const id = Number(fileId);
  if (!Number.isFinite(id)) return new NextResponse("Not found", { status: 404 });
  const link = await resolveDirLink(token);
  if (!link) return new NextResponse("This link is no longer active.", { status: 404 });

  const [f] = await db.select().from(shareFiles).where(and(eq(shareFiles.id, id), eq(shareFiles.folderId, link.folderId)));
  if (!f || !fileInDir(f.filename, link.dirPath)) return new NextResponse("Not found", { status: 404 });

  const range = req.headers.get("range");
  const upstream = await fetch(f.url, range ? { headers: { Range: range } } : undefined);
  if (!upstream.ok || !upstream.body) return new NextResponse("File unavailable.", { status: 502 });

  const base = (f.filename.split("/").pop() || "document").replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  const headers = new Headers();
  headers.set("Content-Type", f.contentType || "application/octet-stream");
  headers.set("Content-Disposition", `inline; filename="${base}"`);
  headers.set("Accept-Ranges", "bytes");
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  headers.set("Cache-Control", "private, max-age=300");
  headers.set("Referrer-Policy", "no-referrer");
  return new NextResponse(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
}
