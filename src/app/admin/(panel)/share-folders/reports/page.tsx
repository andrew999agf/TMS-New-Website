import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminShell";
import { ShareReports, type ReportRow } from "@/components/admin/ShareReports";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/db";
import { shareReports } from "@/db/schema";
import { desc } from "drizzle-orm";
import { getSetting } from "@/lib/content";
import { SHARE_REPORT_KEY, SHARE_REPORT_DEFAULT, type ShareReportConfig } from "@/lib/share/reports-config";

export const dynamic = "force-dynamic";

export default async function ShareReportsPage() {
  await requireAdmin();
  let rows: ReportRow[] = [];
  let cfg: ShareReportConfig = SHARE_REPORT_DEFAULT;
  if (db) {
    try {
      cfg = await getSetting<ShareReportConfig>(SHARE_REPORT_KEY, SHARE_REPORT_DEFAULT);
      const reports = await db.select().from(shareReports).orderBy(desc(shareReports.createdAt));
      rows = reports.map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        pdfUrl: r.pdfUrl,
        summary: (r.summary ?? {}) as Record<string, unknown>,
        archived: r.archived,
        createdAt: r.createdAt.toISOString(),
      }));
    } catch {
      /* run Database updates first */
    }
  }

  return (
    <>
      <AdminHeader title="Share Folder Reports" description="Automated reviews of drop folders, to-do tasks, and uploaded documents." />
      <div className="p-6">
        <Link href="/admin/share-folders" className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">
          <ChevronLeft size={15} /> All folders
        </Link>
        <ShareReports config={cfg} reports={rows} />
      </div>
    </>
  );
}
