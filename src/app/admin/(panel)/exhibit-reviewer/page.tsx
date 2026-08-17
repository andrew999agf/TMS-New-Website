import { AdminHeader } from "@/components/admin/AdminShell";
import { ExhibitSets, type SetRow } from "@/components/admin/ExhibitSets";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { db } from "@/db";
import { exhibitSets, exhibitDocs, timeMatters } from "@/db/schema";
import { asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { MatterOption } from "@/components/admin/MatterCombobox";

export const dynamic = "force-dynamic";

export default async function ExhibitReviewerPage() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/exhibit-reviewer", session.role, session.permissions)) notFound();

  let sets: SetRow[] = [];
  let matters: MatterOption[] = [];
  let needsSync = false;

  if (db) {
    try {
      matters = (await db.select().from(timeMatters).orderBy(asc(timeMatters.sort))).map((m) => ({ displayNumber: m.displayNumber, description: m.description }));
    } catch {
      /* matters optional */
    }
    try {
      const rows = await db
        .select({ id: exhibitSets.id, name: exhibitSets.name, matter: exhibitSets.matter, causeNumber: exhibitSets.causeNumber, court: exhibitSets.court, archived: exhibitSets.archived })
        .from(exhibitSets);
      const docs = await db.select({ setId: exhibitDocs.setId, side: exhibitDocs.side }).from(exhibitDocs);
      sets = rows.map((s) => {
        const mine = docs.filter((d) => d.setId === s.id);
        return {
          ...s,
          total: mine.length,
          plaintiff: mine.filter((d) => d.side === "plaintiff").length,
          defendant: mine.filter((d) => d.side === "defendant").length,
        };
      });
    } catch {
      needsSync = true;
    }
  }

  return (
    <>
      <AdminHeader
        title="Exhibit Reviewer"
        description="Trial and hearing exhibit binders. Create a set for a case, drop the exhibit PDFs in, and review them in order — jump by number, search across the whole set or inside one exhibit, and flip through with the arrows."
      />
      <div className="p-6 max-w-5xl">
        {needsSync && (
          <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            This feature needs its database tables. Go to <strong>Settings → Database updates</strong> and run it once, then reload this page.
          </p>
        )}
        <ExhibitSets sets={sets} matters={matters} />
      </div>
    </>
  );
}
