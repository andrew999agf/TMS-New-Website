import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminShell";
import { CasePortalMatter, type MatterData, type TaskRow, type MessageRow, type DocRow, type TimeData, type RequestRow, type ViewerRow } from "@/components/admin/CasePortalMatter";
import { ensureDiscoveryTables } from "@/db/ensure";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { db } from "@/db";
import { portalGroups, portalCompanies, portalMatters, portalTasks, portalMessages, portalDocs, portalRequests, portalMembers, portalMemberMatters, timeEntries, exhibitSets, shareFolders } from "@/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { isBlobConfigured } from "@/lib/blob";
import type { MatterOption } from "@/components/admin/MatterCombobox";
import { timeMatters } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function CasePortalMatterPage({ params }: { params: Promise<{ groupId: string; matterId: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/case-portal", session.role, session.permissions)) notFound();
  const groupId = Number((await params).groupId);
  const matterId = Number((await params).matterId);
  if (!Number.isFinite(groupId) || !Number.isFinite(matterId) || !db) notFound();
  await ensureDiscoveryTables().catch(() => {});

  const [m] = await db.select().from(portalMatters).where(eq(portalMatters.id, matterId));
  if (!m || m.groupId !== groupId) notFound();
  const [group] = await db.select().from(portalGroups).where(eq(portalGroups.id, groupId));
  if (!group) notFound();

  const [companies, tasks, messages, docs, clioMatters, folders, requests, members, grants] = await Promise.all([
    db.select().from(portalCompanies).where(eq(portalCompanies.groupId, groupId)).orderBy(asc(portalCompanies.name)),
    db.select().from(portalTasks).where(eq(portalTasks.matterId, matterId)).orderBy(asc(portalTasks.done), desc(portalTasks.createdAt)),
    db.select().from(portalMessages).where(eq(portalMessages.matterId, matterId)).orderBy(asc(portalMessages.createdAt)),
    db.select().from(portalDocs).where(eq(portalDocs.matterId, matterId)).orderBy(desc(portalDocs.createdAt)),
    db.select().from(timeMatters).orderBy(asc(timeMatters.sort)),
    db.select({ id: shareFolders.id, name: shareFolders.name, caseNumber: shareFolders.caseNumber }).from(shareFolders).where(eq(shareFolders.archived, false)).orderBy(asc(shareFolders.name)),
    db.select().from(portalRequests).where(eq(portalRequests.matterId, matterId)).orderBy(asc(portalRequests.sort), asc(portalRequests.id)).catch(() => []),
    db.select().from(portalMembers).where(eq(portalMembers.groupId, groupId)).orderBy(asc(portalMembers.createdAt)).catch(() => []),
    db.select({ memberId: portalMemberMatters.memberId }).from(portalMemberMatters).where(eq(portalMemberMatters.matterId, matterId)).catch(() => [] as { memberId: number }[]),
  ]);
  const grantedIds = new Set(grants.map((g) => g.memberId));
  const viewerRows: ViewerRow[] = members.map((x) => ({ id: x.id, email: x.email, name: x.name, revoked: x.revoked, added: grantedIds.has(x.id), lastAccessAt: x.lastAccessAt ? x.lastAccessAt.toISOString() : null }));
  // Which client messages were unread when this page opened (shown as NEW),
  // then mark them read — the firm has now seen them.
  const unreadIds = new Set(messages.filter((x) => x.fromClient && !x.readByFirm).map((x) => x.id));
  if (unreadIds.size) await db.update(portalMessages).set({ readByFirm: true }).where(and(eq(portalMessages.matterId, matterId), eq(portalMessages.fromClient, true), eq(portalMessages.readByFirm, false))).catch(() => {});

  // ---- Time: the running tally, read straight from the tracker's entries ----
  // (active AND archived — archiving in the tracker never erases this record).
  let time: TimeData = { monthHours: 0, monthAmount: 0, totalHours: 0, totalAmount: 0, monthLabel: "", entries: [] };
  if (m.clioMatter) {
    const rows = await db.select().from(timeEntries).where(eq(timeEntries.matter, m.clioMatter)).orderBy(desc(timeEntries.entryDate), desc(timeEntries.id));
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let mh = 0, ma = 0, th = 0, ta = 0;
    for (const r of rows) {
      const amt = r.nonBillable ? 0 : r.price * r.quantity;
      th += r.quantity; ta += amt;
      if (r.entryDate.startsWith(monthKey)) { mh += r.quantity; ma += amt; }
    }
    time = {
      monthHours: Math.round(mh * 100) / 100,
      monthAmount: Math.round(ma * 100) / 100,
      totalHours: Math.round(th * 100) / 100,
      totalAmount: Math.round(ta * 100) / 100,
      monthLabel: now.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      entries: rows.slice(0, 200).map((r) => ({
        id: r.id, date: r.entryDate, description: r.activityDescription, user: r.activityUserName,
        hours: r.quantity, amount: r.nonBillable ? 0 : Math.round(r.price * r.quantity * 100) / 100,
        nonBillable: r.nonBillable, archived: r.status === "archived",
      })),
    };
  }

  // Linked exhibit set (may have been deleted in the reviewer).
  let exhibitSetName: string | null = null;
  if (m.exhibitSetId) {
    const [s] = await db.select({ name: exhibitSets.name }).from(exhibitSets).where(eq(exhibitSets.id, m.exhibitSetId));
    exhibitSetName = s?.name ?? null;
  }

  const companyName = companies.find((c) => c.id === m.companyId)?.name ?? null;
  const data: MatterData = {
    id: m.id, groupId, groupName: group.name,
    title: m.title, clioMatter: m.clioMatter, posture: m.posture, status: m.status, notes: m.notes, driveFolder: m.driveFolder ?? "",
    companyId: m.companyId, companyName,
    ownerLabel: companyName ?? (group.kind === "family" ? `${group.parentName || "Parent"} — personal` : group.name),
    exhibitSetId: m.exhibitSetId, exhibitSetName, shareFolderId: m.shareFolderId,
  };
  const taskRows: TaskRow[] = tasks.map((t) => ({ id: t.id, kind: t.kind as "client" | "firm", title: t.title, done: t.done }));
  const messageRows: MessageRow[] = messages.map((x) => ({ id: x.id, author: x.author, fromClient: x.fromClient, body: x.body, createdAt: x.createdAt.toISOString(), unread: unreadIds.has(x.id) }));
  const docRows: DocRow[] = docs.map((d) => ({
    id: d.id, tab: d.tab, party: d.party, name: d.name, sizeBytes: d.sizeBytes,
    exhibitDocId: d.exhibitDocId, createdAt: d.createdAt.toISOString(), requestId: d.requestId ?? null,
  }));
  const requestRows: RequestRow[] = requests.map((r) => ({
    id: r.id, title: r.title, details: r.details, dueOn: r.dueOn, status: r.status, firmNote: r.firmNote,
    respondedAt: r.respondedAt ? r.respondedAt.toISOString() : null, remindedAt: r.remindedAt ? r.remindedAt.toISOString() : null,
    files: docs.filter((d) => d.requestId === r.id).map((d) => ({ id: d.id, name: d.name })),
  }));
  const matterOptions: MatterOption[] = clioMatters.map((x) => ({ displayNumber: x.displayNumber, description: x.description }));

  return (
    <>
      <AdminHeader title={m.title} description={[group.name, data.ownerLabel, m.clioMatter ? `Matter ${m.clioMatter}` : "", m.driveFolder ? `📁 ${m.driveFolder}` : ""].filter(Boolean).join("  ·  ")} />
      <div className="p-6 max-w-6xl space-y-4">
        <Link href={`/admin/case-portal/${groupId}`} className="inline-flex items-center gap-1 text-sm text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]">
          <ChevronLeft size={15} /> {group.name}
        </Link>
        <CasePortalMatter
          matter={data}
          companies={companies.map((c) => ({ id: c.id, name: c.name }))}
          tasks={taskRows}
          messages={messageRows}
          docs={docRows}
          requests={requestRows}
          viewers={viewerRows}
          time={time}
          clioMatters={matterOptions}
          shareFolders={folders}
          blobReady={isBlobConfigured()}
          me={session.email}
        />
      </div>
    </>
  );
}
