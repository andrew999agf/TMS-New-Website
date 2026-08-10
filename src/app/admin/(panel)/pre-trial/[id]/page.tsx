import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Gavel } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminShell";
import { PreTrialChecklist, type DeadlineRow } from "@/components/admin/PreTrialChecklist";
import { PreTrialCaseHeader } from "@/components/admin/PreTrialCaseHeader";
import { PreTrialTabs } from "@/components/admin/PreTrialTabs";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/db";
import { trialCases, trialDeadlines, timeMatters, timeActivityUsers, timeCategories } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import type { MatterOption } from "@/components/admin/MatterCombobox";

export const dynamic = "force-dynamic";

export default async function PreTrialCasePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isFinite(id)) notFound();
  if (!db) notFound();

  const [row] = await db.select().from(trialCases).where(eq(trialCases.id, id));
  if (!row) notFound();

  const deadlines = await db.select().from(trialDeadlines).where(eq(trialDeadlines.caseId, id)).orderBy(asc(trialDeadlines.sort));
  const rows: DeadlineRow[] = deadlines.map((d) => ({
    id: d.id,
    parentId: d.parentId,
    assignee: d.assignee,
    title: d.title,
    dueDate: d.dueDate,
    done: d.done,
    doneAt: d.doneAt ? d.doneAt.toISOString() : null,
    doneBy: d.doneBy,
    notes: d.notes,
    sort: d.sort,
  }));

  let matters: MatterOption[] = [];
  try {
    matters = (await db.select().from(timeMatters).orderBy(asc(timeMatters.sort))).map((m) => ({ displayNumber: m.displayNumber, description: m.description }));
  } catch {
    /* optional */
  }

  // Assignees come from the Time Tracker's activity users — the firm's team.
  // Categories feed the "log time" box so an entry matches a normal one.
  let team: { name: string }[] = [];
  let categories: string[] = [];
  try {
    team = (await db.select({ name: timeActivityUsers.name }).from(timeActivityUsers).orderBy(asc(timeActivityUsers.sort))).filter((t) => t.name?.trim());
    categories = (await db.select({ name: timeCategories.name }).from(timeCategories).orderBy(asc(timeCategories.sort))).map((c) => c.name).filter(Boolean);
  } catch {
    /* optional */
  }

  return (
    <>
      <AdminHeader title={row.name} description={[row.causeNumber, row.court].filter(Boolean).join("  ·  ") || "Pre-trial checklist"} />
      <div className="p-6 max-w-4xl space-y-5">
        <Link href="/admin/pre-trial" className="inline-flex items-center gap-1 text-sm text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]">
          <ChevronLeft size={15} /> All cases
        </Link>

        <PreTrialTabs caseId={row.id} />

        <div className="flex items-center gap-2 text-sm text-[var(--c-ink-muted)]">
          <Gavel size={15} className="text-[var(--c-accent)]" />
          {row.matter ? <span>Matter: <span className="text-[var(--c-ink)]">{row.matter}</span></span> : <span>No matter linked</span>}
        </div>

        <PreTrialCaseHeader
          id={row.id}
          initial={{
            name: row.name,
            matter: row.matter,
            causeNumber: row.causeNumber,
            court: row.court,
            trialDate: row.trialDate ?? "",
            pretrialDate: row.pretrialDate ?? "",
            notes: row.notes,
          }}
          matters={matters}
        />

        <PreTrialChecklist caseId={row.id} trialDate={row.trialDate} pretrialDate={row.pretrialDate} rows={rows} team={team} categories={categories} caseMatter={row.matter} />
      </div>
    </>
  );
}
