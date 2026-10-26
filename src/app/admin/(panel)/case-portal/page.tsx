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
import { setupTarget } from "./actions";

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
        db.select({ id: portalMatters.id, groupId: portalMatters.groupId, companyId: portalMatters.companyId, status: portalMatters.status, hidden: portalMatters.hidden }).from(portalMatters),
      ]);
      const [reqs, unread] = await Promise.all([
        db.select({ matterId: portalRequests.matterId, status: portalRequests.status, dueOn: portalRequests.dueOn }).from(portalRequests).where(eq(portalRequests.status, "open")).catch(() => [] as { matterId: number; status: string; dueOn: string }[]),
        db.select({ matterId: portalMessages.matterId }).from(portalMessages).where(and(eq(portalMessages.fromClient, true), eq(portalMessages.readByFirm, false))).catch(() => [] as { matterId: number }[]),
      ]);
      groups = gs.map((g) => {
        const mine = ms.filter((m) => m.groupId === g.id && !m.hidden);
        const ids = new Set(mine.filter((m) => m.status === "open").map((m) => m.id));
        const r = reqs.filter((x) => ids.has(x.matterId));
        const ents = cs.filter((c) => c.groupId === g.id);
        return {
          id: g.id, name: g.name, archived: g.archived,
          // A file holding entities is a multi-entity file whatever an older row says.
          kind: ents.length ? "family" : (g.kind ?? "single"), parentName: g.parentName ?? "",
          entities: ents.map((c) => ({ name: c.name, kind: c.kind ?? "company", open: mine.filter((m) => m.companyId === c.id && m.status === "open").length })),
          personalOpen: mine.filter((m) => m.companyId == null && m.status === "open").length,
          open: ids.size, closed: mine.length - ids.size,
          openRequests: r.length, overdue: r.filter(requestOverdue).length, unread: unread.filter((u) => ids.has(u.matterId)).length,
        };
      });
    } catch {
      needsSync = true;
    }
  }
  // One-click set-ups with matters still missing. Each says where it will land:
  // an existing file that already holds some of the outline's Clio numbers, or a new file.
  const setups: SetupOption[] = [];
  for (const [key, s] of Object.entries(CLIENT_SETUPS) as [SetupOption["key"], (typeof CLIENT_SETUPS)[string]][]) {
    const t = await setupTarget(key).catch(() => null);
    if (!t || t.missing === 0) continue;
    setups.push({
      key, label: s.group,
      blurb: t.groupId
        ? `adds the ${t.missing} matter${t.missing === 1 ? "" : "s"} not yet on your existing file "${t.groupName}" (${t.total - t.missing} of ${t.total} already there), fills in entities, and marks it a multi-entity file with ${s.parentName} as the parent`
        : `new multi-entity file, parent ${s.parentName} · ${s.companies.length} entit${s.companies.length === 1 ? "y" : "ies"} · ${s.matters.length} matters from the outline you provided`,
      action: t.groupId ? `Add to "${t.groupName}"` : "Set it up",
    });
  }

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
