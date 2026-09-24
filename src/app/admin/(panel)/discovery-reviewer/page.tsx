import { AdminHeader } from "@/components/admin/AdminShell";
import { DiscoverySets, type DiscoverySetRow } from "@/components/admin/DiscoverySets";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { db } from "@/db";
import { discoverySets, discoveryDocs, discoveryMarks, exhibitSets, timeMatters } from "@/db/schema";
import { ensureDiscoveryTables } from "@/db/ensure";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { MatterOption } from "@/components/admin/MatterCombobox";

export const dynamic = "force-dynamic";

export default async function DiscoveryReviewerPage() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/discovery-reviewer", session.role, session.permissions)) notFound();

  let sets: DiscoverySetRow[] = [];
  let matters: MatterOption[] = [];
  let exhibitMatters: string[] = [];

  if (db) {
    await ensureDiscoveryTables();
    try {
      matters = (await db.select().from(timeMatters).orderBy(asc(timeMatters.sort))).map((m) => ({ displayNumber: m.displayNumber, description: m.description }));
    } catch {
      /* matters optional */
    }
    try {
      const rows = await db.select().from(discoverySets);
      const docs = await db.select({ setId: discoveryDocs.setId, pageCount: discoveryDocs.pageCount }).from(discoveryDocs);
      const marks = await db.select({ setId: discoveryMarks.setId, party: discoveryMarks.party }).from(discoveryMarks);
      exhibitMatters = (await db.select({ matter: exhibitSets.matter }).from(exhibitSets).where(eq(exhibitSets.archived, false)))
        .map((r) => r.matter).filter(Boolean);
      sets = rows.map((s) => {
        const mine = docs.filter((d) => d.setId === s.id);
        const myMarks = marks.filter((m) => m.setId === s.id);
        return {
          id: s.id, name: s.name, matter: s.matter, causeNumber: s.causeNumber, court: s.court, archived: s.archived,
          docs: mine.length,
          pages: mine.reduce((sum, d) => sum + (d.pageCount ?? 0), 0),
          plaintiff: myMarks.filter((m) => m.party === "P").length,
          defendant: myMarks.filter((m) => m.party === "D").length,
          linked: !!s.matter && exhibitMatters.includes(s.matter),
        };
      });
    } catch {
      /* ensure failed (no DDL rights): the sync button still covers it */
    }
  }

  return (
    <>
      <AdminHeader
        title="Discovery Reviewer"
        description="The other side's productions, reviewed page by page. Drop the Bates discovery in, check the pages you want, and save them straight to the case's exhibit set — the two tools stay linked by the Time Tracker matter number."
      />
      <div className="p-6 max-w-5xl">
        <DiscoverySets sets={sets} matters={matters} exhibitMatters={exhibitMatters} />
      </div>
    </>
  );
}
