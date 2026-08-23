import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { shareFolders, shareFiles, shareDirs } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { cleanDirPath } from "@/lib/share/access";
import { buildTocModel, tocToDocx, tocToPdf, tocFileBase } from "@/lib/share/toc";

export const runtime = "nodejs";

const disposition = (mode: "attachment" | "inline", fileName: string) =>
  `${mode}; filename="${fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;

/**
 * Table of contents for a share folder, litigation-grade.
 *   ?dir=A/B     scope to that sub-folder (and everything beneath it)
 *   ?fmt=docx    modern Word file (default) · ?fmt=pdf for a PDF
 *   ?clean=1     tidy file names into title-cased document descriptions
 * Texas-pleading caption from the folder's cause number / court / county /
 * parties; fill-in blanks where those aren't set.
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
  const dir = cleanDirPath(sp.get("dir") ?? "");
  const fmt = sp.get("fmt") === "pdf" ? "pdf" : "docx";
  const clean = sp.get("clean") === "1";

  const [files, dirs] = await Promise.all([
    db.select({ filename: shareFiles.filename, createdAt: shareFiles.createdAt }).from(shareFiles).where(eq(shareFiles.folderId, id)),
    db.select({ path: shareDirs.path }).from(shareDirs).where(eq(shareDirs.folderId, id)),
  ]);

  const model = buildTocModel(
    { name: folder.name, caseNumber: folder.caseNumber, court: folder.court, county: folder.county, plaintiff: folder.plaintiff, defendant: folder.defendant },
    dir,
    files,
    dirs.map((d) => d.path),
    new Date(),
    clean,
  );
  const base = tocFileBase(model);

  if (fmt === "pdf") {
    const bytes = await tocToPdf(model);
    // Inline so it opens right in the browser tab (phones included).
    return new NextResponse(Buffer.from(bytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": disposition("inline", `${base}.pdf`), "Cache-Control": "private, no-store" },
    });
  }

  const buf = await tocToDocx(model);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": disposition("attachment", `${base}.docx`),
      "Cache-Control": "private, no-store",
    },
  });
}
