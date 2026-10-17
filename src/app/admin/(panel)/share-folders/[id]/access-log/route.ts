import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { shareFolders, shareFiles, shareRecipients, shareAccessLog } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { describeAccess } from "@/lib/share/access-describe";

export const runtime = "nodejs";

const csvCell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/**
 * The firm's own record of what each recipient did in a shared folder —
 * opened it, previewed a document, downloaded one, downloaded a ZIP (all /
 * selected / recent), uploaded — as a CSV. Internal only: recipients never
 * see it and nothing is emailed.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/share-folders", session.role, session.permissions)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [folder] = await db.select({ name: shareFolders.name, caseNumber: shareFolders.caseNumber }).from(shareFolders).where(eq(shareFolders.id, id));
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [rows, recipients, files] = await Promise.all([
    db.select().from(shareAccessLog).where(eq(shareAccessLog.folderId, id)).orderBy(desc(shareAccessLog.at)).limit(20000),
    db.select({ id: shareRecipients.id, email: shareRecipients.email, name: shareRecipients.name }).from(shareRecipients).where(eq(shareRecipients.folderId, id)),
    db.select({ id: shareFiles.id, filename: shareFiles.filename }).from(shareFiles).where(eq(shareFiles.folderId, id)),
  ]);
  const recById = new Map(recipients.map((r) => [r.id, r]));
  const fileById = new Map(files.map((f) => [f.id, f.filename]));

  const header = ["When (UTC)", "When (Central)", "Recipient", "Email", "Action", "Detail", "Document", "Documents", "Size (MB)", "Via", "IP address", "Browser"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    const rec = r.recipientId ? recById.get(r.recipientId) : null;
    const d = describeAccess({ action: r.action, meta: (r.meta ?? {}) as Record<string, unknown>, fileName: r.fileId ? fileById.get(r.fileId) : undefined });
    lines.push([
      r.at.toISOString(),
      r.at.toLocaleString("en-US", { timeZone: "America/Chicago" }),
      rec?.name ?? (rec ? "" : d.via === "dir-link" ? "(sub-folder link)" : d.via === "file-link" ? "(direct file link, not signed in)" : ""),
      rec?.email ?? "",
      d.label, d.detail, d.document, d.files ?? "", d.bytes != null ? (d.bytes / 1048576).toFixed(1) : "", d.viaLabel,
      r.ip ?? "", r.userAgent ?? "",
    ].map(csvCell).join(","));
  }
  const name = `Access log - ${folder.name.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80)} - ${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7E]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
