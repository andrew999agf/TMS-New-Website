import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { shareFolders, shareFiles } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { buildLinkTreePdfs } from "@/lib/share/linktree";
import { comparePaths } from "@/lib/share/sort";
import { zipBuffers } from "@/lib/share/zip";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Build the combined, footer-stamped "link tree" PDF for a folder's documents.
 *  Returns a single PDF, or a ZIP of parts when the page cap is exceeded. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/share-folders", session.role, session.permissions)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [folder] = await db.select().from(shareFolders).where(eq(shareFolders.id, id));
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rows = await db.select().from(shareFiles).where(eq(shareFiles.folderId, id));
  if (rows.length === 0) return NextResponse.json({ error: "No documents to compile." }, { status: 404 });
  // Natural alphanumeric path order, matching the folder tree and the CSV.
  // (SQL's plain ORDER BY would put "Exhibit 10" ahead of "Exhibit 2".)
  const files = [...rows].sort((a, b) => comparePaths(a.filename, b.filename));

  const cap = Math.min(2000, Math.max(100, Number(new URL(req.url).searchParams.get("cap")) || 750));
  const parts = await buildLinkTreePdfs(files.map((f) => ({ filename: f.filename, url: f.url, contentType: f.contentType })), cap);

  const stem = (folder.name || "documents").replace(/[\\/:*?"<>|]/g, "-");
  if (parts.length === 1) {
    return new NextResponse(new Uint8Array(parts[0]), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${stem} - link tree.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return zipBuffers(parts.map((data, i) => ({ name: `${stem} - link tree - part ${pad(i + 1)} of ${pad(parts.length)}.pdf`, data })), `${stem} - link tree.zip`);
}
