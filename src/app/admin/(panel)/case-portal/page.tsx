import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminShell";
import { CasePortalGroups, type GroupRow, type SetupOption } from "@/components/admin/CasePortalGroups";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { db } from "@/db";
import { portalGroups, portalCompanies, portalMatters, portalRequests, portalMessages } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { ensureDiscoveryTables } from "@/db/ensure";
import { requestOverdue } from "@/lib/portal";
import { CLIENT_SETUPS } from "@/lib/portal-setups";

export const dynamic = "force-dynamic";

export default async function CasePortalPage() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/case-portal", session.role, session.permissions)) notFound();
  await ensureDiscoveryTables().catch(() => {});

  let groups: GroupRow[] = [];
  let needsSync = false;
  if (db) {
    try {
      const [gs, cs, ms] = await Promise.all([
        db.select().from(portalGroups).orderBy(asc(portalGroups.name)),
        db.select().from(portalCompanies).orderBy(asc(portalCompanies.sort), asc(portalCompanies.name)),
        db.select({ id: portalMatters.id, groupId: portalMatters.groupId, status: portalMatters.status, hidden: portalMatters.hidden }).from(portalMatters),
      ]);
      const [reqs, unread] = await Promise.all([
        db.select({ matterId: portalRequests.matterId, status: portalRequests.status, dueOn: portalRequests.dueOn }).from(portalRequests).where(eq(portalRequests.status, "open")).catch(() => [] as { matterId: number; status: string; dueOn: string }[]),
        db.select({ matterId: portalMessages.matterId }).from(portalMessages).where(and(eq(portalMessages.fromClient, true), eq(portalMessages.readByFirm, false))).catch(() => [] as { matterId: number }[]),
      ]);
      groups = gs.map((g) => {
        const mine = ms.filter((m) => m.groupId === g.id && !m.hidden);
        const ids = new Set(mine.filter((m) => m.status === "open").map((m) => m.id));
        const r = reqs.filter((x) => ids.has(x.matterId));
        return {
          id: g.id, name: g.name, archived: g.archived, kind: g.kind ?? "single", parentName: g.parentName ?? "",
          entities: cs.filter((c) => c.groupId === g.id).map((c) => c.name),
          open: ids.size, closed: mine.length - ids.size,
          openRequests: r.length, overdue: r.filter(requestOverdue).length, unread: unread.filter((u) => ids.has(u.matterId)).length,
        };
      });
    } catch {
      needsSync = true;
    }
  }
  // One-click set-ups not yet applied (a group with that name and matters already exists → hidden).
  const setups: SetupOption[] = (Object.entries(CLIENT_SETUPS) as [SetupOption["key"], (typeof CLIENT_SETUPS)[string]][])
    .filter(([, s]) => !groups.some((g) => g.name === s.group && g.open + g.closed > 0))
    .map(([key, s]) => ({ key, label: s.group, blurb: `${s.kind === "family" ? `multi-entity file, parent ${s.parentName}` : "single client file"} · ${s.companies.length} entit${s.companies.length === 1 ? "y" : "ies"} · ${s.matters.length} matters from the outline you provided` }));

  return (
    <>
      <AdminHeader
        title="Client Case Portal"
        description="One file per client relationship. A single client file holds one client's matters; a multi-entity file puts the parent person at the top with their companies, trusts and estates beneath — so you review and write to that client about everything at once. Each matter keeps its document requests, correspondence, documents, exhibits and a running time tally."
      />
      <div className="p-6 max-w-5xl">
        {needsSync && (
          <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
            This feature needs its database tables. Go to <strong>Settings → Database updates</strong> and run it once, then reload this page.
          </p>
        )}
        <CasePortalGroups groups={groups} setups={setups} />
      </div>
    </>
  );
}
