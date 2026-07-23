import { NextResponse } from "next/server";
import { db } from "@/db";
import { shareFiles, shareRecipients, shareAccessLog } from "@/db/schema";
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

  const id = Number(fileId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [file] = await db.select().from(shareFiles).where(and(eq(shareFiles.id, id), eq(shareFiles.folderId, rec.folderId)));
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await db.insert(shareAccessLog).values({ folderId: rec.folderId, recipientId: rec.id, action: "download", fileId: file.id });
  } catch {
    /* best-effort */
  }

  const upstream = await fetch(file.url);
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
  if (file.sizeBytes) headers.set("Content-Length", String(file.sizeBytes));
  headers.set("Cache-Control", "private, no-store");
  return new NextResponse(upstream.body, { status: 200, headers });
}
