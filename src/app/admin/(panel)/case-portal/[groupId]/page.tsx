import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminShell";
import { CasePortalGroup, type CompanyRow, type MatterRow, type MemberRow } from "@/components/admin/CasePortalGroup";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { db } from "@/db";
import { portalGroups, portalCompanies, portalMatters, portalTasks, portalMembers, timeMatters } from "@/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import type { MatterOption } from "@/components/admin/MatterCombobox";

export const dynamic = "force-dynamic";

export default async function CasePortalGroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/case-portal", session.role, session.permissions)) notFound();
  const groupId = Number((await params).groupId);
  if (!Number.isFinite(groupId) || !db) notFound();

  const [group] = await db.select().from(portalGroups).where(eq(portalGroups.id, groupId));
  if (!group) notFound();

  const [companies, matters, clioMatters, members] = await Promise.all([
    db.select().from(portalCompanies).where(eq(portalCompanies.groupId, groupId)).orderBy(asc(portalCompanies.sort), asc(portalCompanies.name)),
    db.select().from(portalMatters).where(eq(portalMatters.groupId, groupId)).orderBy(asc(portalMatters.title)),
    db.select().from(timeMatters).orderBy(asc(timeMatters.sort)),
    db.select().from(portalMembers).where(eq(portalMembers.groupId, groupId)).orderBy(asc(portalMembers.createdAt)).catch(() => []),
  ]);
  // Open-task counts per matter, for the list badges.
  const taskRows = matters.length
    ? await db.select({ matterId: portalTasks.matterId, done: portalTasks.done }).from(portalTasks).where(inArray(portalTasks.matterId, matters.map((m) => m.id)))
    : [];

  const companyRows: CompanyRow[] = companies.map((c) => ({ id: c.id, name: c.name }));
  const matterRows: MatterRow[] = matters.map((m) => ({
    id: m.id,
    title: m.title,
    companyId: m.companyId,
    companyName: companies.find((c) => c.id === m.companyId)?.name ?? null,
    clioMatter: m.clioMatter,
    posture: m.posture,
    status: m.status,
    hidden: m.hidden ?? false,
    openTasks: taskRows.filter((t) => t.matterId === m.id && !t.done).length,
  }));
  const matterOptions: MatterOption[] = clioMatters.map((m) => ({ displayNumber: m.displayNumber, description: m.description }));
  const memberRows: MemberRow[] = members.map((x) => ({
    id: x.id, email: x.email, name: x.name, token: x.token, revoked: x.revoked,
    lastAccessAt: x.lastAccessAt ? x.lastAccessAt.toISOString() : null,
  }));

  return (
    <>
      <AdminHeader title={group.name} description={companies.length ? companies.map((c) => c.name).join("  ·  ") : "Enterprise group"} />
      <div className="p-6 max-w-5xl space-y-4">
        <Link href="/admin/case-portal" className="inline-flex items-center gap-1 text-sm text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]">
          <ChevronLeft size={15} /> All client groups
        </Link>
        <CasePortalGroup groupId={groupId} companies={companyRows} matters={matterRows} clioMatters={matterOptions} members={memberRows} />
      </div>
    </>
  );
}
