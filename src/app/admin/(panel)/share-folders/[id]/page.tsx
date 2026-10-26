import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminShell";
import { ShareFolderDetail, type FolderData, type FileRow, type RecipientRow, type ActivitySummary } from "@/components/admin/ShareFolderDetail";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/db";
import { shareFolders, shareFiles, shareRecipients, shareDirs, timeMatters, portalUsers, intakeSubmissions, shareAccessLog } from "@/db/schema";
import { describeAccess } from "@/lib/share/access-describe";
import { asc, desc, eq } from "drizzle-orm";
import { isBlobConfigured } from "@/lib/blob";
import { normalizeMeta } from "@/lib/share/types";
import { ensureDiscoveryTables } from "@/db/ensure";
import { getPackage, summarize } from "@/lib/share/package";
import type { MatterOption } from "@/components/admin/MatterCombobox";

export const dynamic = "force-dynamic";
// Preparing a download package starts packing in the background of the
// request that asked for it; give it room before the sweep takes over.
export const maxDuration = 300;

export default async function ShareFolderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  // Runs the one-time backfills (per-file links on by default) before the folder renders.
  await ensureDiscoveryTables().catch(() => {});
  const { id } = await params;
  const fid = Number(id);
  if (!db || !Number.isFinite(fid)) notFound();

  const [folder] = await db.select().from(shareFolders).where(eq(shareFolders.id, fid));
  if (!folder) notFound();

  const files = await db.select().from(shareFiles).where(eq(shareFiles.folderId, fid)).orderBy(desc(shareFiles.createdAt));
  const pkg = summarize(await getPackage(fid).catch(() => null), files.map((f) => ({ id: f.id, filename: f.filename, url: f.url, sizeBytes: f.sizeBytes })));
  const recipients = await db.select().from(shareRecipients).where(eq(shareRecipients.folderId, fid)).orderBy(asc(shareRecipients.invitedAt));
  const dirRows = await db.select({ path: shareDirs.path, createdBy: shareDirs.createdBy, createdAt: shareDirs.createdAt }).from(shareDirs).where(eq(shareDirs.folderId, fid));
  const dirs = dirRows.map((d) => d.path);

  // Resolve an uploader/creator email to a display name. A folder recipient shows
  // their own name (or email); anyone else — i.e. firm staff — shows as "admin".
  const recipNames = new Map(recipients.map((r) => [r.email.toLowerCase(), r.name?.trim() || r.email]));
  const who = (email?: string | null): string => {
    const e = (email ?? "").trim().toLowerCase();
    if (!e) return "";
    return recipNames.get(e) ?? "admin";
  };
  const dirInfo: Record<string, { by?: string; at?: string }> = {};
  for (const d of dirRows) dirInfo[d.path] = { by: who(d.createdBy), at: d.createdAt.toISOString() };

  // Firm-wide contact book for the invite autocomplete, ranked by how often
  // each person has been invited; names come from the portal-user directory.
  const allInvites = await db.select({ email: shareRecipients.email, name: shareRecipients.name }).from(shareRecipients);
  const pu = await db.select({ email: portalUsers.email, name: portalUsers.name }).from(portalUsers);
  // Also remember people from intake submissions (clients who've typed in their info).
  const intakePeople = await db.select({ email: intakeSubmissions.email, name: intakeSubmissions.name }).from(intakeSubmissions);
  const freq = new Map<string, number>();
  const nameOf = new Map<string, string>();
  for (const r of allInvites) { freq.set(r.email, (freq.get(r.email) ?? 0) + 1); if (r.name && !nameOf.get(r.email)) nameOf.set(r.email, r.name); }
  for (const p of intakePeople) { const em = (p.email ?? "").trim().toLowerCase(); if (!em) continue; freq.set(em, (freq.get(em) ?? 0) + 1); if (p.name && !nameOf.get(em)) nameOf.set(em, p.name); }
  for (const u of pu) { if (u.name) nameOf.set(u.email, u.name); if (!freq.has(u.email)) freq.set(u.email, 0); }
  const contacts = [...freq.entries()]
    .map(([email, count]) => ({ email, name: nameOf.get(email) ?? "", count }))
    .sort((a, b) => b.count - a.count || a.email.localeCompare(b.email))
    .slice(0, 500)
    .map(({ email, name }) => ({ email, name }));
  const matters: MatterOption[] = (await db.select().from(timeMatters).orderBy(asc(timeMatters.sort))).map((m) => ({ displayNumber: m.displayNumber, description: m.description }));

  const data: FolderData = {
    id: folder.id,
    caseNumber: folder.caseNumber,
    name: folder.name,
    matter: folder.matter,
    court: folder.court,
    county: folder.county,
    plaintiff: folder.plaintiff,
    defendant: folder.defendant,
    type: folder.type,
    notes: folder.notes ?? "",
    meta: normalizeMeta(folder.meta),
    requireAuth: folder.requireAuth,
    archived: folder.archived,
  };
  const fileRows: FileRow[] = files.map((f) => ({
    id: f.id,
    url: f.url,
    filename: f.filename,
    contentType: f.contentType,
    sizeBytes: f.sizeBytes,
    createdAt: f.createdAt.toISOString(),
    by: who(f.uploadedBy),
  }));
  // Recipient activity — the firm's internal record (see the Activity card).
  const logRows = await db.select().from(shareAccessLog).where(eq(shareAccessLog.folderId, fid)).orderBy(desc(shareAccessLog.at)).limit(2000).catch(() => []);
  const fileNameById = new Map(files.map((f) => [f.id, f.filename]));
  const recNameById = new Map(recipients.map((r) => [r.id, r.name || r.email]));
  const tally = { views: 0, previews: 0, downloads: 0, zips: 0, uploads: 0 };
  const byRecipient = new Map<number, { downloads: number; zips: number; previews: number; views: number; lastAt: string | null }>();
  for (const r of logRows) {
    if (r.action === "view") tally.views++; else if (r.action === "preview") tally.previews++; else if (r.action === "download") tally.downloads++; else if (r.action === "zip") tally.zips++; else if (r.action === "upload") tally.uploads++;
    if (r.recipientId) {
      const t = byRecipient.get(r.recipientId) ?? { downloads: 0, zips: 0, previews: 0, views: 0, lastAt: null };
      if (r.action === "download") t.downloads++; else if (r.action === "zip") t.zips++; else if (r.action === "preview") t.previews++; else if (r.action === "view") t.views++;
      if (!t.lastAt) t.lastAt = r.at.toISOString();
      byRecipient.set(r.recipientId, t);
    }
  }
  const lastDl = logRows.find((r) => r.action === "download" || r.action === "zip");
  const activity: ActivitySummary = {
    total: logRows.length,
    ...tally,
    lastDownload: lastDl ? { at: lastDl.at.toISOString(), who: lastDl.recipientId ? recNameById.get(lastDl.recipientId) ?? "" : "", what: describeAccess({ action: lastDl.action, meta: (lastDl.meta ?? {}) as Record<string, unknown>, fileName: lastDl.fileId ? fileNameById.get(lastDl.fileId) : undefined }).label } : null,
    recent: logRows.slice(0, 12).map((r) => {
      const d = describeAccess({ action: r.action, meta: (r.meta ?? {}) as Record<string, unknown>, fileName: r.fileId ? fileNameById.get(r.fileId) : undefined });
      return { at: r.at.toISOString(), who: r.recipientId ? recNameById.get(r.recipientId) ?? "" : d.via === "dir-link" ? "sub-folder link" : d.via === "file-link" ? "direct file link" : "", label: d.label, detail: [d.document, d.detail].filter(Boolean).join(" · ") };
    }),
    byRecipient: Object.fromEntries(byRecipient),
  };

  const recRows: RecipientRow[] = recipients.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    token: r.token,
    invitedAt: r.invitedAt.toISOString(),
    lastAccessAt: r.lastAccessAt ? r.lastAccessAt.toISOString() : null,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    permission: r.permission,
    kind: r.kind,
    requireAuth: r.requireAuth,
    revoked: r.revoked,
    aiReader: r.aiReader ?? false,
  }));

  return (
    <>
      <AdminHeader title="Share Folder" description="Manage the documents and the people who can see them." />
      <div className="p-6">
        <Link href="/admin/share-folders" className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">
          <ChevronLeft size={15} /> All folders
        </Link>
        <ShareFolderDetail folder={data} files={fileRows} recipients={recRows} dirs={dirs} dirInfo={dirInfo} matters={matters} contacts={contacts} blobReady={isBlobConfigured()} activity={activity} pkg={pkg} />
      </div>
    </>
  );
}
