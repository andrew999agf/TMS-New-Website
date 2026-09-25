import { AdminHeader } from "@/components/admin/AdminShell";
import { CasesManager, type CaseRow } from "@/components/admin/CasesManager";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { db } from "@/db";
import { caseHub, timeMatters, type CaseParty } from "@/db/schema";
import { ensureDiscoveryTables } from "@/db/ensure";
import { asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { MatterOption } from "@/components/admin/MatterCombobox";

export const dynamic = "force-dynamic";

export default async function CasesPage() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/cases", session.role, session.permissions)) notFound();

  let cases: CaseRow[] = [];
  let matters: MatterOption[] = [];
  if (db) {
    await ensureDiscoveryTables();
    try {
      matters = (await db.select().from(timeMatters).orderBy(asc(timeMatters.sort))).map((m) => ({ displayNumber: m.displayNumber, description: m.description }));
    } catch { /* matters optional */ }
    try {
      cases = (await db.select().from(caseHub).orderBy(asc(caseHub.matter))).map((c) => ({
        id: c.id, matter: c.matter, name: c.name, causeNumber: c.causeNumber, court: c.court,
        parties: (c.parties as CaseParty[]) ?? [], archived: c.archived,
      }));
    } catch { /* table just created */ }
  }

  return (
    <>
      <AdminHeader
        title="Matters / Cases"
        description="The central case record. Type case information once here — the Pre-Trial Checklist, Discovery Reviewer, Exhibit Reviewer, and Share Folders all find it by the Time Tracker matter number."
      />
      <div className="p-6 max-w-5xl">
        <CasesManager cases={cases} matters={matters} />
      </div>
    </>
  );
}