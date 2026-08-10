import { AdminHeader } from "@/components/admin/AdminShell";
import { PreTrialCases, type CaseRow } from "@/components/admin/PreTrialCases";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/db";
import { trialCases, trialDeadlines, timeMatters } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { urgencyOf } from "@/lib/pretrial/template";
import type { MatterOption } from "@/components/admin/MatterCombobox";

export const dynamic = "force-dynamic";

export default async function PreTrialPage() {
  await requireAdmin();

  let cases: CaseRow[] = [];
  let matters: MatterOption[] = [];
  let needsSync = false;

  if (db) {
    try {
      matters = (await db.select().from(timeMatters).orderBy(asc(timeMatters.sort))).map((m) => ({ displayNumber: m.displayNumber, description: m.description }));
    } catch {
      /* matters are optional here */
    }
    try {
      // Explicit columns so a newer column added later can't blank the list.
      const rows = await db
        .select({
          id: trialCases.id, name: trialCases.name, matter: trialCases.matter,
          causeNumber: trialCases.causeNumber, court: trialCases.court,
          trialDate: trialCases.trialDate, archived: trialCases.archived,
        })
        .from(trialCases);

      const deadlines = await db
        .select({ caseId: trialDeadlines.caseId, title: trialDeadlines.title, dueDate: trialDeadlines.dueDate, done: trialDeadlines.done })
        .from(trialDeadlines)
        .where(eq(trialDeadlines.done, false));

      cases = rows.map((c) => {
        const open = deadlines.filter((d) => d.caseId === c.id);
        const overdue = open.filter((d) => urgencyOf(d.dueDate) === "overdue").length;
        // Soonest dated open item — what the team should be working on next.
        const next = open
          .filter((d) => d.dueDate)
          .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : a.dueDate! > b.dueDate! ? 1 : 0))[0];
        return {
          ...c,
          openCount: open.length,
          overdueCount: overdue,
          nextTitle: next?.title ?? null,
          nextDate: next?.dueDate ?? null,
        };
      });
    } catch {
      needsSync = true;
    }
  }

  return (
    <>
      <AdminHeader
        title="Pre-Trial Deadlines"
        description="Checklists for cases heading to trial — set a trial date, generate the standard deadlines, and check them off. Sorted by urgency."
      />
      <div className="p-6 max-w-5xl">
        {needsSync && (
          <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            This feature needs its database tables. Go to <strong>Settings → Database updates</strong> and run it once, then reload this page.
          </p>
        )}
        <PreTrialCases cases={cases} matters={matters} />
      </div>
    </>
  );
}
