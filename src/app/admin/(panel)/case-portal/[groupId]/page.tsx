import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminShell";
import { CasePortalGroup, type CompanyRow, type MatterRow, type MemberRow, type GroupProfile, type OverviewData } from "@/components/admin/CasePortalGroup";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { db } from "@/db";
import { portalGroups, portalCompanies, portalMatters, portalTasks, portalMembers, portalRequests, portalMessages, timeMatters } from "@/db/schema";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { ensureDiscoveryTables } from "@/db/ensure";
import { requestOverdue } from "@/lib/portal";
import type { MatterOption } from "@/components/admin/MatterCombobox";

export const dynamic = "force-dynamic";

export default async function CasePortalGroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/case-portal", session.role, session.permissions)) notFound();
  const groupId = Number((await params).groupId);
  if (!Number.isFinite(groupId) || !db) notFound();
  await ensureDiscoveryTables().catch(() => {});

  const [group] = await db.select().from(portalGroups).where(eq(portalGroups.id, groupId));
  if (!group) notFound();

  const [companies, matters, clioMatters, members] = await Promise.all([
    db.select().from(portalCompanies).where(eq(portalCompanies.groupId, groupId)).orderBy(asc(portalCompanies.sort), asc(portalCompanies.name)),
    db.select().from(portalMatters).where(eq(portalMatters.groupId, groupId)).orderBy(asc(portalMatters.title)),
    db.select().from(timeMatters).orderBy(asc(timeMatters.sort)),
    db.select().from(portalMembers).where(eq(portalMembers.groupId, groupId)).orderBy(asc(portalMembers.createdAt)).catch(() => []),
  ]);
  const ids = matters.map((m) => m.id);
  const [taskRows, reqRows, unreadRows] = ids.length
    ? await Promise.all([
        db.select({ id: portalTasks.id, matterId: portalTasks.matterId, kind: portalTasks.kind, title: portalTasks.title, done: portalTasks.done }).from(portalTasks).where(inArray(portalTasks.matterId, ids)),
        db.select().from(portalRequests).where(inArray(portalRequests.matterId, ids)).orderBy(asc(portalRequests.dueOn), asc(portalRequests.id)).catch(() => []),
        db.select().from(portalMessages).where(and(inArray(portalMessages.matterId, ids), eq(portalMessages.fromClient, true), eq(portalMessages.readByFirm, false))).orderBy(desc(portalMessages.createdAt)).catch(() => []),
      ])
    : [[], [], []];
  const titleOf = new Map(matters.map((m) => [m.id, m.title]));
  const openVisible = new Set(matters.filter((m) => m.status === "open" && !m.hidden).map((m) => m.id));

  const profile: GroupProfile = { id: group.id, name: group.name, kind: group.kind ?? "single", parentName: group.parentName ?? "", parentContact: group.parentContact ?? "", notes: group.notes, clientCanCreateMatters: group.clientCanCreateMatters ?? false };
  const companyRows: CompanyRow[] = companies.map((c) => ({ id: c.id, name: c.name, kind: c.kind ?? "company", aka: c.aka ?? "", notes: c.notes ?? "" }));
  const matterRows: MatterRow[] = matters.map((m) => {
    const r = reqRows.filter((x) => x.matterId === m.id && x.status === "open");
    return {
      id: m.id, title: m.title, companyId: m.companyId, companyName: companies.find((c) => c.id === m.companyId)?.name ?? null,
      clioMatter: m.clioMatter, posture: m.posture, status: m.status, hidden: m.hidden ?? false, driveFolder: m.driveFolder ?? "",
      openTasks: taskRows.filter((t) => t.matterId === m.id && t.kind === "client" && !t.done).length,
      firmTasks: taskRows.filter((t) => t.matterId === m.id && t.kind === "firm" && !t.done).length,
      openRequests: r.length, overdueRequests: r.filter(requestOverdue).length,
      unread: unreadRows.filter((u) => u.matterId === m.id).length,
    };
  });
  const overview: OverviewData = {
    requests: reqRows.filter((r) => openVisible.has(r.matterId) && (r.status === "open" || r.status === "received")).map((r) => ({ id: r.id, matterId: r.matterId, matterTitle: titleOf.get(r.matterId) ?? "", title: r.title, dueOn: r.dueOn, status: r.status })),
    unread: unreadRows.filter((u) => openVisible.has(u.matterId)).map((u) => ({ id: u.id, matterId: u.matterId, matterTitle: titleOf.get(u.matterId) ?? "", author: u.author, body: u.body, createdAt: u.createdAt.toISOString() })),
    clientTasks: taskRows.filter((t) => openVisible.has(t.matterId) && t.kind === "client" && !t.done).map((t) => ({ id: t.id, matterId: t.matterId, matterTitle: titleOf.get(t.matterId) ?? "", title: t.title })),
    firmTasks: taskRows.filter((t) => openVisible.has(t.matterId) && t.kind === "firm" && !t.done).map((t) => ({ id: t.id, matterId: t.matterId, matterTitle: titleOf.get(t.matterId) ?? "", title: t.title })),
  };
  const matterOptions: MatterOption[] = clioMatters.map((m) => ({ displayNumber: m.displayNumber, description: m.description }));
  const memberRows: MemberRow[] = members.map((x) => ({ id: x.id, email: x.email, name: x.name, token: x.token, revoked: x.revoked, lastAccessAt: x.lastAccessAt ? x.lastAccessAt.toISOString() : null }));

  const family = profile.kind === "family";
  return (
    <>
      <AdminHeader title={group.name} description={family ? `Multi-entity client file · parent ${profile.parentName || "—"} · ${companies.length ? companies.map((c) => c.name).join("  ·  ") : "no entities yet"}` : `Single client file${companies.length ? ` · ${companies.map((c) => c.name).join("  ·  ")}` : ""}`} />
      <div className="p-6 max-w-5xl space-y-4">
        <Link href="/admin/case-portal" className="inline-flex items-center gap-1 text-sm text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]">
          <ChevronLeft size={15} /> All client files
        </Link>
        <CasePortalGroup group={profile} companies={companyRows} matters={matterRows} clioMatters={matterOptions} members={memberRows} overview={overview} />
      </div>
    </>
  );
}
