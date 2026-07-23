import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminShell";
import { ShareFolderDetail, type FolderData, type FileRow, type RecipientRow } from "@/components/admin/ShareFolderDetail";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/db";
import { shareFolders, shareFiles, shareRecipients, shareDirs, timeMatters } from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import { isBlobConfigured } from "@/lib/blob";
import { normalizeMeta } from "@/lib/share/types";
import type { MatterOption } from "@/components/admin/MatterCombobox";

export const dynamic = "force-dynamic";

export default async function ShareFolderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const fid = Number(id);
  if (!db || !Number.isFinite(fid)) notFound();

  const [folder] = await db.select().from(shareFolders).where(eq(shareFolders.id, fid));
  if (!folder) notFound();

  const files = await db.select().from(shareFiles).where(eq(shareFiles.folderId, fid)).orderBy(desc(shareFiles.createdAt));
  const recipients = await db.select().from(shareRecipients).where(eq(shareRecipients.folderId, fid)).orderBy(asc(shareRecipients.invitedAt));
  const dirs = (await db.select({ path: shareDirs.path }).from(shareDirs).where(eq(shareDirs.folderId, fid))).map((d) => d.path);
  const matters: MatterOption[] = (await db.select().from(timeMatters).orderBy(asc(timeMatters.sort))).map((m) => ({ displayNumber: m.displayNumber, description: m.description }));

  const data: FolderData = {
    id: folder.id,
    caseNumber: folder.caseNumber,
    name: folder.name,
    matter: folder.matter,
    court: folder.court,
    type: folder.type,
    notes: folder.notes ?? "",
    meta: normalizeMeta(folder.meta),
    archived: folder.archived,
  };
  const fileRows: FileRow[] = files.map((f) => ({
    id: f.id,
    url: f.url,
    filename: f.filename,
    contentType: f.contentType,
    sizeBytes: f.sizeBytes,
    createdAt: f.createdAt.toISOString(),
  }));
  const recRows: RecipientRow[] = recipients.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    token: r.token,
    invitedAt: r.invitedAt.toISOString(),
    lastAccessAt: r.lastAccessAt ? r.lastAccessAt.toISOString() : null,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    permission: r.permission,
    revoked: r.revoked,
  }));

  return (
    <>
      <AdminHeader title="Share Folder" description="Manage the documents and the people who can see them." />
      <div className="p-6">
        <Link href="/admin/share-folders" className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">
          <ChevronLeft size={15} /> All folders
        </Link>
        <ShareFolderDetail folder={data} files={fileRows} recipients={recRows} dirs={dirs} matters={matters} blobReady={isBlobConfigured()} />
      </div>
    </>
  );
}
