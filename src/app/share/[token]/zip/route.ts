import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { shareFiles } from "@/db/schema";
import { logShareAccess } from "@/lib/share/access-log";
import { planZipParts } from "@/lib/share/zip";
import { resolveRecipient } from "@/lib/share/access";
import { shareCan } from "@/lib/share/types";
import { zipOrParts, parseFileIds } from "@/lib/share/zip";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Download every document in the share as one ZIP (folder structure preserved). */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const ctx = await resolveRecipient(token);
  if (!ctx || !shareCan(ctx.rec.permission, "download")) return NextResponse.json({ error: "This link is no longer active." }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  // Optional filters: ?ids=1,2,3 for a specific set (used by the digest email and
  // "Download selected"), or ?days=N for everything uploaded in the last N days
  // ("recent uploads"). Absent filters mean "everything".
  const idFilter = parseFileIds(sp.get("ids"));
  const days = Math.min(90, Math.max(0, Number(sp.get("days")) || 0));
  const since = days > 0 ? new Date(Date.now() - days * 86_400_000) : null;

  let files = await db.select().from(shareFiles).where(eq(shareFiles.folderId, ctx.folder.id));
  if (idFilter) files = files.filter((f) => idFilter.has(f.id));
  if (since) files = files.filter((f) => f.createdAt >= since);
  if (files.length === 0) return NextResponse.json({ error: since ? "Nothing new to download in that window." : "No documents to download." }, { status: 404 });
  {
    // Log the actual download, not the parts-listing page of a very big ZIP.
    const partsPlanned = planZipParts(files.map((f) => ({ url: f.url, name: f.filename, size: f.sizeBytes }))).length;
    const part = Number(sp.get("part")) || 0;
    if (partsPlanned <= 1 || part > 0) {
      await logShareAccess(req, { folderId: ctx.folder.id, recipientId: ctx.rec.id, action: "zip", meta: {
        scope: idFilter ? "selected" : since ? "recent" : "all", files: files.length, bytes: files.reduce((n, f) => n + (f.sizeBytes ?? 0), 0),
        ids: files.slice(0, 200).map((f) => f.id), via: "link", ...(part > 0 ? { part, parts: partsPlanned } : {}),
      } });
    }
  }

  const suffix = idFilter ? " - new documents" : since ? " - recent uploads" : "";
  const zipName = `${(ctx.folder.name || "documents").replace(/[\\/:*?"<>|]/g, "-")}${suffix}.zip`;
  return zipOrParts(req, files.map((f) => ({ url: f.url, name: f.filename, size: f.sizeBytes })), zipName);
}
