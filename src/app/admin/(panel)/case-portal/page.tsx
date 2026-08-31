import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminShell";
import { CasePortalGroups, type GroupRow } from "@/components/admin/CasePortalGroups";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { db } from "@/db";
import { portalGroups, portalCompanies, portalMatters } from "@/db/schema";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function CasePortalPage() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/case-portal", session.role, session.permissions)) notFound();

  let groups: GroupRow[] = [];
  let needsSync = false;
  if (db) {
    try {
      const [gs, cs, ms] = await Promise.all([
        db.select().from(portalGroups).orderBy(asc(portalGroups.name)),
        db.select().from(portalCompanies).orderBy(asc(portalCompanies.sort), asc(portalCompanies.name)),
        db.select({ id: portalMatters.id, groupId: portalMatters.groupId, status: portalMatters.status }).from(portalMatters),
      ]);
      groups = gs.map((g) => ({
        id: g.id,
        name: g.name,
        archived: g.archived,
        companies: cs.filter((c) => c.groupId === g.id).map((c) => c.name),
        open: ms.filter((m) => m.groupId === g.id && m.status === "open").length,
        closed: ms.filter((m) => m.groupId === g.id && m.status !== "open").length,
      }));
    } catch {
      needsSync = true;
    }
  }

  return (
    <>
      <AdminHeader
        title="Case Portal"
        description="Matter portals for select business clients — an enterprise group holds the client's companies, and each matter keeps its tasks, correspondence, documents, exhibits, and a running time tally in one place."
      />
      <div className="p-6 max-w-5xl">
        {needsSync && (
          <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
            This feature needs its database tables. Go to <strong>Settings → Database updates</strong> and run it once, then reload this page.
          </p>
        )}
        <CasePortalGroups groups={groups} />
      </div>
    </>
  );
}
