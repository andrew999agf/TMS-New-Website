import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { shareFolders, shareFiles } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { zipResponse, parseFileIds } from "@/lib/share/zip";
import { cleanDirPath } from "@/lib/share/access";

export const runtime = "nodejs";
export const maxDuration = 300;

const safeName = (s: string) => (s || "documents").replace(/[\\/:*?"<>|]/g, "-");

/**
 * Admin "Download all" for a share folder.
 *
 * Optional filters, both absent meaning "everything":
 *   ?ids=1,2,3   just those files (used by "Download selected")
 *   ?dir=A/B     just that sub-folder and everything beneath it
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/share-folders", session.role, session.permissions)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [folder] = await db.select().from(shareFolders).where(eq(shareFolders.id, id));
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sp = new URL(req.url).searchParams;
  const idFilter = parseFileIds(sp.get("ids"));
  const dir = cleanDirPath(sp.get("dir") ?? "");

  let files = await db.select().from(shareFiles).where(eq(shareFiles.folderId, id));
  if (idFilter) files = files.filter((f) => idFilter.has(f.id));
  if (dir) {
    const prefix = `${dir}/`;
    files = files.filter((f) => f.filename.startsWith(prefix));
  }
  if (files.length === 0) {
    return NextResponse.json({ error: dir ? `Nothing to download in "${dir}".` : "No documents to download." }, { status: 404 });
  }

  // Scoped to a sub-folder: name the ZIP after it and make its entries relative,
  // so the archive opens as that folder rather than a chain of empty parents.
  const strip = dir ? dir.length + 1 : 0;
  const zipName = `${safeName(dir ? dir.split("/").pop()! : folder.name)}.zip`;
  return zipResponse(files.map((f) => ({ url: f.url, name: f.filename.slice(strip) })), zipName);
}
