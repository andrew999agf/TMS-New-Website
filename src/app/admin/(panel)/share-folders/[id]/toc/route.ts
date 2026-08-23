import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { shareFolders, shareFiles, shareDirs } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { cleanDirPath } from "@/lib/share/access";
import { buildTocWordHtml } from "@/lib/share/toc";

export const runtime = "nodejs";

/**
 * Word table of contents for a share folder.
 *   ?dir=A/B  scope it to that sub-folder (and everything beneath it);
 *   absent    the whole folder.
 * Returns a .doc styled as a Texas pleading — caption from the folder's cause
 * number / court / county / parties, fill-in blanks where those aren't set.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/share-folders", session.role, session.permissions)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [folder] = await db.select().from(shareFolders).where(eq(shareFolders.id, id));
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const dir = cleanDirPath(new URL(req.url).searchParams.get("dir") ?? "");
  const [files, dirs] = await Promise.all([
    db.select({ filename: shareFiles.filename, createdAt: shareFiles.createdAt }).from(shareFiles).where(eq(shareFiles.folderId, id)),
    db.select({ path: shareDirs.path }).from(shareDirs).where(eq(shareDirs.folderId, id)),
  ]);

  const { html, fileName } = buildTocWordHtml(
    { name: folder.name, caseNumber: folder.caseNumber, court: folder.court, county: folder.county, plaintiff: folder.plaintiff, defendant: folder.defendant },
    dir,
    files,
    dirs.map((d) => d.path),
    new Date(),
  );

  // BOM + Word-formatted HTML — the same .doc technique the Document Generator
  // uses; opens in Microsoft Word fully formatted.
  return new NextResponse(`﻿${html}`, {
    headers: {
      "Content-Type": "application/msword",
      "Content-Disposition": `attachment; filename="${fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
