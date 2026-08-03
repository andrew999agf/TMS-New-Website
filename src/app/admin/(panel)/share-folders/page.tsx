import Link from "next/link";
import { FileBarChart, Users } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminShell";
import { ShareFoldersList, type FolderRow } from "@/components/admin/ShareFoldersList";
import { ShareLeadTeamManager } from "@/components/admin/ShareLeadTeamManager";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/db";
import { shareFolders, shareFiles, shareRecipients, timeMatters, admins } from "@/db/schema";
import { asc, desc, eq, sql } from "drizzle-orm";
import { isBlobConfigured } from "@/lib/blob";
import { getSetting } from "@/lib/content";
import { SHARE_LEAD_TEAM_KEY, SHARE_LEAD_TEAM_DEFAULT } from "@/lib/share/settings";
import type { MatterOption } from "@/components/admin/MatterCombobox";

export const dynamic = "force-dynamic";

export default async function ShareFoldersPage() {
  await requireAdmin();
  let folders: FolderRow[] = [];
  let matters: MatterOption[] = [];
  if (db) {
    try {
      matters = (await db.select().from(timeMatters).orderBy(asc(timeMatters.sort))).map((m) => ({ displayNumber: m.displayNumber, description: m.description }));
      // Select only the columns the list needs, so newer columns that haven't
      // been created yet (before a Database Sync) can't make the list go blank.
      const rows = await db
        .select({ id: shareFolders.id, caseNumber: shareFolders.caseNumber, name: shareFolders.name, matter: shareFolders.matter, court: shareFolders.court, type: shareFolders.type, archived: shareFolders.archived, updatedAt: shareFolders.updatedAt })
        .from(shareFolders)
        .orderBy(desc(shareFolders.updatedAt));
      const fc = await db.select({ fid: shareFiles.folderId, n: sql<number>`count(*)::int` }).from(shareFiles).groupBy(shareFiles.folderId);
      const rc = await db
        .select({ fid: shareRecipients.folderId, n: sql<number>`count(*)::int` })
        .from(shareRecipients)
        .where(eq(shareRecipients.revoked, false))
        .groupBy(shareRecipients.folderId);
      const files = new Map(fc.map((x) => [x.fid, x.n]));
      const recs = new Map(rc.map((x) => [x.fid, x.n]));
      folders = rows.map((f) => ({
        id: f.id,
        caseNumber: f.caseNumber,
        name: f.name,
        matter: f.matter,
        court: f.court,
        type: f.type,
        archived: f.archived,
        updatedAt: f.updatedAt.toISOString(),
        fileCount: files.get(f.id) ?? 0,
        recipientCount: recs.get(f.id) ?? 0,
      }));
    } catch {
      /* run Database updates first */
    }
  }

  const systemUsers = db
    ? (await db.select({ name: admins.name, email: admins.email }).from(admins).orderBy(asc(admins.name)).catch(() => [])).map((u) => ({ name: u.name ?? "", email: u.email }))
    : [];
  const leadTeam = await getSetting<string[]>(SHARE_LEAD_TEAM_KEY, SHARE_LEAD_TEAM_DEFAULT).catch(() => SHARE_LEAD_TEAM_DEFAULT);

  return (
    <>
      <AdminHeader
        title="Share Folders"
        description="Securely share case documents by email invitation — co-counsel, opposing counsel, clients, experts. Access is limited to the people you invite."
      />
      <div className="p-6">
        <div className="mb-4 flex justify-end">
          <Link href="/admin/share-folders/reports" className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-3 py-1.5 text-sm hover:bg-[var(--c-surface2)]">
            <FileBarChart size={15} /> Reports
          </Link>
        </div>
        {!isBlobConfigured() && (
          <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            File storage isn&apos;t connected yet. Folders and invites work, but uploading documents needs a Vercel Blob store on this project.
          </p>
        )}
        <ShareFoldersList folders={folders} matters={matters} />

        <section className="mt-8 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5">
          <h2 className="mb-1 inline-flex items-center gap-2 font-[family-name:var(--font-ui)] font-semibold">
            <Users size={16} className="text-[var(--c-accent)]" /> Lead team — notified when a client uploads
          </h2>
          <ShareLeadTeamManager users={systemUsers} initial={Array.isArray(leadTeam) ? leadTeam : SHARE_LEAD_TEAM_DEFAULT} />
        </section>
      </div>
    </>
  );
}
