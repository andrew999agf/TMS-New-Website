import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { shareFolders, shareFiles } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { buildLinkTreePdfs } from "@/lib/share/linktree";
import { comparePaths } from "@/lib/share/sort";
import { zipBuffers } from "@/lib/share/zip";
import { normalizeMeta } from "@/lib/share/types";
import { FIRM } from "@/lib/firm";

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

  const sp = new URL(req.url).searchParams;
  const cap = Math.min(2000, Math.max(100, Number(sp.get("cap")) || 750));

  // Stamp firm URLs, never the storage URL. A Blob URL is public and permanent —
  // printing it into a document that gets emailed around would hand out
  // unrevocable access to the file.
  //   firm   → signed-in proxy on our domain (default)
  //   public → the folder's own per-file share links, when that's switched on
  const base = (process.env.NEXT_PUBLIC_SITE_URL || `https://${FIRM.domain}`).replace(/\/$/, "");
  const meta = normalizeMeta(folder.meta);
  const token = meta.fileLinks && meta.publicToken ? meta.publicToken : null;
  const usePublic = sp.get("links") === "public" && !!token;
  const linkFor = (fileId: number) =>
    usePublic ? `${base}/share/f/${token}/${fileId}` : `${base}/admin/share-folders/${id}/file/${fileId}`;

  const parts = await buildLinkTreePdfs(
    files.map((f) => ({ filename: f.filename, url: f.url, linkUrl: linkFor(f.id), contentType: f.contentType })),
    cap,
  );

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
