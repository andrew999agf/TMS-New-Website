import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { shareFiles } from "@/db/schema";
import { resolveDirLink, fileInDir, relToDir } from "@/lib/share/dir-link";
import { zipOrParts, parseFileIds, planZipParts } from "@/lib/share/zip";
import { logShareAccess } from "@/lib/share/access-log";

export const runtime = "nodejs";
export const maxDuration = 300;

/** ZIP of the linked directory's subtree — everything, or ?ids=1,2,3 for the
 *  checked files. Paths inside the ZIP are relative to the linked directory. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const { token } = await params;
  const link = await resolveDirLink(token);
  if (!link) return NextResponse.json({ error: "This link is no longer active." }, { status: 404 });

  const idFilter = parseFileIds(new URL(req.url).searchParams.get("ids"));
  let files = (await db.select().from(shareFiles).where(eq(shareFiles.folderId, link.folderId)))
    .filter((f) => fileInDir(f.filename, link.dirPath));
  if (idFilter) files = files.filter((f) => idFilter.has(f.id));
  if (files.length === 0) return NextResponse.json({ error: "No documents to download." }, { status: 404 });
  {
    const partsPlanned = planZipParts(files.map((f) => ({ url: f.url, name: f.filename, size: f.sizeBytes }))).length;
    const part = Number(new URL(req.url).searchParams.get("part")) || 0;
    if (partsPlanned <= 1 || part > 0) {
      await logShareAccess(req, { folderId: link.folderId, action: "zip", meta: { scope: idFilter ? "selected" : "dir", files: files.length, bytes: files.reduce((n, f) => n + (f.sizeBytes ?? 0), 0), ids: files.slice(0, 200).map((f) => f.id), via: "dir-link", dir: link.dirPath, ...(part > 0 ? { part, parts: partsPlanned } : {}) } });
    }
  }

  const dirName = link.dirPath ? link.dirPath.split("/").pop()! : link.folderName || "documents";
  const zipName = `${dirName.replace(/[\\/:*?"<>|]/g, "-")}${idFilter ? " - selected" : ""}.zip`;
  return zipOrParts(req, files.map((f) => ({ url: f.url, name: relToDir(f.filename, link.dirPath), size: f.sizeBytes })), zipName);
}
