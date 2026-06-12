import { AdminHeader } from "@/components/admin/AdminShell";
import { IntakeTable, type IntakeRow } from "@/components/admin/IntakeTable";
import { db } from "@/db";
import { intakeSubmissions } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function IntakeAdminPage() {
  let rows: IntakeRow[] = [];
  if (db) {
    try {
      const data = await db.select().from(intakeSubmissions).orderBy(desc(intakeSubmissions.createdAt));
      rows = data.map((r) => ({
        id: r.id,
        branch: r.branch,
        practiceSlug: r.practiceSlug,
        name: r.name,
        email: r.email,
        phone: r.phone,
        county: r.county,
        isUrgent: r.isUrgent,
        deadline: r.deadline,
        status: r.status as IntakeRow["status"],
        createdAt: r.createdAt.toISOString(),
        answers: (r.answers as Record<string, unknown>) ?? {},
      }));
    } catch {
      rows = [];
    }
  }

  return (
    <>
      <AdminHeader
        title="Intake"
        description="Consultation requests. Filter, update status, and export."
      />
      <div className="p-8">
        <IntakeTable rows={rows} />
      </div>
    </>
  );
}
