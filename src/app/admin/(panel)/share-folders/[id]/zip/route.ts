import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { shareFolders, shareFiles } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { zipResponse } from "@/lib/share/zip";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Admin "Download all" for a share folder. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/share-folders", session.role, session.permissions)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [folder] = await db.select().from(shareFolders).where(eq(shareFolders.id, id));
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Optional ?ids=1,2,3 restricts the ZIP to the selected files.
  const idSet = new Set((new URL(req.url).searchParams.get("ids") ?? "").split(",").map((s) => Number(s.trim())).filter(Number.isFinite));
  let files = await db.select().from(shareFiles).where(eq(shareFiles.folderId, id));
  if (idSet.size > 0) files = files.filter((f) => idSet.has(f.id));
  if (files.length === 0) return NextResponse.json({ error: "No documents to download." }, { status: 404 });
  const zipName = `${(folder.name || "documents").replace(/[\\/:*?"<>|]/g, "-")}.zip`;
  return zipResponse(files.map((f) => ({ url: f.url, name: f.filename })), zipName);
}
