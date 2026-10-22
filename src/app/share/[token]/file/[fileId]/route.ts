import { NextResponse } from "next/server";
import { db } from "@/db";
import { shareFiles, shareFolders, shareRecipients } from "@/db/schema";
import { portalEmail } from "@/lib/share/portal-session";
import { getSession, isFullAdmin } from "@/lib/auth";
import { logShareAccess } from "@/lib/share/access-log";
import { and, eq } from "drizzle-orm";
import { shareCan } from "@/lib/share/types";

export const runtime = "nodejs";

/**
 * Token-checked download proxy for a shared file. The recipient never sees the
 * raw Blob URL — the file is streamed through here only after the token is
 * validated and the file is confirmed to belong to that recipient's folder.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string; fileId: string }> }) {
  const { token, fileId } = await params;
  const preview = new URL(req.url).searchParams.get("preview") === "1";
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const [rec] = await db.select().from(shareRecipients).where(eq(shareRecipients.token, token));
  if (!rec || rec.revoked) return NextResponse.json({ error: "This link is no longer active." }, { status: 403 });
  if (rec.expiresAt && rec.expiresAt < new Date()) return NextResponse.json({ error: "This link has expired. Contact max@texaslawsmith.com to have it re-issued." }, { status: 403 });

  // Same sign-in requirement as the share page for sensitive folders.
  const [folder] = await db.select({ requireAuth: shareFolders.requireAuth }).from(shareFolders).where(eq(shareFolders.id, rec.folderId));
  if (folder?.requireAuth || rec.requireAuth) {
    const who = await portalEmail();
    if (!who || who !== rec.email.toLowerCase()) {
      const admin = await getSession().catch(() => null);
      if (!admin || !isFullAdmin(admin.role)) return NextResponse.json({ error: "Sign in on the share page first." }, { status: 401 });
    }
  }

  const id = Number(fileId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [file] = await db.select().from(shareFiles).where(and(eq(shareFiles.id, id), eq(shareFiles.folderId, rec.folderId)));
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // A preview (or a view-only recipient) opens the file inline; anything else
  // is a download. Range requests for media playback are not re-logged.
  const inline = preview || !shareCan(rec.permission, "download");
  // Part of a browser-built ZIP (?bulk=1): the archive is logged once by
  // zip-log, not file by file; resumed pieces (Range) aren't re-logged.
  const bulk = new URL(req.url).searchParams.get("bulk") === "1";
  if (!bulk && (!req.headers.get("range") || req.headers.get("range")?.startsWith("bytes=0-"))) {
    await logShareAccess(req, { folderId: rec.folderId, recipientId: rec.id, action: inline ? "preview" : "download", fileId: file.id, meta: { name: file.filename, bytes: file.sizeBytes ?? undefined, via: "link" } });
  }

  // Forward a Range request to Blob so video/audio can stream and seek in the
  // preview player (browsers request byte ranges for media playback).
  const range = req.headers.get("range");
  const upstream = await fetch(file.url, range ? { headers: { Range: range } } : undefined);
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: "File unavailable." }, { status: 502 });

  // Files uploaded from a folder keep their relative path in `filename`; the
  // download name should be just the base file name.
  const baseName = file.filename.split("/").pop() || file.filename;
  const safe = baseName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  // Preview requests open inline; otherwise view-only recipients get it inline
  // and download+ recipients get an attachment.
  const disposition = preview ? "inline" : shareCan(rec.permission, "download") ? "attachment" : "inline";
  const headers = new Headers();
  headers.set("Content-Type", file.contentType || "application/octet-stream");
  headers.set("Content-Disposition", `${disposition}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(baseName)}`);
  headers.set("Accept-Ranges", "bytes");
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);
  const upstreamLen = upstream.headers.get("content-length");
  if (upstreamLen) headers.set("Content-Length", upstreamLen);
  else if (file.sizeBytes && !contentRange) headers.set("Content-Length", String(file.sizeBytes));
  headers.set("Cache-Control", "private, no-store");
  // Pass through 206 Partial Content when Blob honored the range request.
  return new NextResponse(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
}
